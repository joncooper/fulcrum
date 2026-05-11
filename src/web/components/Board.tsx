import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useDroppable,
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
import { useUpdateStory, useUpdateStoryPosition } from "../api.ts";
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
  // M1 hides Done from the board (per DESIGN.md L176: "M2 may add a fourth
  // (Done) column toggle"). Stories with `iteration:N` stamped flow into the
  // done bucket and are not rendered as a visible column.
  done: "Done",
};

const COLUMN_TINTS: Record<Column, string> = {
  current: "col-current",
  backlog: "col-backlog",
  icebox: "col-icebox",
  done: "col-done",
};

/**
 * Wraps a column in a droppable target so drops anywhere in the column area
 * (not just on a specific row) resolve to that column. dnd-kit's `over.id`
 * is set to `col:<name>` when the user drops on the column body but outside
 * any row; handleDragEnd parses that prefix and appends the dragged story
 * to the end of the destination column.
 */
function ColumnDropZone({
  column,
  children,
}: {
  column: Column;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column}` });
  return (
    <div
      ref={setNodeRef}
      className={`col-dropzone${isOver ? " is-over" : ""}`}
    >
      {children}
    </div>
  );
}

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
  onStartCreate,
  createSaving,
  readOnly = false,
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
  /** Opens the inline create form (same path the `c` keybind triggers). */
  onStartCreate?: () => void;
  createSaving: boolean;
  /** When true, drag/drop is disabled and no edit/create surfaces render. */
  readOnly?: boolean;
}) {
  const columns = useMemo(() => deriveColumns(stories, project), [stories, project]);
  const updatePosition = useUpdateStoryPosition();
  const updateStory = useUpdateStory();

  // 5px activation distance: small movements register as click (expand);
  // larger movements start a drag. Lets one element be both clickable and
  // draggable without a separate drag handle.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // Map story id → column key so onDragEnd can detect cross-column drops.
  // Cross-column drag semantics:
  //   - current ↔ backlog: position-only change (deriveColumns reshuffles
  //     based on velocity projection; both columns are the same in-flight pool)
  //   - icebox → current/backlog: clear icebox=false + reposition
  //   - current/backlog → icebox: set icebox=true + reposition
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
    if (!sourceCol) return;

    const moved = columns[sourceCol].find((s) => s.id === activeId);
    if (!moved) return;

    // Determine the destination column. Two cases:
    //   - over.id is a story id → drop landed on a specific row in that column
    //   - over.id is "col:<name>" → drop landed on an empty/below-list column container
    let destCol: Column | null;
    let overStoryId: string | null = null;
    if (overId.startsWith("col:")) {
      destCol = overId.slice(4) as Column;
      if (!["current", "backlog", "icebox"].includes(destCol)) return;
    } else {
      destCol = columnById.get(overId) ?? null;
      overStoryId = overId;
    }
    if (!destCol) return;

    if (sourceCol === destCol) {
      // Same column: position-only reorder via the optimistic helper.
      const list = columns[sourceCol];
      const oldIdx = list.findIndex((s) => s.id === activeId);
      // If we dropped on the column container (no specific row), put it last.
      const overIdx = overStoryId === null
        ? list.length - 1
        : list.findIndex((s) => s.id === overStoryId);
      if (oldIdx === -1 || overIdx === -1) return;
      const nextPos = computeBetween(list, oldIdx, overIdx);
      if (nextPos === null) return;
      updatePosition.mutate({ id: moved.id, position: nextPos, expectedHash: moved.hash });
      return;
    }

    // Cross-column drop. Compute the new position relative to destination
    // column. Insert at the dropped-on row's position, or append to end if
    // the drop landed on the column container.
    const destList = columns[destCol];
    const overIdx =
      overStoryId === null
        ? destList.length // drop at end
        : destList.findIndex((s) => s.id === overStoryId);
    if (overIdx === -1) return;

    // Pretend `moved` is being inserted at `overIdx` of destList. Use
    // computeBetween on a synthetic list with the dragged story at that idx.
    const synthetic = [
      ...destList.slice(0, overIdx),
      moved,
      ...destList.slice(overIdx),
    ];
    const nextPos = computeBetween(synthetic, overIdx, overIdx);
    if (nextPos === null) return;

    const willIcebox = destCol === "icebox";
    const wasIcebox = sourceCol === "icebox";
    const patch: StoryPatch = { position: nextPos };
    if (willIcebox !== wasIcebox) patch.icebox = willIcebox;

    updateStory.mutate({ id: moved.id, patch, expectedHash: moved.hash });
  };

  if (stories.length === 0) {
    return (
      <div className="board">
        <div className="col col-current">
          {creating ? (
            <NewStoryForm
              onCreate={onCreate}
              onCancel={onCancelCreate}
              saving={createSaving}
            />
          ) : (
            <EmptyState
              project={project}
              onNew={readOnly ? undefined : onStartCreate}
            />
          )}
        </div>
        <div className="col col-backlog" />
        <div className="col col-icebox" />
      </div>
    );
  }

  const visible: Column[] = ["current", "backlog", "icebox"];
  // In read-only mode, render the board without DndContext so drag is
  // entirely disabled (no sensors, no listeners). Per DESIGN.md mobile is
  // expand-tap-allowed but no drag/edit/create.
  const body = (
    <div className="board">
      {visible.map((c) => {
          const list = columns[c];
          const total = list.reduce((sum, s) => sum + (s.points ?? 0), 0);
          return (
            <ColumnDropZone key={c} column={c}>
              <div className={`col ${COLUMN_TINTS[c]}`}>
              <div className="col-header">
                {COLUMN_LABELS[c]}
                <span className="count">
                  · {list.length} {list.length === 1 ? "story" : "stories"}
                  {total > 0 ? ` · ${total} pts` : ""}
                </span>
              </div>
              <div className="stories">
                {c === "current" && creating && !readOnly && (
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
                    <div className="col-empty-hint">
                      {c === "current" && creating && !readOnly ? null : "(empty)"}
                    </div>
                  ) : (
                    list.map((s) => (
                      <div key={s.id}>
                        <StoryRow
                          story={s}
                          isFocused={focus.focusedId === s.id}
                          isExpanded={focus.expandedId === s.id}
                          onClick={() => {
                            const expanded =
                              focus.focusedId === s.id && focus.expandedId === s.id
                                ? null
                                : s.id;
                            setFocus({ focusedId: s.id, expandedId: expanded });
                          }}
                        />
                        {focus.expandedId === s.id && editingId === s.id && !readOnly ? (
                          <EditStoryForm
                            story={s}
                            saving={editSaving}
                            onCancel={onEditCancel}
                            onSave={(patch) => onEditSave(s.id, patch)}
                          />
                        ) : focus.expandedId === s.id ? (
                          <ExpandedStory
                            story={s}
                            onTransition={
                              readOnly
                                ? () => undefined
                                : (verb, reason) => onTransition(s.id, verb, reason)
                            }
                          />
                        ) : null}
                      </div>
                    ))
                  )}
                </SortableContext>
              </div>
              </div>
            </ColumnDropZone>
          );
        })}
    </div>
  );

  if (readOnly) return body;
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {body}
    </DndContext>
  );
}
