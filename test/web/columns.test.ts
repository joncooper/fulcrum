import { describe, expect, test } from "bun:test";
import { deriveColumns } from "../../src/web/columns.ts";
import type { ProjectDto, StoryDto } from "../../src/web/api.ts";

function story(overrides: Partial<StoryDto>): StoryDto {
  const id = overrides.id ?? `T-1000-${Math.random().toString(16).slice(2, 6)}`;
  return {
    id,
    type: "feature",
    state: "unstarted",
    position: "m",
    points: 1,
    labels: [],
    icebox: false,
    created: "2026-05-08",
    title: id,
    body: "",
    path: `${id}.md`,
    hash: "x",
    ...overrides,
  };
}

function project(overrides: Partial<ProjectDto> = {}): ProjectDto {
  return {
    version: 1,
    name: "test",
    velocity: 5,
    current_iteration: 1,
    iteration_start_date: "2026-05-08",
    iteration_length_days: 7,
    iteration_history: [],
    settings: { estimate_scale: [0, 1, 2, 3, 5, 8] },
    ...overrides,
  };
}

describe("deriveColumns: done column (iteration:N stamped)", () => {
  test("stories with iteration:N → done; not in current/backlog/icebox", () => {
    const a = story({ id: "T-1-aaaa", iteration: 1, state: "accepted", position: "a" });
    const b = story({ id: "T-2-bbbb", state: "unstarted", position: "b" });
    const cols = deriveColumns([a, b], project());
    expect(cols.done.map((s) => s.id)).toEqual(["T-1-aaaa"]);
    expect(cols.current.map((s) => s.id)).toEqual(["T-2-bbbb"]);
    expect(cols.backlog).toHaveLength(0);
    expect(cols.icebox).toHaveLength(0);
  });

  test("stamped story is in done even if icebox is also true (defensive)", () => {
    // Schema forbids this combo, but the function must not double-list.
    const a = story({
      id: "T-1-aaaa",
      iteration: 1,
      state: "accepted",
      icebox: true,
      position: "a",
    });
    const cols = deriveColumns([a], project());
    expect(cols.done.map((s) => s.id)).toEqual(["T-1-aaaa"]);
    expect(cols.icebox).toHaveLength(0);
  });

  test("done column sorted by position", () => {
    const x = story({ id: "T-1-aaaa", iteration: 1, state: "accepted", position: "c" });
    const y = story({ id: "T-2-bbbb", iteration: 1, state: "accepted", position: "a" });
    const z = story({ id: "T-3-cccc", iteration: 2, state: "accepted", position: "b" });
    const cols = deriveColumns([x, y, z], project());
    expect(cols.done.map((s) => s.id)).toEqual(["T-2-bbbb", "T-3-cccc", "T-1-aaaa"]);
  });
});

describe("deriveColumns: icebox", () => {
  test("icebox:true and no iteration → icebox column", () => {
    const a = story({ id: "T-1-aaaa", icebox: true, position: "a" });
    const cols = deriveColumns([a], project());
    expect(cols.icebox.map((s) => s.id)).toEqual(["T-1-aaaa"]);
    expect(cols.current).toHaveLength(0);
    expect(cols.backlog).toHaveLength(0);
  });

  test("icebox sorted by position", () => {
    const x = story({ id: "T-1-aaaa", icebox: true, position: "c" });
    const y = story({ id: "T-2-bbbb", icebox: true, position: "a" });
    const cols = deriveColumns([x, y], project());
    expect(cols.icebox.map((s) => s.id)).toEqual(["T-2-bbbb", "T-1-aaaa"]);
  });
});

describe("deriveColumns: velocity+position projection", () => {
  test("velocity=5: stories sum to exactly 5 → all in current", () => {
    const s1 = story({ id: "T-1-aaaa", points: 2, position: "a" });
    const s2 = story({ id: "T-2-bbbb", points: 3, position: "b" });
    const cols = deriveColumns([s1, s2], project({ velocity: 5 }));
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa", "T-2-bbbb"]);
    expect(cols.backlog).toHaveLength(0);
  });

  test("velocity=5: 4th story would overflow → goes to backlog", () => {
    const s1 = story({ id: "T-1-aaaa", points: 2, position: "a" });
    const s2 = story({ id: "T-2-bbbb", points: 3, position: "b" });
    const s3 = story({ id: "T-3-cccc", points: 1, position: "c" });
    const cols = deriveColumns([s1, s2, s3], project({ velocity: 5 }));
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa", "T-2-bbbb"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-3-cccc"]);
  });

  test("velocity=3: single 5-pt story still lands in current (one-story overflow allowed)", () => {
    // PT semantics: a single story bigger than velocity gets its own current chunk
    // rather than being unreachable in the projection.
    const big = story({ id: "T-1-aaaa", points: 5, position: "a" });
    const next = story({ id: "T-2-bbbb", points: 1, position: "b" });
    const cols = deriveColumns([big, next], project({ velocity: 3 }));
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-2-bbbb"]);
  });

  test("velocity=0: everything in current (no chunking)", () => {
    const s1 = story({ id: "T-1-aaaa", points: 3, position: "a" });
    const s2 = story({ id: "T-2-bbbb", points: 5, position: "b" });
    const cols = deriveColumns([s1, s2], project({ velocity: 0 }));
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa", "T-2-bbbb"]);
    expect(cols.backlog).toHaveLength(0);
  });

  test("zero-point stories flow through without consuming capacity", () => {
    const c1 = story({ id: "T-1-aaaa", type: "chore", points: undefined, position: "a" });
    const c2 = story({ id: "T-2-bbbb", type: "bug", points: undefined, position: "b" });
    const f1 = story({ id: "T-3-cccc", type: "feature", points: 5, position: "c" });
    const f2 = story({ id: "T-4-dddd", type: "feature", points: 1, position: "d" });
    const cols = deriveColumns([c1, c2, f1, f2], project({ velocity: 5 }));
    // Chores contribute 0, feature 5 fits, next feature overflows.
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa", "T-2-bbbb", "T-3-cccc"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-4-dddd"]);
  });

  test("accepted-not-closed stories contribute 0 to chunk capacity", () => {
    // User accepted this mid-iteration via CLI; it shows in current with the
    // accepted tint but doesn't eat velocity budget.
    const a = story({ id: "T-1-aaaa", state: "accepted", points: 3, position: "a" });
    const f = story({ id: "T-2-bbbb", state: "unstarted", points: 5, position: "b" });
    const g = story({ id: "T-3-cccc", state: "unstarted", points: 1, position: "c" });
    const cols = deriveColumns([a, f, g], project({ velocity: 5 }));
    // accepted (0 cap) + 5-pt feature fits in chunk 0; 1-pt goes to backlog.
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa", "T-2-bbbb"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-3-cccc"]);
  });
});

