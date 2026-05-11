import { err, ok, type FulcrumError, type Result } from "./result.ts";
import type { IterationRecord, Project } from "./schemas/project.ts";
import type { Story, StoryFrontmatter } from "./schemas/story.ts";
import { transition } from "./state-machine.ts";

/**
 * Iteration close ritual — PT's signature emotional moment.
 *
 * Mechanically:
 *
 *   1. For each id in `acceptedIds` whose story is in `delivered`, transition
 *      to `accepted`. The transition stamps `accepted_at` (now). Stories
 *      already accepted are no-ops.
 *   2. For each accepted story whose `accepted_at` falls in the closing
 *      window [iteration_start_date, today] AND that does not already have an
 *      `iteration` field, stamp `iteration: closing_number`. This is the
 *      moment the story becomes historical: the field is immutable from here
 *      forward, and the story moves to the Done column (deriveColumns).
 *   3. velocity_actual = sum of points of stories stamped with the closing
 *      iteration. This includes both newly-accepted-in-close and ad-hoc
 *      accepted stories from earlier in the window.
 *   4. Push a record into `project.iteration_history` for the closing window:
 *      `{ number, start_date, end_date: today, velocity: velocity_actual }`.
 *   5. Advance: `current_iteration += 1`, `iteration_start_date = today`.
 *   6. Recompute `project.velocity` as the rolling-3 average over the most
 *      recent entries in `iteration_history`.
 *
 * "Spilled" stories — delivered/started/finished that were not accepted —
 * keep their state. Their `accepted_at` is unset, so they're not attributed
 * to the closing iteration; they continue into the next.
 */

export type CloseIterationInput = {
  project: Project;
  /** Every story currently on disk. Pure function; we don't read from disk here. */
  stories: Story[];
  /** Story IDs the user marked accepted in the close panel. */
  acceptedIds: string[];
};

export type CloseIterationResult = {
  /** Updated project: bumped current_iteration, advanced start_date, history pushed, velocity recomputed. */
  project: Project;
  /** Stories that changed in this close (newly-accepted plus any newly stamped with `iteration: N`). */
  changed: Story[];
  /** Sum of points of stories stamped with the closing iteration. */
  velocity_actual: number;
  /** Stories that were eligible (delivered/started/finished, not iceboxed) but not accepted. */
  spilled: Story[];
};

const ROLLING_WINDOW = 3;

export function closeIteration(
  input: CloseIterationInput,
): Result<CloseIterationResult, FulcrumError> {
  const { project, stories, acceptedIds } = input;
  const closing = project.current_iteration;
  const acceptedSet = new Set(acceptedIds);
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = project.iteration_start_date;

  const byId = new Map<string, Story>();
  for (const s of stories) byId.set(s.frontmatter.id, s);

  // Pass 1: transition delivered → accepted for each requested id.
  const transitioned = new Map<string, StoryFrontmatter>();
  const seen = new Set<string>();

  for (const id of acceptedSet) {
    if (seen.has(id)) continue;
    seen.add(id);
    const story = byId.get(id);
    if (!story) {
      return err({
        kind: "NOT_FOUND",
        message: `cannot accept ${id}: not found in story set`,
      });
    }
    if (story.frontmatter.state === "accepted") {
      // Already accepted (e.g. ad-hoc chore accept earlier in the iteration).
      // No-op for state, but it still flows through pass 2 for stamping.
      continue;
    }
    const result = transition(story.frontmatter, { kind: "accept" });
    if (!result.ok) return result;
    transitioned.set(id, result.value);
  }

  // Pass 2: stamp `iteration: closing` on every accepted story whose
  // accepted_at falls in the closing window AND lacks the iteration field.
  // The stamp is immutable — once set, never overwritten.
  const changed: Story[] = [];
  for (const s of stories) {
    const fm = transitioned.get(s.frontmatter.id) ?? s.frontmatter;
    if (fm.state !== "accepted") continue;

    const at = fm.accepted_at;
    if (at === undefined) continue;
    const day = at.slice(0, 10);
    const inWindow = day >= windowStart && day <= today;
    if (!inWindow) continue;
    if (fm.iteration !== undefined) continue; // already stamped, leave it

    const stamped: StoryFrontmatter = { ...fm, iteration: closing };
    changed.push({ frontmatter: stamped, body: s.body });
  }

  // Any transitioned-but-not-stamped (accepted_at out of window — shouldn't
  // happen since transition stamps `now`, but be defensive) still goes in
  // `changed` because the state changed.
  for (const [id, fm] of transitioned) {
    if (changed.some((c) => c.frontmatter.id === id)) continue;
    const original = byId.get(id)!;
    changed.push({ frontmatter: fm, body: original.body });
  }

  // velocity_actual: sum points of stories that ended up stamped with the
  // closing iteration.
  const velocity_actual = changed.reduce((sum, s) => {
    if (s.frontmatter.iteration !== closing) return sum;
    return sum + (s.frontmatter.points ?? 0);
  }, 0);

  const newRecord: IterationRecord = {
    number: closing,
    start_date: windowStart,
    end_date: today,
    velocity: velocity_actual,
  };
  const newHistory = [...project.iteration_history, newRecord];

  // Spilled: any story not stamped this close that's still in active state
  // (started/finished/delivered/unstarted). Iceboxed and terminal-accepted/
  // rejected stories are not spilled.
  const stampedIds = new Set(changed.map((c) => c.frontmatter.id));
  const spilled: Story[] = [];
  for (const s of stories) {
    if (stampedIds.has(s.frontmatter.id)) continue;
    const fm = s.frontmatter;
    if (fm.icebox) continue;
    if (fm.iteration !== undefined) continue; // already in done
    if (fm.state === "accepted" || fm.state === "rejected") continue;
    spilled.push(s);
  }

  const newProject: Project = {
    ...project,
    current_iteration: closing + 1,
    iteration_start_date: today,
    iteration_history: newHistory,
    velocity: rollingVelocityFromHistory(newHistory, { windowSize: ROLLING_WINDOW }),
  };

  return ok({
    project: newProject,
    changed,
    velocity_actual,
    spilled,
  });
}

export type RollingVelocityOptions = {
  /** Number of most recent closed iterations to average. Default 3. */
  windowSize?: number;
};

/**
 * Rolling-average velocity over the most recent `windowSize` iteration history
 * records. Returns 0 when no closed iterations exist.
 */
export function rollingVelocityFromHistory(
  history: readonly IterationRecord[],
  opts: RollingVelocityOptions = {},
): number {
  const windowSize = opts.windowSize ?? ROLLING_WINDOW;
  if (history.length === 0) return 0;
  const recent = history.slice(-windowSize);
  const sum = recent.reduce((acc, r) => acc + r.velocity, 0);
  return Math.round(sum / recent.length);
}

/**
 * Stories the close panel offers for accept/unaccept selection: in-flight
 * (no `iteration` stamped) stories not in the icebox that are in `delivered`
 * state — ready to be accepted.
 */
export function deliverableStoriesForClose(stories: Story[]): Story[] {
  return stories.filter(
    (s) =>
      !s.frontmatter.icebox &&
      s.frontmatter.iteration === undefined &&
      s.frontmatter.state === "delivered",
  );
}
