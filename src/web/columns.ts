import type { ProjectDto, StoryDto } from "./api.ts";

export type Column = "current" | "backlog" | "icebox" | "done";

export type ColumnMap = Record<Column, StoryDto[]>;

/**
 * Column derivation — velocity+position projection (canonical model).
 *
 *   - `done`    = stories with `iteration: N` field set (terminal: accepted in
 *                 a closed iteration). Removed from active projection.
 *   - `icebox`  = stories with `icebox: true` AND no `iteration` field.
 *   - `current` = projection chunk 0 — the first slice of the
 *                 non-done/non-icebox stream sorted by Lexorank `position`,
 *                 sliced into chunks summing to `project.velocity` points.
 *   - `backlog` = projection chunks 1+ — everything after the current slice.
 *
 * Behavior the user feels: change `project.velocity` and stories re-flow
 * live between current and backlog with no file rewrites. This is PT's
 * "what fits in the next iteration?" rendered as a projection.
 *
 * Accepted-not-yet-closed stories (state="accepted", no iteration) sit in
 * the projection at their position but contribute 0 points to chunk
 * capacity — they're "done as far as the user is concerned" but waiting
 * on close to be stamped. They show with the accepted row tint per T-1034.
 *
 * Edge cases:
 *   - velocity = 0 → no chunking happens; everything goes into current.
 *     (Rationale: a fresh project hasn't computed velocity yet; better to
 *     show all candidate stories than hide them.)
 *   - story with no points (chore/bug/release) contributes 0 to the chunk
 *     sum and flows through; it lands in whichever chunk its position
 *     places it in.
 */
export function deriveColumns(stories: StoryDto[], project: ProjectDto): ColumnMap {
  const done: StoryDto[] = [];
  const icebox: StoryDto[] = [];
  const active: StoryDto[] = [];

  for (const s of stories) {
    if (s.iteration !== undefined) {
      done.push(s);
      continue;
    }
    if (s.icebox) {
      icebox.push(s);
      continue;
    }
    active.push(s);
  }

  const byPosition = (a: StoryDto, b: StoryDto) => (a.position < b.position ? -1 : 1);
  active.sort(byPosition);
  icebox.sort(byPosition);
  done.sort(byPosition);

  const velocity = project.velocity;
  const current: StoryDto[] = [];
  const backlog: StoryDto[] = [];

  if (velocity <= 0) {
    // No projection yet — everything in current.
    current.push(...active);
  } else {
    // Slice into chunks of `velocity` points. Accepted-not-closed stories
    // contribute 0 points (they're effectively done, waiting on close).
    let runningSum = 0;
    let pastCurrent = false;
    for (const s of active) {
      const pts = s.state === "accepted" ? 0 : s.points ?? 0;
      // First chunk: keep adding until adding this story would exceed velocity.
      // We use "would exceed" so that capacity overflow is allowed by one story
      // (matches PT's "what fits in the iteration?" semantics — the iteration
      // budget is a target, not a hard cap).
      if (!pastCurrent && runningSum + pts > velocity && current.length > 0) {
        pastCurrent = true;
      }
      if (pastCurrent) {
        backlog.push(s);
      } else {
        current.push(s);
        runningSum += pts;
      }
    }
  }

  return { current, backlog, icebox, done };
}