describe("deriveColumns: velocity change reflows live", () => {
  // PT signature behavior: change velocity in project.yml and stories re-flow
  // between current and backlog. No file rewrites needed.
  const s1 = story({ id: "T-1-aaaa", points: 2, position: "a" });
  const s2 = story({ id: "T-2-bbbb", points: 3, position: "b" });
  const s3 = story({ id: "T-3-cccc", points: 3, position: "c" });
  const s4 = story({ id: "T-4-dddd", points: 5, position: "d" });
  const stories = [s1, s2, s3, s4];

  test("velocity=5 → current=[2,3], backlog=[3,5]", () => {
    const cols = deriveColumns(stories, project({ velocity: 5 }));
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa", "T-2-bbbb"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-3-cccc", "T-4-dddd"]);
  });

  test("velocity=8 → current=[2,3,3], backlog=[5]", () => {
    const cols = deriveColumns(stories, project({ velocity: 8 }));
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa", "T-2-bbbb", "T-3-cccc"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-4-dddd"]);
  });

  test("velocity=13 → current=[2,3,3,5], backlog=[]", () => {
    const cols = deriveColumns(stories, project({ velocity: 13 }));
    expect(cols.current.map((s) => s.id)).toEqual([
      "T-1-aaaa",
      "T-2-bbbb",
      "T-3-cccc",
      "T-4-dddd",
    ]);
    expect(cols.backlog).toHaveLength(0);
  });

  test("velocity=2 → current=[2], backlog=[3,3,5]", () => {
    const cols = deriveColumns(stories, project({ velocity: 2 }));
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-2-bbbb", "T-3-cccc", "T-4-dddd"]);
  });
});

describe("deriveColumns: position order across columns", () => {
  test("active stream sorted by position before chunking", () => {
    // Out-of-order input; deriveColumns must sort before chunking.
    // After sort by position: s2(a, 3pts), s3(b, 5pts), s1(c, 2pts).
    // velocity=5 → current gets s2 (3pts, fits). Adding s3 (5pts) brings total to 8>5
    // and current is non-empty, so s3 overflows to backlog. s1 follows.
    const s1 = story({ id: "T-1-aaaa", points: 2, position: "c" });
    const s2 = story({ id: "T-2-bbbb", points: 3, position: "a" });
    const s3 = story({ id: "T-3-cccc", points: 5, position: "b" });
    const cols = deriveColumns([s1, s2, s3], project({ velocity: 5 }));
    expect(cols.current.map((s) => s.id)).toEqual(["T-2-bbbb"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-3-cccc", "T-1-aaaa"]);
  });
});

describe("deriveColumns: mixed scenarios", () => {
  test("full board: done + icebox + active stories projected correctly", () => {
    const done1 = story({ id: "T-1-aaaa", iteration: 1, state: "accepted", position: "a" });
    const ice1 = story({ id: "T-2-bbbb", icebox: true, position: "b" });
    const cur1 = story({ id: "T-3-cccc", state: "started", points: 2, position: "c" });
    const cur2 = story({ id: "T-4-dddd", state: "delivered", points: 3, position: "d" });
    const bl1 = story({ id: "T-5-eeee", state: "unstarted", points: 5, position: "e" });
    const cols = deriveColumns(
      [done1, ice1, cur1, cur2, bl1],
      project({ velocity: 5 }),
    );
    expect(cols.done.map((s) => s.id)).toEqual(["T-1-aaaa"]);
    expect(cols.icebox.map((s) => s.id)).toEqual(["T-2-bbbb"]);
    expect(cols.current.map((s) => s.id)).toEqual(["T-3-cccc", "T-4-dddd"]);
    expect(cols.backlog.map((s) => s.id)).toEqual(["T-5-eeee"]);
  });

  test("rejected stories live in projection (re-enter at their position)", () => {
    const rej = story({
      id: "T-1-aaaa",
      state: "rejected",
      points: 3,
      position: "a",
      reject_reason: "scope",
    });
    const ust = story({ id: "T-2-bbbb", state: "unstarted", points: 2, position: "b" });
    const cols = deriveColumns([rej, ust], project({ velocity: 5 }));
    // Rejected has no `iteration` field → in projection → current chunk 0.
    expect(cols.current.map((s) => s.id)).toEqual(["T-1-aaaa", "T-2-bbbb"]);
  });
});
