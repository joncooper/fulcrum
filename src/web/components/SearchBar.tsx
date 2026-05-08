import { useEffect, useRef } from "react";

/**
 * Inline search bar pinned below the header. Opens via `/`, dismisses on
 * esc (clears query). All board contents filter live as the user types.
 */
export function SearchBar({
  query,
  matchCount,
  onChange,
  onClose,
}: {
  query: string;
  matchCount: number;
  onChange: (q: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <div
      className="search-bar"
      role="search"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <span className="search-prompt">/</span>
      <input
        ref={ref}
        className="search-input"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder="search title · body · labels · id"
        aria-label="Search the board"
      />
      <span className="search-count">
        {query.length === 0 ? "type to filter" : `${matchCount} match${matchCount === 1 ? "" : "es"}`}
      </span>
      <span className="search-hint">esc to close</span>
    </div>
  );
}

/** Case-insensitive substring search across title, body, id, and labels. */
export function matchesQuery(
  story: { title: string; body: string; id: string; labels: string[] },
  query: string,
): boolean {
  if (query.length === 0) return true;
  const q = query.toLowerCase();
  if (story.title.toLowerCase().includes(q)) return true;
  if (story.body.toLowerCase().includes(q)) return true;
  if (story.id.toLowerCase().includes(q)) return true;
  for (const label of story.labels) {
    if (label.toLowerCase().includes(q)) return true;
  }
  return false;
}
