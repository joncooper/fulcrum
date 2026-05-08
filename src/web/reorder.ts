import { generateKeyBetween } from "fractional-indexing";
import type { StoryDto } from "./api.ts";

/**
 * Compute the new Lexorank rank for a story moved within its column.
 *
 *   list      column's story list, sorted ascending by `position`
 *   oldIdx    current index of the moved story in `list`
 *   newIdx    index of the over-target (the story dropped onto)
 *
 * Strategy: remove the moved story from the list, then insert at index
 * `newIdx` in the reduced list. New rank is strictly between the
 * predecessor and successor at that position. Mirrors @dnd-kit's
 * `arrayMove` semantics so the on-disk order matches what the user
 * dropped into place.
 *
 * Returns null for a no-op (same indices) or out-of-bounds inputs.
 */
export function computeBetween(
  list: readonly StoryDto[],
  oldIdx: number,
  newIdx: number,
): string | null {
  if (oldIdx === newIdx) return null;
  if (oldIdx < 0 || newIdx < 0 || oldIdx >= list.length || newIdx >= list.length) return null;

  const without = list.filter((_, i) => i !== oldIdx);
  // arrayMove semantics: moving down (oldIdx < newIdx) shifts items left by
  // one when we remove oldIdx, so the target slot in `without` is still
  // newIdx. Moving up keeps lower indices unchanged, so target is also newIdx.
  const insertIdx = newIdx;

  const prev = insertIdx > 0 ? without[insertIdx - 1]!.position : null;
  const next = insertIdx < without.length ? without[insertIdx]!.position : null;
  return generateKeyBetween(prev, next);
}
