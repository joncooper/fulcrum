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
  FulcrumApiError,
  type CreateStoryInput,
  type IterationClosedEvent,
  type MalformedStory,
  type SseStatus,
  type StoryPatch,
  type TransitionVerb,
} from "./api.ts";
import { computeBetween } from "./reorder.ts";
import { useStoryDeepLink } from "./deeplink.ts";
import { formatIsoDate, iterationWindow } from "./iteration-window.ts";
import { Board } from "./components/Board.tsx";
import { HelpOverlay } from "./components/HelpOverlay.tsx";
import { IterationClosePanel } from "./components/IterationClosePanel.tsx";
import { SearchBar, matchesQuery } from "./components/SearchBar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { useKeyboard, type FocusState } from "./keyboard.ts";
import { deriveColumns } from "./columns.ts";

const THEME_KEY = "fulcrum-theme";
const ITERATION_CLOSE_MS = 400;
const MOBILE_BREAKPOINT_PX = 768;

/**
 * True when viewport is narrower than the mobile breakpoint (768px). Per
 * DESIGN.md, fulcrum is desktop-first; below 768px the board renders read-only
 * with a persistent banner. Detection is pure viewport-width via matchMedia
 * (no UA sniffing — a narrow desktop window also counts).
 */
function useReadOnly(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

/**
 * One transient notification: STALE_WRITE (yellow, "upstream changed this
 * story while you were editing"), DISK_FULL (red, persistent until Retry or
 * user dismiss), or a generic error (red, auto-dismisses after 6s).
 *
 * Per design Failure Modes:
 *   - mid-edit upstream warning: STALE_WRITE banner that lets user pull-and-retry
 *   - disk-full toast: red, in-flight value preserved in React state
 *
 * The toast UI is in the bottom-right; messages stack but stale toasts
 * auto-dismiss to keep the footprint small.
 */
type Toast = {
  id: number;
  kind: "stale-write" | "disk-full" | "error";
  message: string;
  /** Auto-dismiss delay in ms; null = sticky (user must dismiss). */
  autoDismissMs: number | null;
};

let toastSeq = 1;

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const remove = useCallback((id: number) => {
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);
  const push = useCallback(
    (kind: Toast["kind"], message: string, autoDismissMs: number | null) => {
      const id = toastSeq++;
      setToasts((cur) => [...cur, { id, kind, message, autoDismissMs }]);
      if (autoDismissMs !== null) {
        window.setTimeout(() => remove(id), autoDismissMs);
      }
    },
    [remove],
  );
  /**
   * Translate a mutation error into the right toast kind. STALE_WRITE is
   * the "mid-edit upstream warning" path (yellow, brief). Disk-full is the
   * ENOSPC path (red, sticky until user takes action). Other errors are
   * red with a short auto-dismiss so the user sees the failure without
   * permanently clogging the UI.
   */
  const pushError = useCallback(
    (err: unknown) => {
      if (err instanceof FulcrumApiError) {
        if (err.isStaleWrite) {
          push(
            "stale-write",
            "Upstream changed this story while you were editing. Refresh and retry.",
            8_000,
          );
          return;
        }
        if (err.isDiskFull) {
          push(
            "disk-full",
            "Disk full — your edit is preserved in this tab. Free space and retry.",
            null,
          );
          return;
        }
        push("error", err.message, 6_000);
        return;
      }
      if (err instanceof Error) {
        push("error", err.message, 6_000);
        return;
      }
      push("error", "Something went wrong.", 6_000);
    },
    [push],
  );
  return { toasts, pushError, dismiss: remove };
}

function ToastHost({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-host" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="alert">
          <span className="toast-msg">{t.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

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
  const readOnly = useReadOnly();
  const { toasts, pushError, dismiss } = useToasts();
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

  const sseStatus = useSseInvalidator({ onIterationClosed: handleIterationClosed });

  // Mutation error → toast plumbing. Each useMutation hook exposes an .error
  // that updates when a request fails; we watch them and surface a toast
  // (STALE_WRITE → yellow mid-edit warning, ENOSPC → red disk-full toast,
  // anything else → red generic error toast with auto-dismiss).
  useEffect(() => {
    if (transitionStory.error) pushError(transitionStory.error);
  }, [transitionStory.error, pushError]);
  useEffect(() => {
    if (updateStory.error) pushError(updateStory.error);
  }, [updateStory.error, pushError]);
  useEffect(() => {
    if (createStory.error) pushError(createStory.error);
  }, [createStory.error, pushError]);
  useEffect(() => {
    if (deleteStory.error) pushError(deleteStory.error);
  }, [deleteStory.error, pushError]);
  useEffect(() => {
    if (updatePosition.error) pushError(updatePosition.error);
  }, [updatePosition.error, pushError]);
  useEffect(() => {
    if (closeIter.error) pushError(closeIter.error);
  }, [closeIter.error, pushError]);
  useStoryDeepLink({ stories: stories.data?.stories ?? [], focus, setFocus });

  // Apply search filter before deriving columns so j/k navigation only walks
  // matching stories.
  const filteredStories = useMemo(() => {
    if (!stories.data) return [];
    if (searchQuery === null || searchQuery.length === 0) return stories.data.stories;
    return stories.data.stories.filter((s) => matchesQuery(s, searchQuery));
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
      // CAS-on-hash: pass the client's last-read hash so the server returns
      // STALE_WRITE if another tab/process changed the file between our read
      // and this write. Per plan: no silent overwrite of concurrent edits.
      const story = stories.data?.stories.find((s) => s.id === id);
      transitionStory.mutate({ id, verb, reason, expectedHash: story?.hash });
    },
    [transitionStory, stories.data],
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
    columns: cols ?? undefined,
    focus,
    setFocus,
    onTransition: handleTransition,
    onEdit: handleStartEdit,
    onDelete: handleDelete,
    onToggleIcebox: handleToggleIcebox,
    onMove: handleMove,
    enabled:
      !readOnly &&
      !panelOpen &&
      editingId === null &&
      !creating &&
      !helpOpen &&
      searchQuery === null,
  });

  // Global keybinds that operate above the row-level handler:
  //   c — new story (form opens at top of Current per DESIGN.md)
  //   i — open iteration close panel (PT-vernacular)
  //   ? — help overlay
  //   / — search
  // (Capital `I` toggles icebox on the focused story; handled by useKeyboard.)
  // Disabled entirely in read-only/mobile mode.
  useEffect(() => {
    if (readOnly || panelOpen || editingId !== null || creating || helpOpen) return;
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target;
      if (
        tgt instanceof HTMLInputElement ||
        tgt instanceof HTMLTextAreaElement ||
        (tgt instanceof HTMLElement && tgt.isContentEditable)
      ) {
        return;
      }
      if (e.key === "i" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPanelOpen(true);
        return;
      }
      if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey) {
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
  }, [readOnly, panelOpen, editingId, creating, helpOpen, searchQuery]);

  // In read-only/mobile mode, never enter creating/editing/panel state even if
  // a stale handler tried to flip them.
  useEffect(() => {
    if (!readOnly) return;
    if (creating) setCreating(false);
    if (editingId !== null) setEditingId(null);
    if (panelOpen) setPanelOpen(false);
    if (helpOpen) setHelpOpen(false);
  }, [readOnly, creating, editingId, panelOpen, helpOpen]);

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
        iteration={iterationLabel(project.data)}
        velocity={`velocity ${project.data.velocity} pts`}
        theme={theme}
        onToggleTheme={toggle}
        onClickIteration={readOnly ? () => undefined : () => setPanelOpen(true)}
      />
      {readOnly && (
        <div className="mobile-readonly-banner" role="status" aria-live="polite">
          fulcrum is keyboard-first. Mobile is read-only — view on a desktop to edit.
        </div>
      )}
      {stories.data.malformed.length > 0 && (
        <MalformedBanner malformed={stories.data.malformed} />
      )}
      {searchQuery !== null && (
        <SearchBar
          query={searchQuery}
          matchCount={filteredStories.length}
          onChange={setSearchQuery}
          onClose={() => setSearchQuery(null)}
        />
      )}
      <div className="app-body">
        <Sidebar
          project={project.data}
          stories={stories.data}
          onNewStory={() => setCreating(true)}
          readOnly={readOnly}
        />
        <main
          className="board-shell"
          data-closing={closing ? "true" : undefined}
          data-readonly={readOnly ? "true" : undefined}
          role="main"
          aria-label="Story board"
        >
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
            onStartCreate={() => setCreating(true)}
            createSaving={createStory.isPending}
            readOnly={readOnly}
          />
          {panelOpen && (
            <IterationClosePanel
              stories={stories.data.stories}
              project={project.data}
              onCommit={handleCommitClose}
              onCancel={() => setPanelOpen(false)}
              onReject={(id, reason) => handleTransition(id, "reject", reason)}
              isCommitting={closeIter.isPending}
            />
          )}
          {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}
        </main>
      </div>
      <StatusBar
        ritualNote={
          lastClosed && closing
            ? `Iteration ${lastClosed.closed_iteration} closed · ${lastClosed.velocity_actual} pts · pace ${lastClosed.velocity_next}`
            : null
        }
        sseStatus={sseStatus}
      />
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

function iterationLabel(project: {
  current_iteration: number;
  iteration_start_date: string;
  iteration_length_days: number;
}): string {
  const { start, end } = iterationWindow(project);
  return `Iteration ${project.current_iteration} · ${formatIsoDate(start)} → ${formatIsoDate(end)}`;
}

/**
 * Banner shown when one or more story files failed to parse / validate.
 * Per DESIGN.md: malformed stories surface in a "needs attention" lane so
 * the user knows they exist; M1 expandable list of paths + error messages.
 * Editing the underlying file is the fix (no inline editor for malformed
 * frontmatter in M1).
 */
function MalformedBanner({ malformed }: { malformed: MalformedStory[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="malformed-banner" role="status">
      <button
        type="button"
        className="malformed-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Needs attention: {malformed.length} story
        {malformed.length === 1 ? "" : "s"} failed to load
      </button>
      {open && (
        <ul className="malformed-list" role="list">
          {malformed.map((m) => (
            <li key={m.path} className="malformed-row">
              <span className="malformed-path">{shortenPath(m.path)}</span>
              <span className="malformed-error">
                {m.error.kind}: {m.error.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function shortenPath(absPath: string): string {
  const idx = absPath.indexOf("/.fulcrum/stories/");
  return idx >= 0 ? absPath.slice(idx + 1) : absPath;
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

function StatusBar({
  ritualNote,
  sseStatus = "connected",
}: {
  ritualNote?: string | null;
  sseStatus?: SseStatus;
} = {}) {
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
      <span>h/l</span>
      <span>cols</span>
      <span className="sep">·</span>
      <span>J/K</span>
      <span>move</span>
      <span className="sep">·</span>
      <span>space</span>
      <span>expand</span>
      <span className="sep">·</span>
      <span>c</span>
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
      <span>I</span>
      <span>icebox</span>
      <span className="sep">·</span>
      <span>i</span>
      <span>close iter</span>
      <span className="sep">·</span>
      <span>/</span>
      <span>search</span>
      <span className="sep">·</span>
      <span>?</span>
      <span>help</span>
      <span className="sep">·</span>
      <span>esc</span>
      <span>collapse</span>
      {sseStatus !== "connected" && (
        <span className={`sse-indicator sse-${sseStatus}`} role="status" aria-live="polite">
          <span className="sse-dot" aria-hidden />
          {sseStatus === "connecting"
            ? "connecting…"
            : sseStatus === "watcher-restarted"
              ? "watcher restarted, board re-synced"
              : "watcher disconnected — retrying"}
        </span>
      )}
    </footer>
  );
}
