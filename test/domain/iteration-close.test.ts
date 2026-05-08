import { describe, expect, test } from "bun:test";
import {
  closeIteration,
  deliverableStoriesForClose,
  rollingVelocity,
} from "../../src/domain/iteration-close.ts";
import type { Project } from "../../src/domain/schemas/project.ts";
import type { Story, StoryFrontmatter, StoryState } from "../../src/domain/schemas/story.ts";

const project = (current_iteration: number, velocity = 0): Project => ({
  version: 1,
  name: "test",
  velocity,
  current_iteration,
  iteration_start_date: "2026-05-01",
  iteration_length_days: 7,
  settings: { estimate_scale: [0, 1, 2, 3, 5, 8] },
});

let nextSeq = 1042;
function makeStory(
  state: StoryState,
  extras: Partial<StoryFrontmatter> = {},
): Story {
  const seq = nextSeq++;
  const fm: StoryFrontmatter = {
    id: `T-${seq}-7b21`,
    type: "feature",
    state,
    points: 3,
    position: `a${seq.toString(36)}`,
    labels: [],
    icebox: false,
    created: "2026-05-08",
    ...extras,
  };
  return { frontmatter: fm, body: `# Story ${seq}\n` };
}

describe("closeIteration: happy path", () => {
  test("accepts delivered stories and stamps the closing iteration", () => {
    const a = makeStory("delivered", { points: 3 });
    const b = makeStory("delivered", { points: 5 });
    const r = closeIteration({
      project: project(7),
      stories: [a, b],
      acceptedIds: [a.frontmatter.id, b.frontmatter.id],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.changed).toHaveLength(2);
    for (const s of r.value.changed) {
      expect(s.frontmatter.state).toBe("accepted");
      expect(s.frontmatter.iteration).toBe(7); // closing iteration, NOT N+1
    }
    expect(r.value.project.current_iteration).toBe(8);
    expect(r.value.velocity_actual).toBe(8);
  });

  test("velocity_actual sums points of just-accepted stories only", () => {
    const a = makeStory("delivered", { points: 3 });
    const b = makeStory("delivered", { points: 5 });
    const r = closeIteration({
      project: project(1),
      stories: [a, b],
      acceptedIds: [a.frontmatter.id], // accept only a
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.velocity_actual).toBe(3);
  });

  test("project velocity (rolling avg) recomputed after close", () => {
    const a = makeStory("delivered", { points: 5 });
    const b = makeStory("delivered", { points: 3 });
    const r = closeIteration({
      project: project(1, /* old velocity */ 99),
      stories: [a, b],
      acceptedIds: [a.frontmatter.id, b.frontmatter.id],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Only one closed iteration with 8 pts → rolling avg = 8.
    expect(r.value.project.velocity).toBe(8);
  });

  test("stories input is not mutated", () => {
    const a = makeStory("delivered", { points: 3 });
    const before = JSON.stringify(a.frontmatter);
    closeIteration({
      project: project(1),
      stories: [a],
      acceptedIds: [a.frontmatter.id],
    });
    expect(JSON.stringify(a.frontmatter)).toBe(before);
  });
});

describe("closeIteration: spilled", () => {
  test("delivered-but-not-accepted stories are returned as spilled", () => {
    const accepted = makeStory("delivered", { points: 3 });
    const unaccepted = makeStory("delivered", { points: 5 });
    const r = closeIteration({
      project: project(1),
      stories: [accepted, unaccepted],
      acceptedIds: [accepted.frontmatter.id],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spilled).toHaveLength(1);
    expect(r.value.spilled[0]!.frontmatter.id).toBe(unaccepted.frontmatter.id);
  });

  test("started/finished stories not in acceptedIds are spilled", () => {
    const started = makeStory("started", { points: 2 });
    const finished = makeStory("finished", { points: 1 });
    const r = closeIteration({
      project: project(1),
      stories: [started, finished],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spilled.map((s) => s.frontmatter.id).sort()).toEqual(
      [started.frontmatter.id, finished.frontmatter.id].sort(),
    );
  });

  test("iceboxed stories are NOT spilled", () => {
    const ice = makeStory("unstarted", { icebox: true });
    const r = closeIteration({
      project: project(1),
      stories: [ice],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spilled).toHaveLength(0);
  });

  test("already-closed stories (iteration set) are NOT spilled", () => {
    const old = makeStory("accepted", { iteration: 1, points: 3 });
    const r = closeIteration({
      project: project(2),
      stories: [old],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spilled).toHaveLength(0);
  });

  test("rejected stories are NOT spilled", () => {
    const rej = makeStory("rejected", { reject_reason: "scope" });
    const r = closeIteration({
      project: project(1),
      stories: [rej],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spilled).toHaveLength(0);
  });
});

describe("closeIteration: zero accepted", () => {
  test("empty acceptedIds → project advances, no changed stories, velocity_actual 0", () => {
    const delivered = makeStory("delivered", { points: 3 });
    const r = closeIteration({
      project: project(4),
      stories: [delivered],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.changed).toHaveLength(0);
    expect(r.value.velocity_actual).toBe(0);
    expect(r.value.project.current_iteration).toBe(5);
  });
});

describe("closeIteration: errors", () => {
  test("acceptedId not in stories → NOT_FOUND", () => {
    const r = closeIteration({
      project: project(1),
      stories: [],
      acceptedIds: ["T-9999-aaaa"],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("NOT_FOUND");
  });

  test("accepting a non-delivered story → INVALID_TRANSITION", () => {
    const started = makeStory("started", { points: 3 });
    const r = closeIteration({
      project: project(1),
      stories: [started],
      acceptedIds: [started.frontmatter.id],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("INVALID_TRANSITION");
  });

  test("accepting a story already accepted into THIS iteration is idempotent (no-op)", () => {
    const already = makeStory("accepted", { iteration: 5, points: 3 });
    const r = closeIteration({
      project: project(5),
      stories: [already],
      acceptedIds: [already.frontmatter.id],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.changed).toHaveLength(0);
  });

  test("accepting a story already accepted into a DIFFERENT iteration → INVALID_TRANSITION", () => {
    const already = makeStory("accepted", { iteration: 1, points: 3 });
    const r = closeIteration({
      project: project(5),
      stories: [already],
      acceptedIds: [already.frontmatter.id],
    });
    expect(r.ok).toBe(false);
  });
});

describe("rollingVelocity", () => {
  test("zero closed iterations → 0", () => {
    const s = [makeStory("delivered", { points: 5 })];
    expect(rollingVelocity(s)).toBe(0);
  });

  test("one closed iteration → that iteration's points", () => {
    const a = makeStory("accepted", { iteration: 1, points: 5 });
    const b = makeStory("accepted", { iteration: 1, points: 3 });
    expect(rollingVelocity([a, b])).toBe(8);
  });

  test("two closed iterations → average", () => {
    const i1a = makeStory("accepted", { iteration: 1, points: 5 });
    const i1b = makeStory("accepted", { iteration: 1, points: 5 }); // 10
    const i2a = makeStory("accepted", { iteration: 2, points: 8 });
    const i2b = makeStory("accepted", { iteration: 2, points: 8 }); // 16
    // avg(10, 16) = 13
    expect(rollingVelocity([i1a, i1b, i2a, i2b])).toBe(13);
  });

  test("four closed iterations → avg of last 3 only (window=3)", () => {
    const make = (it: number, pts: number) =>
      makeStory("accepted", { iteration: it, points: pts });
    const stories = [
      make(1, 8), // dropped (oldest)
      make(2, 5),
      make(3, 5),
      make(4, 8),
    ];
    // last 3 iterations: 2 (5), 3 (5), 4 (8) → avg = 6
    expect(rollingVelocity(stories)).toBe(6);
  });

  test("rounds to nearest integer", () => {
    const i1 = makeStory("accepted", { iteration: 1, points: 5 });
    const i2 = makeStory("accepted", { iteration: 2, points: 3 });
    // avg(5, 3) = 4 — exact
    expect(rollingVelocity([i1, i2])).toBe(4);
    const i1b = makeStory("accepted", { iteration: 1, points: 5 });
    const i2b = makeStory("accepted", { iteration: 2, points: 2 });
    // avg(5, 2) = 3.5 → 4 (round half away from zero per JS Math.round)
    expect(rollingVelocity([i1b, i2b])).toBe(4);
  });

  test("custom windowSize honored", () => {
    const make = (it: number, pts: number) =>
      makeStory("accepted", { iteration: it, points: pts });
    const stories = [make(1, 4), make(2, 8), make(3, 12)];
    expect(rollingVelocity(stories, { windowSize: 1 })).toBe(12);
    expect(rollingVelocity(stories, { windowSize: 2 })).toBe(10);
    expect(rollingVelocity(stories, { windowSize: 5 })).toBe(8);
  });
});

describe("deliverableStoriesForClose", () => {
  test("returns only delivered, non-iceboxed, non-stamped stories", () => {
    const delivered = makeStory("delivered", { points: 3 });
    const started = makeStory("started", { points: 3 });
    const ice = makeStory("delivered", { icebox: true, points: 3 });
    const old = makeStory("accepted", { iteration: 1, points: 3 });
    const result = deliverableStoriesForClose([delivered, started, ice, old]);
    expect(result.map((s) => s.frontmatter.id)).toEqual([delivered.frontmatter.id]);
  });
});
