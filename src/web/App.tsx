import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useProject,
  useSseInvalidator,
  useStories,
  useTransitionStory,
  type TransitionVerb,
} from "./api.ts";
import { Board } from "./components/Board.tsx";
import { useKeyboard, type FocusState } from "./keyboard.ts";
import { deriveColumns } from "./columns.ts";

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
  const transitionStory = useTransitionStory();
  const [focus, setFocus] = useState<FocusState>({ focusedId: null, expandedId: null });

  useSseInvalidator();

  // Flat ordered story list for j/k navigation: matches the column-derived
  // visual order so keyboard nav follows what the user sees.
  const flat = useMemo(() => {
    if (!stories.data || !project.data) return [];
    const cols = deriveColumns(stories.data, project.data);
    return [...cols.current, ...cols.backlog, ...cols.icebox];
  }, [stories.data, project.data]);

  const handleTransition = useCallback(
    (id: string, verb: TransitionVerb, reason?: string) => {
      transitionStory.mutate({ id, verb, reason });
    },
    [transitionStory],
  );

  useKeyboard({
    stories: flat,
    focus,
    setFocus,
    onTransition: handleTransition,
  });

  // If the focused story disappears (e.g. moved to a column we don't display),
  // clear focus so the next j/k starts from the top.
  useEffect(() => {
    if (focus.focusedId && !flat.some((s) => s.id === focus.focusedId)) {
      setFocus({ focusedId: null, expandedId: null });
    }
  }, [flat, focus.focusedId]);

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
      <Board
        stories={stories.data}
        project={project.data}
        focus={focus}
        setFocus={setFocus}
        onTransition={handleTransition}
      />
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
      <span>space</span>
      <span>expand</span>
      <span className="sep">·</span>
      <span>s/f/d/a</span>
      <span>start/finish/deliver/accept</span>
      <span className="sep">·</span>
      <span>r</span>
      <span>reject</span>
      <span className="sep">·</span>
      <span>esc</span>
      <span>collapse</span>
      <span style={{ marginLeft: "auto", color: "var(--ink-muted)" }}>E2</span>
    </footer>
  );
}
