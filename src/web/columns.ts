import type { ProjectDto, StoryDto } from "./api.ts";

export type Column = "current" | "backlog" | "icebox";

export type ColumnMap = Record<Column, StoryDto[]>;

/**
 * Column derivation — time-window model.
 *
 *   - `icebox`  = stories with `icebox: true`
 *   - `current` = in-flight (started/finished/delivered) PLUS stories that
 *                 were accepted within the current iteration window
 *                 (`accepted_at >= project.iteration_start_date`). Accepted
 *                 stories carry a visual distinction in the row but live in
 *                 Current alongside the in-flight work — vintage PT idiom.
 *   - `backlog` = unstarted, plus rejected (re-bound for restart) — and any
 *                 stories accepted in a *prior* iteration window are NOT
 *                 shown on the active board (they belong to history).
 *
 * There is no `iteration` field on stories. An iteration is a time window
 * `[iteration_start_date, end)`; a story is "in" iteration N iff its
 * `accepted_at` falls in that window.
 *
 * Within each column, stories are ordered by Lexorank `position`.
 */
export function deriveColumns(stories: StoryDto[], project: ProjectDto): ColumnMap {
  const current: StoryDto[] = [];
  const backlog: StoryDto[] = [];
  const icebox: StoryDto[] = [];
  const windowStart = project.iteration_start_date;

  for (const s of stories) {
    if (s.icebox) {
      icebox.push(s);
      continue;
    }
    if (s.state === "accepted") {
      // Belongs to the current iteration window? Show in Current.
      // Belongs to a prior window? Hidden from active board (would be a
      // historical iteration view in M2).
      if (s.accepted_at !== undefined && s.accepted_at.slice(0, 10) >= windowStart) {
        current.push(s);
      }
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

  return { current, backlog, icebox };
}
