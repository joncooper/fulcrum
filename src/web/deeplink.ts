import { useEffect } from "react";
import type { StoryDto } from "./api.ts";
import type { FocusState } from "./keyboard.ts";

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

const STORY_PATH_RE = /^\/s\/([^/?#]+)$/;

/** Read the story id (or partial id) from the current URL path, if any. */
export function readStoryFromUrl(): string | null {
  const m = STORY_PATH_RE.exec(window.location.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

/**
 * Sync URL ↔ focused story. When the focus changes to a real story id, the
 * URL becomes `/s/{full-id}` (canonical for sharing). When focus clears, the
 * URL drops back to `/`. On first mount, if the URL contains a story id, the
 * matching story is focused + expanded.
 */
export function useStoryDeepLink(opts: {
  stories: readonly StoryDto[];
  focus: FocusState;
  setFocus: (next: FocusState) => void;
}) {
  const { stories, focus, setFocus } = opts;

  // Initial load: hydrate focus from URL once stories are available.
  useEffect(() => {
    if (stories.length === 0) return;
    const fromUrl = readStoryFromUrl();
    if (!fromUrl) return;
    if (focus.focusedId) return;
    const match = stories.find((s) => idMatches(fromUrl, s.id));
    if (match) {
      setFocus({ focusedId: match.id, expandedId: match.id });
    }
    // Run once when stories first arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories.length === 0]);

  // Whenever focus changes, write the URL.
  useEffect(() => {
    const desired = focus.focusedId ? `/s/${focus.focusedId}` : "/";
    if (window.location.pathname !== desired) {
      window.history.replaceState(null, "", desired + window.location.search + window.location.hash);
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
