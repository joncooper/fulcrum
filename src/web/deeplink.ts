import { useEffect, useRef } from "react";
import type { StoryDto } from "./api.ts";
import type { FocusState } from "./keyboard.ts";

const STORY_PATH_RE = /^\/s\/([^/?#]+)$/;

/** Read the story id (or partial id) from the current URL path, if any. */
export function readStoryFromUrl(): string | null {
  const m = STORY_PATH_RE.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** Match a partial / short id against a full id (mirrors the domain helper). */
function idMatches(query: string, fullId: string): boolean {
  if (query === fullId) return true;
  if (/^\d+$/.test(query)) {
    const m = /^T-(\d+)-[0-9a-f]{4}$/.exec(fullId);
    return m !== null && m[1] === query;
  }
  if (/^T-\d+$/.test(query)) return fullId.startsWith(query + "-");
  return false;
}

/**
 * Sync URL ↔ focused story. On mount, captures the initial URL into a ref so
 * the URL-writer effect doesn't clobber it before stories load. Once stories
 * arrive, the captured target hydrates focus; subsequent focus changes write
 * back to the URL.
 */
export function useStoryDeepLink(opts: {
  stories: readonly StoryDto[];
  focus: FocusState;
  setFocus: (next: FocusState) => void;
}) {
  const { stories, focus, setFocus } = opts;
  // Captured once on mount. Cleared when consumed.
  const pendingTarget = useRef<string | null>(readStoryFromUrl());

  // Hydrate focus from the captured URL target as soon as stories arrive.
  useEffect(() => {
    if (pendingTarget.current === null) return;
    if (stories.length === 0) return;
    const target = pendingTarget.current;
    pendingTarget.current = null;
    const match = stories.find((s) => idMatches(target, s.id));
    if (match) {
      setFocus({ focusedId: match.id, expandedId: match.id });
    }
  }, [stories, setFocus]);

  // Mirror focus → URL, but never while a hydration is still pending (would
  // clobber the user's deep link before stories arrive).
  useEffect(() => {
    if (pendingTarget.current !== null) return;
    const desired = focus.focusedId ? `/s/${focus.focusedId}` : "/";
    if (window.location.pathname !== desired) {
      window.history.replaceState(
        null,
        "",
        desired + window.location.search + window.location.hash,
      );
    }
  }, [focus.focusedId]);

  // Browser back / forward.
  useEffect(() => {
    const onPop = () => {
      const fromUrl = readStoryFromUrl();
      if (!fromUrl) {
        setFocus({ focusedId: null, expandedId: null });
        return;
      }
      const match = stories.find((s) => idMatches(fromUrl, s.id));
      if (match) {
        setFocus({ focusedId: match.id, expandedId: match.id });
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [stories, setFocus]);
}
