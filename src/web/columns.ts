import type { ProjectDto, StoryDto } from "./api.ts";

export type Column = "current" | "backlog" | "icebox" | "done";

export type ColumnMap = Record<Column, StoryDto[]>;

/**
 * Column derivation — corrected mental model:
 *
 *   - `done`    = stories with `iteration` field stamped (a closed iteration)
 *   - `icebox`  = stories with `icebox: true`
 *   - `current` = stories with state in {started, finished, delivered}
 *                 — i.e. work that's *in flight*. PT-style "what am I on right now."
 *   - `backlog` = stories with state in {unstarted, rejected}
 *                 — not yet begun (rejected is reusable; restart drops it back here).
 *
 * Velocity is NOT a column-slicer; it's a pace metric (rolling avg of past
 * closed iterations) shown in the header for planning judgement, but the
 * board layout is determined by *story state*, not by some computed cap.
 *
 * Within each column, stories are ordered by their Lexorank `position` field.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function deriveColumns(stories: StoryDto[], _project: ProjectDto): ColumnMap {
  const current: StoryDto[] = [];
  const backlog: StoryDto[] = [];
  const icebox: StoryDto[] = [];
  const done: StoryDto[] = [];

  for (const s of stories) {
    if (s.iteration !== undefined) {
      done.push(s);
      continue;
    }
    if (s.icebox) {
      icebox.push(s);
      continue;
    }
    if (s.state === "started" || s.state === "finished" || s.state === "delivered") {
      current.push(s);
      continue;
    }
    // unstarted, rejected → backlog
    backlog.push(s);
  }

  const byPosition = (a: StoryDto, b: StoryDto) => (a.position < b.position ? -1 : 1);
  current.sort(byPosition);
  backlog.sort(byPosition);
  icebox.sort(byPosition);
  // Done is sorted by iteration (most recent first) so the most-recent close lands at the top.
  done.sort((a, b) => (b.iteration ?? 0) - (a.iteration ?? 0));

  return { current, backlog, icebox, done };
}
