import { err, ok, type FulcrumError, type Result } from "./result.ts";
import type { IterationRecord, Project } from "./schemas/project.ts";
import type { Story, StoryFrontmatter } from "./schemas/story.ts";
import { transition } from "./state-machine.ts";

/**
 * Iteration close ritual — PT's signature emotional moment.
 *
 * Mechanically (post-refactor: stories no longer carry `iteration: N`):
 *
 *   1. For each id in `acceptedIds` whose story is in `delivered`, transition
 *      to `accepted`. The transition stamps `accepted_at` (now). Stories
 *      already accepted are no-ops.
 *   2. velocity_actual = sum of points of stories whose `accepted_at` falls
 *      within the closing window [iteration_start_date, today). This sweeps
 *      up chores accepted ad-hoc during the iteration alongside the just-
 *      accepted features.
 *   3. Push a record into `project.iteration_history` for the closing window:
 *      `{ number, start_date, end_date: today, velocity: velocity_actual }`.
 *   4. Advance: `current_iteration += 1`, `iteration_start_date = today`.
 *   5. Recompute `project.velocity` as the rolling-3 average over the most
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
  /** Stories that changed state in this close (newly-accepted only). */
  changed: Story[];
  /** Sum of points of all stories whose accepted_at fell in the closing window. */
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

  const byId = new Map<string, Story>();
  for (const s of stories) byId.set(s.frontmatter.id, s);

  const changed: Story[] = [];
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
      // No-op — accepted_at is already set, will be counted in velocity below.
      continue;
    }
    const result = transition(story.frontmatter, { kind: "accept" });
    if (!result.ok) return result;
    changed.push({ frontmatter: result.value, body: story.body });
  }

  // Build the post-close projection so velocity_actual reflects the just-accepted
  // changes, not the pre-close state.
  const postClose = stories.map((s) => {
    const replacement = changed.find((c) => c.frontmatter.id === s.frontmatter.id);
    return replacement ?? s;
  });

  // velocity_actual: sum points of stories whose accepted_at falls in the
  // closing window [iteration_start_date, today]. We use date-only comparison
  // (slice the timestamp) so a story accepted any time today still counts.
  const windowStart = project.iteration_start_date;
  const velocity_actual = postClose.reduce((sum, s) => {
    if (s.frontmatter.state !== "accepted") return sum;
    const at = s.frontmatter.accepted_at;
    if (at === undefined) return sum;
    const day = at.slice(0, 10);
    if (day < windowStart) return sum;
    return sum + (s.frontmatter.points ?? 0);
  }, 0);

  const newRecord: IterationRecord = {
    number: closing,
    start_date: windowStart,
    end_date: today,
    velocity: velocity_actual,
  };
  const newHistory = [...project.iteration_history, newRecord];

  const spilled: Story[] = [];
  for (const s of postClose) {
    const fm = s.frontmatter;
    if (fm.icebox) continue;
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
 * Stories the close panel offers for accept/unaccept selection: delivered
 * stories not in the icebox. After the refactor (no `iteration` field on
 * stories) this is just a state filter.
 */
export function deliverableStoriesForClose(stories: Story[]): Story[] {
  return stories.filter(
    (s) => !s.frontmatter.icebox && s.frontmatter.state === "delivered",
  );
}
