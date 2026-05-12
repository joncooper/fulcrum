import { useEffect, useRef, useState } from "react";
import type { CreateStoryInput, StoryDto } from "../api.ts";

const TYPES: StoryDto["type"][] = ["feature", "bug", "chore", "release"];
const POINTS: (number | null)[] = [null, 0, 1, 2, 3, 5, 8];

/**
 * Inline create form. Renders at the top of the Backlog column when the user
 * presses `n`. ⌘↵ submits, esc cancels. Title is required; points required
 * for feature; bug/chore/release ignore points.
 */
export function NewStoryForm({
  onCreate,
  onCancel,
  saving,
}: {
  onCreate: (input: CreateStoryInput) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [type, setType] = useState<StoryDto["type"]>("feature");
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState<number | null>(1);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // The form is invalid in three cases: no title, feature with no points,
  // or already saving. The button mirrors these so the user can never click
  // it and get silent rejection (the actual cause of "stuck create" reports —
  // clicking did nothing visible because submit() short-circuited).
  const titleEmpty = title.trim().length === 0;
  const featureMissingPoints = type === "feature" && points === null;
  const invalid = titleEmpty || featureMissingPoints;

  const submit = () => {
    if (saving || invalid) return;
    onCreate({
      type,
      title: title.trim(),
      ...(type === "feature" && points !== null ? { points } : {}),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      submit();
    }
  };

  return (
    <div className="edit-form new-form" onKeyDown={handleKeyDown}>
      <div className="edit-row">
        <label className="edit-label">type</label>
        <select
          className="edit-input edit-input-narrow"
          value={type}
          onChange={(e) => setType(e.target.value as StoryDto["type"])}
          aria-label="Story type"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="edit-label edit-label-inline">points</label>
        <select
          className="edit-input edit-input-narrow"
          value={points === null ? "" : String(points)}
          onChange={(e) => setPoints(e.target.value === "" ? null : Number(e.target.value))}
          disabled={type !== "feature"}
          aria-label="Story points"
        >
          {POINTS.map((p) => (
            <option key={String(p)} value={p === null ? "" : String(p)}>
              {p === null ? "—" : String(p)}
            </option>
          ))}
        </select>
      </div>
      <div className="edit-row">
        <label className="edit-label">title</label>
        <input
          ref={titleRef}
          className="edit-input edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What does the user want to do?"
          aria-label="Story title"
        />
      </div>
      <div className="edit-actions">
        <button className="action-btn" onClick={submit} disabled={saving || invalid}>
          {saving ? "creating…" : "create"}
        </button>
        {/*
          Cancel is ALWAYS clickable, even mid-save. If the network is slow or
          a request is hung, the user needs an escape hatch — otherwise the
          form sits stuck at "creating…" indefinitely. The in-flight mutation
          continues in the background; on success the new story shows up via
          SSE invalidation, on error the toast surfaces.
        */}
        <button className="action-btn" onClick={onCancel}>
          cancel
        </button>
        <span className="expanded-hint">
          {featureMissingPoints
            ? "feature stories need points"
            : titleEmpty
              ? "title required"
              : "⌘↵ to create · esc to cancel"}
        </span>
      </div>
    </div>
  );
}
