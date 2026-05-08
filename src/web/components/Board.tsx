import { useMemo } from "react";
import type { ProjectDto, StoryDto, TransitionVerb } from "../api.ts";
import { deriveColumns, type Column } from "../columns.ts";
import type { FocusState } from "../keyboard.ts";
import { EmptyState } from "./EmptyState.tsx";
import { ExpandedStory } from "./ExpandedStory.tsx";
import { StoryRow } from "./StoryRow.tsx";

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
  focus,
  setFocus,
  onTransition,
}: {
  stories: StoryDto[];
  project: ProjectDto;
  focus: FocusState;
  setFocus: (next: FocusState) => void;
  onTransition: (id: string, verb: TransitionVerb, reason?: string) => void;
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
                list.map((s) => (
                  <div key={s.id}>
                    <StoryRow
                      story={s}
                      isFocused={focus.focusedId === s.id}
                      onClick={() => {
                        const expanded =
                          focus.focusedId === s.id && focus.expandedId === s.id
                            ? null
                            : s.id;
                        setFocus({ focusedId: s.id, expandedId: expanded });
                      }}
                    />
                    {focus.expandedId === s.id && (
                      <ExpandedStory
                        story={s}
                        onTransition={(verb, reason) => onTransition(s.id, verb, reason)}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
