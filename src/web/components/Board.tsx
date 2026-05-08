import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  CreateStoryInput,
  ProjectDto,
  StoryDto,
  StoryPatch,
  TransitionVerb,
} from "../api.ts";
import { useUpdateStoryPosition } from "../api.ts";
import { deriveColumns, type Column } from "../columns.ts";
import type { FocusState } from "../keyboard.ts";
import { computeBetween } from "../reorder.ts";
import { EditStoryForm } from "./EditStoryForm.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { ExpandedStory } from "./ExpandedStory.tsx";
import { NewStoryForm } from "./NewStoryForm.tsx";
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
  editingId,
  onEditCancel,
  onEditSave,
  editSaving,
  creating,
  onCreate,
  onCancelCreate,
  createSaving,
}: {
  stories: StoryDto[];
  project: ProjectDto;
  focus: FocusState;
  setFocus: (next: FocusState) => void;
  onTransition: (id: string, verb: TransitionVerb, reason?: string) => void;
  editingId: string | null;
  onEditCancel: () => void;
  onEditSave: (id: string, patch: StoryPatch) => void;
  editSaving: boolean;
  creating: boolean;
  onCreate: (input: CreateStoryInput) => void;
  onCancelCreate: () => void;
  createSaving: boolean;
}) {
  const columns = useMemo(() => deriveColumns(stories, project), [stories, project]);
  const updatePosition = useUpdateStoryPosition();

  // 5px activation distance: small movements register as click (expand);
  // larger movements start a drag. Lets one element be both clickable and
  // draggable without a separate drag handle.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Map story id → column key so onDragEnd can reject cross-column drops
  // (those imply state/icebox changes, scoped to T-1019/T-1021).
  const columnById = useMemo(() => {
    const map = new Map<string, Column>();
    for (const c of ["current", "backlog", "icebox"] as const) {
      for (const s of columns[c]) map.set(s.id, c);
    }
    return map;
  }, [columns]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const sourceCol = columnById.get(activeId);
    const destCol = columnById.get(overId);
    if (!sourceCol || !destCol || sourceCol !== destCol) return;

    const list = columns[sourceCol];
    const oldIdx = list.findIndex((s) => s.id === activeId);
    const overIdx = list.findIndex((s) => s.id === overId);
    if (oldIdx === -1 || overIdx === -1) return;

    const moved = list[oldIdx]!;
    const nextPos = computeBetween(list, oldIdx, overIdx);
    if (nextPos === null) return;

    updatePosition.mutate({ id: moved.id, position: nextPos, expectedHash: moved.hash });
  };

  if (stories.length === 0) {
    return (
      <div className="board">
        <div className="col col-current">
          <EmptyState project={project} />
        </div>
        <div className="col col-backlog">
          {creating && (
            <NewStoryForm
              onCreate={onCreate}
              onCancel={onCancelCreate}
              saving={createSaving}
            />
          )}
        </div>
        <div className="col col-icebox" />
      </div>
    );
  }

  const visible: Column[] = ["current", "backlog", "icebox"];
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
                {c === "backlog" && creating && (
                  <NewStoryForm
                    onCreate={onCreate}
                    onCancel={onCancelCreate}
                    saving={createSaving}
                  />
                )}
                <SortableContext
                  items={list.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {list.length === 0 ? (
                    <div style={{ padding: "12px", color: "var(--ink-muted)", fontSize: 12 }}>
                      {c === "backlog" && creating ? null : "(empty)"}
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
                        {focus.expandedId === s.id && editingId === s.id ? (
                          <EditStoryForm
                            story={s}
                            saving={editSaving}
                            onCancel={onEditCancel}
                            onSave={(patch) => onEditSave(s.id, patch)}
                          />
                        ) : focus.expandedId === s.id ? (
                          <ExpandedStory
                            story={s}
                            onTransition={(verb, reason) => onTransition(s.id, verb, reason)}
                          />
                        ) : null}
                      </div>
                    ))
                  )}
                </SortableContext>
              </div>
            </div>
          );
        })}
      </div>
    </DndContext>
  );
}
