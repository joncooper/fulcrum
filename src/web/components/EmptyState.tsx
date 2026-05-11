import type { ProjectDto } from "../api.ts";

/**
 * First-run empty state — DESIGN.md / Journey A storyboard.
 *
 * Primary: headline + four example CLI commands rendered like terminal output.
 * Secondary: action buttons (`+ New story`, `Open docs`).
 * Tertiary: meta about where data lives.
 * No mascot. No illustration. No marketing copy.
 *
 * The `+ New story` action calls back to the App, which sets `creating: true`
 * (the same path `c` keybind triggers).
 */
export function EmptyState({
  project,
  onNew,
  onOpenDocs,
}: {
  project: ProjectDto;
  onNew?: () => void;
  onOpenDocs?: () => void;
}) {
  return (
    <div className="empty">
      <h2>An empty board, by design.</h2>
      <p>
        fulcrum lives in <code className="mono">.fulcrum/</code> in this repo.
        Stories are markdown files; iterations are YAML. Git is the sync layer.
      </p>
      <div className="commands">
        <span className="prompt">$</span> fulcrum new feature &quot;Lexorank position-field repack&quot; --points 3
        {"\n"}
        <span className="cmd-emph-feature">T-1001-XXXX</span> · feature · unstarted
        {"\n"}
        {"\n"}
        <span className="prompt">$</span> fulcrum start 1001
        {"\n"}
        <span className="cmd-emph-muted">T-1001-XXXX  unstarted → started</span>
        {"\n"}
        {"\n"}
        <span className="prompt">$</span> fulcrum list
        {"\n"}
        <span className="cmd-emph-muted">T-1001-XXXX  feature  started  Lexorank position-field repack</span>
        {"\n"}
        {"\n"}
        <span className="prompt">$</span> fulcrum show 1001
      </div>
      <div className="empty-actions">
        <button
          type="button"
          className="action-btn"
          onClick={() => onNew?.()}
          disabled={!onNew}
        >
          + New story
        </button>
        <button
          type="button"
          className="action-btn"
          onClick={() => onOpenDocs?.()}
          disabled={!onOpenDocs}
        >
          Open docs
        </button>
      </div>
      <p className="empty-meta">
        Project: <strong>{project.name}</strong> · iteration{" "}
        {project.current_iteration} · velocity {project.velocity} pts
      </p>
    </div>
  );
}
