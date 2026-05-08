import { useMemo } from "react";
import type { ProjectDto, StoryDto } from "../api.ts";
import { deriveColumns, type Column } from "../columns.ts";
import { StoryRow } from "./StoryRow.tsx";
import { EmptyState } from "./EmptyState.tsx";

const COLUMN_LABELS: Record<Column, string> = {
  current: "Current",
  backlog: "Backlog",
  icebox: "Icebox",
  done: "Done",
};

const COLUMN_TINTS: Record<Column, string> = {
  current: "col-current",
  backlog: "col-backlog",
  icebox: "col-icebox",
  done: "col-done",
};

export function Board({
  stories,
  project,
}: {
  stories: StoryDto[];
  project: ProjectDto;
}) {
  const columns = useMemo(() => deriveColumns(stories, project), [stories, project]);

  if (stories.length === 0) {
    return (
      <div className="board">
        <div className="col col-current">
          <EmptyState project={project} />
        </div>
        <div className="col col-backlog" />
        <div className="col col-icebox" />
      </div>
    );
  }

  // M1 default layout: Current / Backlog / Icebox. Done is reachable later.
  const visible: Column[] = ["current", "backlog", "icebox"];
  return (
    <div className="board">
      {visible.map((c) => {
        const list = columns[c];
        const total = list.reduce((sum, s) => sum + (s.points ?? 0), 0);
        return (
          <div key={c} className={`col ${COLUMN_TINTS[c]}`}>
            <div className="col-header">
              {COLUMN_LABELS[c]}
              <span className="count">
                · {list.length} {list.length === 1 ? "story" : "stories"}
                {total > 0 ? ` · ${total} pts` : ""}
              </span>
            </div>
            <div className="stories">
              {list.length === 0 ? (
                <div style={{ padding: "12px", color: "var(--ink-muted)", fontSize: 12 }}>
                  (empty)
                </div>
              ) : (
                list.map((s) => <StoryRow key={s.id} story={s} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
