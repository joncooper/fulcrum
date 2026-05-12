import type { ProjectDto, StoriesResponse } from "../api.ts";

/**
 * PT-style left sidebar (dark navy). Project header at top, Add Story
 * button, then nav rail for the M1 columns + future-reserved labels.
 *
 * Items wired to existing features get click handlers; the rest are
 * visual-only landmarks so the chrome reads like classic PT. As Done /
 * Blocked / Epics / Labels / History ship, plumb them here.
 */
export function Sidebar({
  project,
  stories,
  onNewStory,
  readOnly = false,
}: {
  project: ProjectDto;
  stories: StoriesResponse;
  onNewStory?: () => void;
  readOnly?: boolean;
}) {
  // Counts for nav badges — derived from current stories.
  const inFlight = stories.stories.filter(
    (s) => s.iteration === undefined && !s.icebox,
  ).length;
  const inIcebox = stories.stories.filter((s) => s.icebox).length;
  const inDone = stories.stories.filter((s) => s.iteration !== undefined).length;
  const malformed = stories.malformed.length;

  return (
    <aside className="sidebar" aria-label="Project navigation">
      <div className="sidebar-project">
        <span className="sidebar-project-name">{project.name}</span>
        <span className="sidebar-project-chevron" aria-hidden>
          ▾
        </span>
      </div>

      <div className="sidebar-meta">
        <span className="sidebar-meta-item" title="Current iteration">
          <span className="sidebar-meta-icon" aria-hidden>
            ⟳
          </span>
          {project.current_iteration}
        </span>
        <span className="sidebar-meta-item" title="Velocity">
          <span className="sidebar-meta-icon" aria-hidden>
            ⚡
          </span>
          {project.velocity}
        </span>
      </div>

      <button
        type="button"
        className="sidebar-add-story"
        onClick={onNewStory}
        disabled={readOnly || !onNewStory}
      >
        <span aria-hidden>+</span> Add Story
      </button>

      <nav className="sidebar-nav" role="navigation">
        <SidebarLink label="My Work" badge={null} disabled />
        <SidebarLink label="Current/Backlog" badge={inFlight} active />
        <SidebarLink label="Icebox" badge={inIcebox} />
        <SidebarLink label="Done" badge={inDone} />
        <SidebarLink label="Epics" badge={null} disabled />
        <SidebarLink label="Labels" badge={null} disabled />
        <SidebarLink label="Project History" badge={null} disabled />
        {malformed > 0 && (
          <SidebarLink label="Needs attention" badge={malformed} warn />
        )}
      </nav>
    </aside>
  );
}

function SidebarLink({
  label,
  badge,
  active = false,
  disabled = false,
  warn = false,
}: {
  label: string;
  badge: number | null;
  active?: boolean;
  disabled?: boolean;
  warn?: boolean;
}) {
  return (
    <span
      className={`sidebar-link${active ? " is-active" : ""}${
        disabled ? " is-disabled" : ""
      }${warn ? " is-warn" : ""}`}
    >
      <span className="sidebar-link-label">{label}</span>
      {badge !== null && <span className="sidebar-link-badge">{badge}</span>}
    </span>
  );
}
