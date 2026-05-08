import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useCloseIteration,
  useProject,
  useSseInvalidator,
  useStories,
  useTransitionStory,
  type IterationClosedEvent,
  type TransitionVerb,
} from "./api.ts";
import { Board } from "./components/Board.tsx";
import { IterationClosePanel } from "./components/IterationClosePanel.tsx";
import { useKeyboard, type FocusState } from "./keyboard.ts";
import { deriveColumns } from "./columns.ts";

const THEME_KEY = "fulcrum-theme";
const ITERATION_CLOSE_MS = 400;

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
  const closeIter = useCloseIteration();
  const [focus, setFocus] = useState<FocusState>({ focusedId: null, expandedId: null });
  const [panelOpen, setPanelOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [lastClosed, setLastClosed] = useState<IterationClosedEvent | null>(null);

  const handleIterationClosed = useCallback((event: IterationClosedEvent) => {
    setLastClosed(event);
    setClosing(true);
    setPanelOpen(false);
    window.setTimeout(() => setClosing(false), ITERATION_CLOSE_MS);
  }, []);

  useSseInvalidator({ onIterationClosed: handleIterationClosed });

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

  // Disable the board-level keyboard shortcuts while the close panel is up;
  // the panel installs its own handlers.
  useKeyboard({
    stories: flat,
    focus,
    setFocus,
    onTransition: handleTransition,
    enabled: !panelOpen,
  });

  // Listen for the panel-open keybind ('I' = shift+i) and the close mutation.
  useEffect(() => {
    if (panelOpen) return;
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target;
      if (
        tgt instanceof HTMLInputElement ||
        tgt instanceof HTMLTextAreaElement ||
        (tgt instanceof HTMLElement && tgt.isContentEditable)
      ) {
        return;
      }
      if (e.key === "I" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPanelOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panelOpen]);

  // If the focused story disappears (e.g. moved to a column we don't display),
  // clear focus so the next j/k starts from the top.
  useEffect(() => {
    if (focus.focusedId && !flat.some((s) => s.id === focus.focusedId)) {
      setFocus({ focusedId: null, expandedId: null });
    }
  }, [flat, focus.focusedId]);

  const handleCommitClose = useCallback(
    (acceptedIds: string[]) => {
      closeIter.mutate({ acceptedIds });
    },
    [closeIter],
  );

  if (project.isPending || stories.isPending) {
    return (
      <>
        <Header
          projectName="…"
          iteration="…"
          velocity="…"
          theme={theme}
          onToggleTheme={toggle}
          onClickIteration={() => undefined}
        />
        <div className="loading">loading…</div>
        <StatusBar />
      </>
    );
  }

  if (project.error || stories.error) {
    return (
      <>
        <Header
          projectName="!"
          iteration="error"
          velocity="—"
          theme={theme}
          onToggleTheme={toggle}
          onClickIteration={() => undefined}
        />
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
        onClickIteration={() => setPanelOpen(true)}
      />
      <div className="board-shell" data-closing={closing ? "true" : undefined}>
        <Board
          stories={stories.data}
          project={project.data}
          focus={focus}
          setFocus={setFocus}
          onTransition={handleTransition}
        />
        {panelOpen && (
          <IterationClosePanel
            stories={stories.data}
            project={project.data}
            onCommit={handleCommitClose}
            onCancel={() => setPanelOpen(false)}
            isCommitting={closeIter.isPending}
          />
        )}
      </div>
      <StatusBar
        ritualNote={
          lastClosed && closing
            ? `Iteration ${lastClosed.closed_iteration} closed · ${lastClosed.velocity_actual} pts · pace ${lastClosed.velocity_next}`
            : null
        }
      />
    </>
  );
}

function Header({
  projectName,
  iteration,
  velocity,
  theme,
  onToggleTheme,
  onClickIteration,
}: {
  projectName: string;
  iteration: string;
  velocity: string;
  theme: "day" | "dark";
  onToggleTheme: () => void;
  onClickIteration: () => void;
}) {
  return (
    <header className="app-header">
      <span className="brand">{projectName}</span>
      <button
        type="button"
        className="iter iter-button"
        onClick={onClickIteration}
        title="Close iteration (I)"
      >
        {iteration}
      </button>
      <span className="vel">{velocity}</span>
      <button className="theme-toggle" onClick={onToggleTheme} aria-label="Toggle theme">
        {theme === "day" ? "dark" : "day"}
      </button>
    </header>
  );
}

function StatusBar({ ritualNote }: { ritualNote?: string | null } = {}) {
  if (ritualNote) {
    return (
      <footer className="status-bar status-bar-ritual">
        <span>{ritualNote}</span>
      </footer>
    );
  }
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
      <span>I</span>
      <span>close iteration</span>
      <span className="sep">·</span>
      <span>esc</span>
      <span>collapse</span>
      <span style={{ marginLeft: "auto", color: "var(--ink-muted)" }}>E2</span>
    </footer>
  );
}
