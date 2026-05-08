import type { ProjectDto } from "../api.ts";

export function EmptyState({ project }: { project: ProjectDto }) {
  return (
    <div className="empty">
      <h2>An empty board, by design.</h2>
      <p>
        fulcrum lives in <code style={{ fontFamily: "var(--font-mono)" }}>.fulcrum/</code>{" "}
        in this repo. Stories are markdown files; iterations are YAML. Git is the sync
        layer.
      </p>
      <div className="commands">
        <span className="prompt">$</span> fulcrum new feat &quot;Lexorank position-field repack&quot; --points 3{"\n"}
        <span style={{ color: "var(--type-feature)" }}>T-1001-XXXX</span> · feat · unstarted{"\n"}
        {"\n"}
        <span className="prompt">$</span> fulcrum start 1001{"\n"}
        <span style={{ color: "var(--ink-muted)" }}>T-1001-XXXX  unstarted → started</span>
      </div>
      <p style={{ marginTop: 24, fontSize: 12, color: "var(--ink-muted)" }}>
        Project: <strong style={{ color: "var(--ink-primary)" }}>{project.name}</strong>{" "}
        · iteration {project.current_iteration} · velocity {project.velocity} pts
      </p>
    </div>
  );
}
