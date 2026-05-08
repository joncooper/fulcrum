import { generateKeyBetween as fiBetween } from "fractional-indexing";

/**
 * Lexorank-style position field for stories.
 *
 * Wraps `fractional-indexing` (battle-tested, zero deps, ~3KB) so the rest of
 * fulcrum talks about "position" not "fractional index." We commit to the
 * default base-62 alphabet from that library; ranks compare lexicographically
 * the same way they compare semantically.
 *
 * Library guarantees:
 * - Ranks are non-empty strings.
 * - between(a, b) returns a string strictly between a and b in lex order.
 * - Inserting between any two adjacent ranks always succeeds; rank length may
 *   grow as needed, never collides.
 *
 * For a project with N stories, expected rank length grows ~log(N).
 */

/**
 * Generate a position string strictly between `a` and `b`.
 *
 * - Both null: returns the initial position.
 * - `a` null, `b` non-null: returns a position less than `b`.
 * - `a` non-null, `b` null: returns a position greater than `a`.
 * - Both non-null: returns a position strictly between, requires `a < b`.
 *
 * Throws if `a >= b` when both are non-null.
 */
export function between(a: string | null, b: string | null): string {
  return fiBetween(a, b);
}

/**
 * Convenience: generate the next position after `a` (insert at end).
 */
export function after(a: string | null): string {
  return fiBetween(a, null);
}

/**
 * Convenience: generate the position before `b` (insert at start).
 */
export function before(b: string | null): string {
  return fiBetween(null, b);
}

/**
 * Generate `count` positions distributed between `a` and `b`. Useful for bulk
 * inserts where calling `between` repeatedly would produce ranks that cluster
 * near `a`.
 *
 * (Wraps the library's `generateNKeysBetween`, but only if needed by callers
 * later. For now we only export `between` since most insertions are one at a
 * time.)
 */

/**
 * Decide whether the rank string should be repacked.
 *
 * Per plan: trigger repack when any rank exceeds 12 characters. The repack
 * itself rebalances all ranks to short forms; that's a separate operation
 * (`fulcrum repack`) we don't implement until needed.
 */
export function needsRepack(ranks: readonly string[]): boolean {
  return ranks.some((r) => r.length > 12);
}
