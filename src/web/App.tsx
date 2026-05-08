import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useCloseIteration,
  useCreateStory,
  useDeleteStory,
  useProject,
  useSseInvalidator,
  useStories,
  useTransitionStory,
  useUpdateStory,
  useUpdateStoryPosition,
  type CreateStoryInput,
  type IterationClosedEvent,
  type StoryPatch,
  type TransitionVerb,
} from "./api.ts";
import { computeBetween } from "./reorder.ts";
import { Board } from "./components/Board.tsx";
import { HelpOverlay } from "./components/HelpOverlay.tsx";
import { IterationClosePanel } from "./components/IterationClosePanel.tsx";
import { SearchBar, matchesQuery } from "./components/SearchBar.tsx";
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
  const updateStory = useUpdateStory();
  const createStory = useCreateStory();
  const deleteStory = useDeleteStory();
  const updatePosition = useUpdateStoryPosition();
  const closeIter = useCloseIteration();
  const [focus, setFocus] = useState<FocusState>({ focusedId: null, expandedId: null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
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

  // Apply search filter before deriving columns so j/k navigation only walks
  // matching stories.
  const filteredStories = useMemo(() => {
    if (!stories.data) return [];
    if (searchQuery === null || searchQuery.length === 0) return stories.data;
    return stories.data.filter((s) => matchesQuery(s, searchQuery));
  }, [stories.data, searchQuery]);

  // Flat ordered story list for j/k navigation: matches the column-derived
  // visual order so keyboard nav follows what the user sees.
  const cols = useMemo(() => {
    if (!project.data) return null;
    return deriveColumns(filteredStories, project.data);
  }, [filteredStories, project.data]);

  const flat = useMemo(() => {
    if (!cols) return [];
    return [...cols.current, ...cols.backlog, ...cols.icebox];
  }, [cols]);

  const handleTransition = useCallback(
    (id: string, verb: TransitionVerb, reason?: string) => {
      transitionStory.mutate({ id, verb, reason });
    },
    [transitionStory],
  );

  const handleStartEdit = useCallback((id: string) => {
    setEditingId(id);
    setFocus((prev) => ({ focusedId: id, expandedId: id }));
  }, []);

  const handleCancelEdit = useCallback(() => setEditingId(null), []);

  const handleCancelCreate = useCallback(() => setCreating(false), []);

  const handleMove = useCallback(
    (id: string, direction: "up" | "down") => {
      if (!cols) return;
      // Find which column owns this story.
      const colKey = (["current", "backlog", "icebox"] as const).find((c) =>
        cols[c].some((s) => s.id === id),
      );
      if (!colKey) return;
      const list = cols[colKey];
      const idx = list.findIndex((s) => s.id === id);
      const targetIdx = direction === "down" ? idx + 1 : idx - 1;
      if (targetIdx < 0 || targetIdx >= list.length) return;
      const nextPos = computeBetween(list, idx, targetIdx);
      if (nextPos === null) return;
      const story = list[idx]!;
      updatePosition.mutate({ id, position: nextPos, expectedHash: story.hash });
    },
    [cols, updatePosition],
  );

  const handleToggleIcebox = useCallback(
    (id: string) => {
      const story = flat.find((s) => s.id === id);
      if (!story) return;
      // Schema forbids icebox on terminal states (accepted, rejected) — skip
      // silently rather than firing a request that will 400.
      if (story.state === "accepted" || story.state === "rejected") return;
      updateStory.mutate({
        id,
        patch: { icebox: !story.icebox },
        expectedHash: story.hash,
      });
    },
    [flat, updateStory],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const story = flat.find((s) => s.id === id);
      if (!story) return;
      const ok = window.confirm(`Delete ${story.id} "${story.title}"?`);
      if (!ok) return;
      deleteStory.mutate(
        { id, expectedHash: story.hash },
        {
          onSuccess: () => {
            setFocus({ focusedId: null, expandedId: null });
            setEditingId(null);
          },
        },
      );
    },
    [flat, deleteStory],
  );

  const handleCreate = useCallback(
    (input: CreateStoryInput) => {
      createStory.mutate(input, {
        onSuccess: ({ story }) => {
          setCreating(false);
          setFocus({ focusedId: story.id, expandedId: null });
        },
      });
    },
    [createStory],
  );

  const handleSaveEdit = useCallback(
    (id: string, patch: StoryPatch) => {
      const story = flat.find((s) => s.id === id);
      updateStory.mutate(
        { id, patch, expectedHash: story?.hash },
        {
          onSuccess: () => setEditingId(null),
        },
      );
    },
    [flat, updateStory],
  );

  // Disable the board-level keyboard shortcuts while the close panel, an
  // edit form, or the new-story form is up; those install their own handlers.
  useKeyboard({
    stories: flat,
    focus,
    setFocus,
    onTransition: handleTransition,
    onEdit: handleStartEdit,
    onDelete: handleDelete,
    onToggleIcebox: handleToggleIcebox,
    onMove: handleMove,
    enabled:
      !panelOpen &&
      editingId === null &&
      !creating &&
      !helpOpen &&
      searchQuery === null,
  });

  // Listen for the panel-open keybind ('I' = shift+i), 'n' to open the
  // new-story form, and '?' for the help overlay. These bypass the row-level
  // keyboard handler.
  useEffect(() => {
    if (panelOpen || editingId !== null || creating || helpOpen) return;
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
        return;
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setCreating(true);
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setSearchQuery((q) => (q === null ? "" : q));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [panelOpen, editingId, creating, helpOpen, searchQuery]);

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
      {searchQuery !== null && (
        <SearchBar
          query={searchQuery}
          matchCount={filteredStories.length}
          onChange={setSearchQuery}
          onClose={() => setSearchQuery(null)}
        />
      )}
      <div className="board-shell" data-closing={closing ? "true" : undefined}>
        <Board
          stories={filteredStories}
          project={project.data}
          focus={focus}
          setFocus={setFocus}
          onTransition={handleTransition}
          editingId={editingId}
          onEditCancel={handleCancelEdit}
          onEditSave={handleSaveEdit}
          editSaving={updateStory.isPending}
          creating={creating}
          onCreate={handleCreate}
          onCancelCreate={handleCancelCreate}
          createSaving={createStory.isPending}
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
        {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
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
      <span>J/K</span>
      <span>move</span>
      <span className="sep">·</span>
      <span>space</span>
      <span>expand</span>
      <span className="sep">·</span>
      <span>n</span>
      <span>new</span>
      <span className="sep">·</span>
      <span>e</span>
      <span>edit</span>
      <span className="sep">·</span>
      <span>s/f/d/a</span>
      <span>start/finish/deliver/accept</span>
      <span className="sep">·</span>
      <span>r</span>
      <span>reject</span>
      <span className="sep">·</span>
      <span>i</span>
      <span>icebox</span>
      <span className="sep">·</span>
      <span>D</span>
      <span>delete</span>
      <span className="sep">·</span>
      <span>I</span>
      <span>close iteration</span>
      <span className="sep">·</span>
      <span>/</span>
      <span>search</span>
      <span className="sep">·</span>
      <span>?</span>
      <span>help</span>
      <span className="sep">·</span>
      <span>esc</span>
      <span>collapse</span>
    </footer>
  );
}
