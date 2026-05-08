import { useState, useEffect } from "react";
import { useProject, useStories } from "./api.ts";
import { Board } from "./components/Board.tsx";

const THEME_KEY = "fulcrum-theme";

function useTheme() {
  const [theme, setTheme] = useState<"day" | "dark">(() => {
    try {
      return (localStorage.getItem(THEME_KEY) as "day" | "dark" | null) ?? "day";
    } catch {
      return "day";
    }
  });

  useEffect(() => {
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "day" ? "dark" : "day")) };
}

export function App() {
  const project = useProject();
  const stories = useStories();
  const { theme, toggle } = useTheme();

  if (project.isPending || stories.isPending) {
    return (
      <>
        <Header projectName="…" iteration="…" velocity="…" theme={theme} onToggleTheme={toggle} />
        <div className="loading">loading…</div>
        <StatusBar />
      </>
    );
  }

  if (project.error || stories.error) {
    return (
      <>
        <Header projectName="!" iteration="error" velocity="—" theme={theme} onToggleTheme={toggle} />
        <div className="error">
          {(project.error ?? stories.error)?.message ?? "fetch failed"}
        </div>
        <StatusBar />
      </>
    );
  }

  return (
    <>
      <Header
        projectName={project.data.name}
        iteration={`Iteration ${project.data.current_iteration}`}
        velocity={`velocity ${project.data.velocity} pts`}
        theme={theme}
        onToggleTheme={toggle}
      />
      <Board stories={stories.data} project={project.data} />
      <StatusBar />
    </>
  );
}

function Header({
  projectName,
  iteration,
  velocity,
  theme,
  onToggleTheme,
}: {
  projectName: string;
  iteration: string;
  velocity: string;
  theme: "day" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <header className="app-header">
      <span className="brand">{projectName}</span>
      <span className="iter">{iteration}</span>
      <span className="vel">{velocity}</span>
      <button className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle theme">
        {theme === "day" ? "dark" : "day"}
      </button>
    </header>
  );
}

function StatusBar() {
  return (
    <footer className="status-bar">
      <span>j/k</span>
      <span>navigate</span>
      <span className="sep">·</span>
      <span>e</span>
      <span>edit</span>
      <span className="sep">·</span>
      <span>space</span>
      <span>expand</span>
      <span className="sep">·</span>
      <span>/</span>
      <span>search</span>
      <span className="sep">·</span>
      <span>?</span>
      <span>help</span>
      <span style={{ marginLeft: "auto", color: "var(--ink-muted)" }}>read-only · D2</span>
    </footer>
  );
}
