import { useEffect } from "react";
import type { StoryDto, TransitionVerb } from "./api.ts";

export type FocusState = {
  focusedId: string | null;
  expandedId: string | null;
};

const TRANSITION_KEYS: Record<string, TransitionVerb> = {
  s: "start",
  f: "finish",
  d: "deliver",
  a: "accept",
};

export function useKeyboard(opts: {
  /** Flat list of stories in display order (for j/k navigation). */
  stories: StoryDto[];
  focus: FocusState;
  setFocus: (next: FocusState) => void;
  onTransition: (id: string, verb: TransitionVerb, reason?: string) => void;
  /** Begin editing the focused story (called for the `e` keystroke). */
  onEdit?: (id: string) => void;
  /** Delete the focused story after confirmation (called for the `D` keystroke). */
  onDelete?: (id: string) => void;
  /** Toggle icebox on the focused story (called for the `i` keystroke). */
  onToggleIcebox?: (id: string) => void;
  /** Move the focused story up or down within its column (J / K keystrokes). */
  onMove?: (id: string, direction: "up" | "down") => void;
  /** When false, the global handler is detached (e.g. while a modal panel owns input). */
  enabled?: boolean;
}) {
  const {
    stories,
    focus,
    setFocus,
    onTransition,
    onEdit,
    onDelete,
    onToggleIcebox,
    onMove,
    enabled = true,
  } = opts;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs/textareas.
      const tgt = e.target;
      if (
        tgt instanceof HTMLInputElement ||
        tgt instanceof HTMLTextAreaElement ||
        (tgt instanceof HTMLElement && tgt.isContentEditable)
      ) {
        return;
      }

      const idx = focus.focusedId ? stories.findIndex((s) => s.id === focus.focusedId) : -1;

      // Capital J/K: move focused story down/up one slot within its column.
      // Checked before lowercase j/k so the case-sensitive match wins.
      if (e.key === "J" && focus.focusedId && onMove) {
        e.preventDefault();
        onMove(focus.focusedId, "down");
        return;
      }
      if (e.key === "K" && focus.focusedId && onMove) {
        e.preventDefault();
        onMove(focus.focusedId, "up");
        return;
      }
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, stories.length - 1);
        if (stories[nextIdx]) setFocus({ ...focus, focusedId: stories[nextIdx].id });
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prevIdx = idx < 0 ? stories.length - 1 : Math.max(idx - 1, 0);
        if (stories[prevIdx]) setFocus({ ...focus, focusedId: stories[prevIdx].id });
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        if (focus.focusedId) {
          setFocus({
            ...focus,
            expandedId: focus.expandedId === focus.focusedId ? null : focus.focusedId,
          });
        }
        return;
      }
      if (e.key === "Escape") {
        if (focus.expandedId !== null) {
          e.preventDefault();
          setFocus({ ...focus, expandedId: null });
        }
        return;
      }
      // State transitions — must have a focused story
      const verb = TRANSITION_KEYS[e.key];
      if (verb && focus.focusedId) {
        e.preventDefault();
        onTransition(focus.focusedId, verb);
        return;
      }
      if (e.key === "r" && focus.focusedId) {
        e.preventDefault();
        const reason = window.prompt("Reject reason:");
        if (reason && reason.trim().length > 0) {
          onTransition(focus.focusedId, "reject", reason.trim());
        }
        return;
      }
      if (e.key === "e" && focus.focusedId && onEdit) {
        e.preventDefault();
        onEdit(focus.focusedId);
        return;
      }
      // Capital-D for delete: caps lock or shift required, so a stray
      // keystroke won't nuke a story. Confirmation is in the handler.
      if (e.key === "D" && focus.focusedId && onDelete) {
        e.preventDefault();
        onDelete(focus.focusedId);
        return;
      }
      if (e.key === "i" && focus.focusedId && onToggleIcebox) {
        e.preventDefault();
        onToggleIcebox(focus.focusedId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    stories,
    focus,
    setFocus,
    onTransition,
    onEdit,
    onDelete,
    onToggleIcebox,
    onMove,
    enabled,
  ]);
}
