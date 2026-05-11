import { describe, expect, test } from "bun:test";
import { deriveColumns } from "../../src/web/columns.ts";
import type { ProjectDto, StoryDto } from "../../src/web/api.ts";

/**
 * Perf benchmarks for the hot path: column projection at PT-class density.
 *
 * Target (per design doc): "the server reads `.fulcrum/` files on every
 * query. At solo scale (50-200 stories) this is fine — board renders in
 * ~50ms." The board derive is one piece of that 50ms budget; we want to
 * keep deriveColumns under 5ms for 200 stories so the remaining budget
 * goes to React reconciliation, dnd-kit setup, and paint.
 *
 * These tests are deterministic-but-perf — they assert duration budgets
 * which can be flaky on a contended host. Budgets are 4× the observed
 * median on a 2024 M-series MacBook to leave room for slower CI machines.
 */

function makeStories(n: number): StoryDto[] {
  const stories: StoryDto[] = [];
  for (let i = 0; i < n; i++) {
    const isFeature = i % 3 !== 0;
    const points = isFeature ? [1, 2, 3, 5, 8][i % 5]! : undefined;
    stories.push({
      id: `T-${1000 + i}-${i.toString(16).padStart(4, "0")}`,
      type: isFeature ? "feature" : (["chore", "bug", "release"][i % 3] as StoryDto["type"]),
      state: ["unstarted", "started", "finished", "delivered"][i % 4] as StoryDto["state"],
      points,
      position: `a${i.toString(36).padStart(4, "0")}`,
      labels: [],
      icebox: i % 11 === 0,
      created: "2026-05-08",
      title: `Story ${i} — this is a representative title for the perf benchmark`,
      body: `# Story ${i}\n`,
      path: `/tmp/T-${1000 + i}.md`,
      hash: "x".repeat(64),
    });
  }
  return stories;
}

const project: ProjectDto = {
  version: 1,
  name: "perf",
  velocity: 8,
  current_iteration: 1,
  iteration_start_date: "2026-05-08",
  iteration_length_days: 7,
  iteration_history: [],
  settings: { estimate_scale: [0, 1, 2, 3, 5, 8] },
};

function measure(fn: () => unknown, iterations: number): number {
  // Warm-up (JIT, ICs)
  for (let i = 0; i < 5; i++) fn();
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

describe("perf: deriveColumns hot path", () => {
  test("derives 50 stories under 1ms per pass (M1 solo scale)", () => {
    const stories = makeStories(50);
    const avg = measure(() => deriveColumns(stories, project), 200);
    expect(avg).toBeLessThan(1.0);
  });

  test("derives 200 stories under 5ms per pass (PT-class density target)", () => {
    const stories = makeStories(200);
    const avg = measure(() => deriveColumns(stories, project), 100);
    expect(avg).toBeLessThan(5.0);
  });

  test("derives 1000 stories under 25ms (headroom for power users)", () => {
    const stories = makeStories(1000);
    const avg = measure(() => deriveColumns(stories, project), 50);
    expect(avg).toBeLessThan(25.0);
  });

  test("velocity change reflows live — both passes under budget", () => {
    const stories = makeStories(200);
    const v3 = { ...project, velocity: 3 };
    const v13 = { ...project, velocity: 13 };
    const avg = measure(() => {
      deriveColumns(stories, v3);
      deriveColumns(stories, v13);
    }, 50);
    expect(avg).toBeLessThan(10.0);
  });
});

describe("perf: search filter", () => {
  test("filtering 200 stories by title substring under 1ms", () => {
    const stories = makeStories(200);
    const avg = measure(
      () =>
        stories.filter((s) => s.title.toLowerCase().includes("representative")),
      500,
    );
    expect(avg).toBeLessThan(1.0);
  });

  test("filter + project together stays under search-keystroke budget", () => {
    // Target: <50ms keystroke-to-update per design plan (Perf section).
    // We measure the synchronous portion (filter + projection); React
    // reconciliation + paint take the remaining budget downstream.
    const stories = makeStories(200);
    const avg = measure(() => {
      const filtered = stories.filter((s) => s.title.includes("Story 1"));
      deriveColumns(filtered, project);
    }, 100);
    expect(avg).toBeLessThan(5.0);
  });
});
