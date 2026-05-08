import { err, ok, type FulcrumError, type Result } from "./result.ts";
import type { Project } from "./schemas/project.ts";
import type { Story, StoryFrontmatter } from "./schemas/story.ts";

/**
 * Iteration close ritual — PT's signature emotional moment.
 *
 * Mechanically:
 *   1. For each id in `acceptedIds` whose story is in `delivered`, transition to
 *      `accepted` and stamp `iteration: project.current_iteration` (the one
 *      being closed). Stamping is immutable — once a story has an `iteration`
 *      field, it's part of that closed iteration's `done` projection forever.
 *   2. Stories not accepted "spill" — they keep their state and have no
 *      `iteration` field, so the next iteration's projection re-slices them by
 *      velocity (started/finished/delivered stories all sit in the front of
 *      the projection, so they naturally land in the new Current).
 *   3. Increment `project.current_iteration`.
 *   4. Recompute `project.velocity` as the rolling average over the last 3
 *      closed iterations (including the one just closed).
 */

export type CloseIterationInput = {
  project: Project;
  /** Every story currently on disk. Pure function; we don't read from disk here. */
  stories: Story[];
  /** Story IDs the user marked accepted in the close panel. */
  acceptedIds: string[];
};

export type CloseIterationResult = {
  /** Updated project with bumped current_iteration + new velocity. */
  project: Project;
  /** Stories that changed (got iteration stamped + state transitioned). */
  changed: Story[];
  /** Sum of points of the just-closed iteration (the actual velocity for it). */
  velocity_actual: number;
  /** Stories from current projection that did NOT make it into the close. */
  spilled: Story[];
};

const ROLLING_WINDOW = 3;

export function closeIteration(
  input: CloseIterationInput,
): Result<CloseIterationResult, FulcrumError> {
  const { project, stories, acceptedIds } = input;
  const closing = project.current_iteration;
  const acceptedSet = new Set(acceptedIds);

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
    const fm = story.frontmatter;
    if (fm.state === "accepted" && fm.iteration === closing) {
      // Already accepted into this iteration — no-op (idempotent close).
      continue;
    }
    if (fm.state !== "delivered") {
      return err({
        kind: "INVALID_TRANSITION",
        message: `cannot accept ${id} into iteration ${closing}: state is ${fm.state}, expected delivered`,
      });
    }
    const next: StoryFrontmatter = { ...fm, state: "accepted", iteration: closing };
    changed.push({ frontmatter: next, body: story.body });
  }

  const closedPoints = changed.reduce(
    (sum, s) => sum + (s.frontmatter.points ?? 0),
    0,
  );

  // Spilled: stories that the panel WOULD have offered (current projection,
  // ie not iceboxed and not already in a closed iteration) but the user did
  // not accept. Used by the UI to phrase the spill summary; the domain layer
  // doesn't mutate them.
  const spilled: Story[] = [];
  for (const s of stories) {
    const fm = s.frontmatter;
    if (fm.icebox) continue;
    if (fm.iteration !== undefined) continue;
    if (acceptedSet.has(fm.id)) continue;
    if (fm.state === "accepted" || fm.state === "rejected") continue;
    spilled.push(s);
  }

  // Build the post-close story set for velocity recomputation.
  const postClose = stories.map((s) => {
    const replacement = changed.find((c) => c.frontmatter.id === s.frontmatter.id);
    return replacement ?? s;
  });
  const newVelocity = rollingVelocity(postClose, { windowSize: ROLLING_WINDOW });

  const newProject: Project = {
    ...project,
    current_iteration: closing + 1,
    velocity: newVelocity,
    // Roll the iteration window forward to today on close (PT-style: a fresh
    // iteration starts when you close the previous one).
    iteration_start_date: new Date().toISOString().slice(0, 10),
  };

  return ok({
    project: newProject,
    changed,
    velocity_actual: closedPoints,
    spilled,
  });
}

export type RollingVelocityOptions = {
  /** Number of most recent closed iterations to average. Default 3. */
  windowSize?: number;
};

/**
 * Compute the rolling-average velocity over the last N closed iterations.
 * "Closed iteration" = stories with an `iteration` field stamped.
 *
 * Returns `Math.round(avg)` so the stored project velocity is an integer
 * matching the schema constraint (z.number().int().nonnegative()).
 *
 * If zero closed iterations, returns 0. Caller may decide what to do with
 * that (UI shows "no historical pace yet").
 */
export function rollingVelocity(
  stories: Story[],
  opts: RollingVelocityOptions = {},
): number {
  const windowSize = opts.windowSize ?? ROLLING_WINDOW;
  const byIter = new Map<number, number>();
  for (const s of stories) {
    const it = s.frontmatter.iteration;
    if (it === undefined) continue;
    const points = s.frontmatter.points ?? 0;
    byIter.set(it, (byIter.get(it) ?? 0) + points);
  }
  if (byIter.size === 0) return 0;
  const recent = [...byIter.keys()].sort((a, b) => b - a).slice(0, windowSize);
  const sum = recent.reduce((acc, it) => acc + (byIter.get(it) ?? 0), 0);
  return Math.round(sum / recent.length);
}

/**
 * Stories that the close panel offers for accept/unaccept selection. These are
 * the stories in the *current* iteration projection that have already been
 * delivered. (Started/finished stories aren't ready to accept; they spill
 * automatically without UI action.)
 *
 * The UI uses this to populate the panel; tests assert it matches the design
 * plan's Journey C step 2.
 */
export function deliverableStoriesForClose(stories: Story[]): Story[] {
  return stories.filter(
    (s) =>
      !s.frontmatter.icebox &&
      s.frontmatter.iteration === undefined &&
      s.frontmatter.state === "delivered",
  );
}
