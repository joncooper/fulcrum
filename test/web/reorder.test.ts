import { describe, expect, test } from "bun:test";
import { computeBetween } from "../../src/web/reorder.ts";
import type { StoryDto } from "../../src/web/api.ts";

function row(id: string, position: string): StoryDto {
  return {
    id,
    type: "feature",
    state: "unstarted",
    position,
    labels: [],
    icebox: false,
    created: "2026-05-08",
    title: id,
    body: `# ${id}\n`,
    path: `/stories/${id}.md`,
    hash: "0".repeat(64),
  };
}

const list = [
  row("A", "a0"),
  row("B", "a1"),
  row("C", "a2"),
  row("D", "a3"),
  row("E", "a4"),
];

describe("computeBetween", () => {
  test("same indices → null (no-op)", () => {
    expect(computeBetween(list, 2, 2)).toBeNull();
  });

  test("out-of-bounds indices → null", () => {
    expect(computeBetween(list, -1, 2)).toBeNull();
    expect(computeBetween(list, 0, 99)).toBeNull();
  });

  test("move down: D (idx 3) → onto B (idx 1) lands between A and B", () => {
    const pos = computeBetween(list, 3, 1)!;
    expect(pos > "a0").toBe(true);
    expect(pos < "a1").toBe(true);
  });

  test("move up: B (idx 1) → onto D (idx 3) lands between D and E", () => {
    const pos = computeBetween(list, 1, 3)!;
    expect(pos > "a3").toBe(true);
    expect(pos < "a4").toBe(true);
  });

  test("move to top: E (idx 4) → onto A (idx 0) lands before A", () => {
    const pos = computeBetween(list, 4, 0)!;
    expect(pos < "a0").toBe(true);
  });

  test("move to bottom: A (idx 0) → onto E (idx 4) lands after E", () => {
    const pos = computeBetween(list, 0, 4)!;
    expect(pos > "a4").toBe(true);
  });

  test("adjacent swap: A (idx 0) → onto B (idx 1) lands between B and C", () => {
    const pos = computeBetween(list, 0, 1)!;
    expect(pos > "a1").toBe(true);
    expect(pos < "a2").toBe(true);
  });
});
