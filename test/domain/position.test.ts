import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { after, before, between, needsRepack } from "../../src/domain/position.ts";

describe("position.between", () => {
  test("null/null produces a valid initial rank", () => {
    const r = between(null, null);
    expect(r.length).toBeGreaterThan(0);
    // The library guarantees ranks are non-empty strings; specific format
    // (e.g. starts with 'a', uses base-62) is library-internal.
  });

  test("between two ranks produces a strictly intermediate rank", () => {
    const a = between(null, null);
    const b = between(a, null);
    const c = between(a, b);
    expect(a < c).toBe(true);
    expect(c < b).toBe(true);
  });

  test("between(null, b) produces rank < b", () => {
    const b = between(null, null);
    const a = between(null, b);
    expect(a < b).toBe(true);
  });

  test("between(a, null) produces rank > a", () => {
    const a = between(null, null);
    const b = between(a, null);
    expect(a < b).toBe(true);
  });

  test("throws when a >= b", () => {
    const a = between(null, null);
    expect(() => between(a, a)).toThrow();
  });

  test("after / before convenience helpers match between() with nulls", () => {
    const a = between(null, null);
    expect(after(a)).toEqual(between(a, null));
    expect(before(a)).toEqual(between(null, a));
  });
});

describe("position.between (property tests)", () => {
  test("inserting N times keeps ranks sorted with no duplicates", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 50 }), (n) => {
        const ranks: string[] = [];
        // Start with one rank, then alternately insert at end, start, and middle.
        ranks.push(between(null, null));
        for (let i = 0; i < n; i++) {
          const mode = i % 3;
          if (mode === 0) {
            // Insert at end
            ranks.push(after(ranks[ranks.length - 1]!));
          } else if (mode === 1) {
            // Insert at start
            ranks.unshift(before(ranks[0]!));
          } else {
            // Insert in the middle
            const mid = Math.floor(ranks.length / 2);
            ranks.splice(mid, 0, between(ranks[mid - 1]!, ranks[mid]!));
          }
        }
        // Sorted check
        for (let i = 1; i < ranks.length; i++) {
          if (ranks[i - 1]! >= ranks[i]!) return false;
        }
        // Unique check (implied by strict ordering, but explicit)
        const set = new Set(ranks);
        return set.size === ranks.length;
      }),
      { numRuns: 50 },
    );
  });

  test("between(a, b) is always strictly between for any valid a < b", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 30 }), (n) => {
        // Generate a sorted list of ranks
        let r: string | null = null;
        const ranks: string[] = [];
        for (let i = 0; i < n; i++) {
          r = between(r, null);
          ranks.push(r);
        }
        // For every consecutive pair, between() must return strict intermediate
        for (let i = 1; i < ranks.length; i++) {
          const mid = between(ranks[i - 1]!, ranks[i]!);
          if (!(ranks[i - 1]! < mid && mid < ranks[i]!)) return false;
        }
        return true;
      }),
      { numRuns: 50 },
    );
  });
});

describe("position.needsRepack", () => {
  test("false when all ranks short", () => {
    expect(needsRepack(["a", "ab", "abc"])).toBe(false);
  });

  test("true when any rank > 12 chars", () => {
    expect(needsRepack(["a", "abcdefghijklmn", "b"])).toBe(true);
  });

  test("threshold is exactly > 12 (12 is OK, 13 triggers)", () => {
    expect(needsRepack(["a".repeat(12)])).toBe(false);
    expect(needsRepack(["a".repeat(13)])).toBe(true);
  });
});
