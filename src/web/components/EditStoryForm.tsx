import { useEffect, useRef, useState } from "react";
import type { StoryDto, StoryPatch } from "../api.ts";

const TYPES: StoryDto["type"][] = ["feature", "bug", "chore", "release"];
const POINTS: (number | null)[] = [null, 0, 1, 2, 3, 5, 8];

/**
 * Inline editor for a story's editable fields. Title splices into the H1 of
 * body; description is everything after the H1 (preserved blank line between).
 *
 * Save sends only the fields that actually changed so unrelated optimistic
 * cache state isn't disturbed.
 */
export function EditStoryForm({
  story,
  onSave,
  onCancel,
  saving,
}: {
  story: StoryDto;
  onSave: (patch: StoryPatch) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const initialDescription = bodyWithoutTitle(story.body);
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(initialDescription);
  const [type, setType] = useState<StoryDto["type"]>(story.type);
  const [points, setPoints] = useState<number | null>(story.points ?? null);
  const [labels, setLabels] = useState(story.labels.join(", "));
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const submit = () => {
    if (saving) return;
    const patch: StoryPatch = {};
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) return;
    if (trimmedTitle !== story.title) patch.title = trimmedTitle;
    if (description !== initialDescription) {
      patch.body = `# ${trimmedTitle}\n${description.length > 0 ? "\n" + description : ""}`;
      // body wins over title on the server, so don't send a redundant title field
      delete patch.title;
    }
    if (type !== story.type) patch.type = type;
    if (points !== (story.points ?? null)) patch.points = points;
    const labelArr = labels
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!sameLabels(labelArr, story.labels)) patch.labels = labelArr;
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    onSave(patch);
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
    <div className="edit-form" onKeyDown={handleKeyDown}>
      <div className="edit-row">
        <label className="edit-label">title</label>
        <input
          ref={titleRef}
          className="edit-input edit-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Story title"
        />
      </div>
      <div className="edit-row">
        <label className="edit-label">type</label>
        <select
          className="edit-input"
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
        <label className="edit-label">labels</label>
        <input
          className="edit-input"
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          placeholder="comma,separated"
          aria-label="Story labels"
        />
      </div>
      <div className="edit-row edit-row-stretch">
        <label className="edit-label">description</label>
        <textarea
          className="edit-input edit-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          aria-label="Story description"
        />
      </div>
      <div className="edit-actions">
        <button className="action-btn" onClick={submit} disabled={saving}>
          {saving ? "saving…" : "save"}
        </button>
        <button className="action-btn" onClick={onCancel} disabled={saving}>
          cancel
        </button>
        <span className="expanded-hint">⌘↵ to save · esc to cancel</span>
      </div>
    </div>
  );
}

function bodyWithoutTitle(body: string): string {
  const nl = body.indexOf("\n");
  if (nl === -1) return "";
  // Skip the H1 line and one optional blank separator.
  const rest = body.slice(nl + 1);
  return rest.replace(/^\n/, "");
}

function sameLabels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
