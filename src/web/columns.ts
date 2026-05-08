import type { ProjectDto, StoryDto } from "./api.ts";

export type Column = "current" | "backlog" | "icebox" | "done";

export type ColumnMap = Record<Column, StoryDto[]>;

/**
 * Column derivation per plan: iteration is a PROJECTION over velocity + position.
 *
 * - `done` = stories with `iteration` field set (accepted in a closed iteration)
 * - `icebox` = stories with `icebox: true`
 * - Of the rest, sliced by velocity:
 *     - `current` = first `velocity` points
 *     - `backlog` = the remainder
 *
 * Stories with no points (bug/chore/release) count as 0 and always fit.
 */
export function deriveColumns(stories: StoryDto[], project: ProjectDto): ColumnMap {
  const done: StoryDto[] = [];
  const icebox: StoryDto[] = [];
  const inProjection: StoryDto[] = [];

  for (const s of stories) {
    if (s.iteration !== undefined) done.push(s);
    else if (s.icebox) icebox.push(s);
    else inProjection.push(s);
  }
  inProjection.sort((a, b) => (a.position < b.position ? -1 : 1));
  done.sort((a, b) => (b.iteration ?? 0) - (a.iteration ?? 0));

  // Slice in-projection stream into current chunk by velocity.
  const velocity = project.velocity;
  const current: StoryDto[] = [];
  const backlog: StoryDto[] = [];
  if (velocity <= 0) {
    // No iteration capacity defined yet — treat everything as backlog so the
    // user's first interaction is "raise velocity to fill the current column."
    backlog.push(...inProjection);
  } else {
    let acc = 0;
    for (const s of inProjection) {
      const points = s.points ?? 0;
      if (acc + points <= velocity) {
        current.push(s);
        acc += points;
      } else {
        backlog.push(s);
      }
    }
  }

  return { current, backlog, icebox, done };
}
