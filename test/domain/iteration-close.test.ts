import { describe, expect, test } from "bun:test";
import {
  closeIteration,
  deliverableStoriesForClose,
  rollingVelocityFromHistory,
} from "../../src/domain/iteration-close.ts";
import type { IterationRecord, Project } from "../../src/domain/schemas/project.ts";
import type { Story, StoryFrontmatter, StoryState } from "../../src/domain/schemas/story.ts";

const project = (
  current_iteration: number,
  velocity = 0,
  iteration_history: IterationRecord[] = [],
  iteration_start_date = "2026-05-01",
): Project => ({
  version: 1,
  name: "test",
  velocity,
  current_iteration,
  iteration_start_date,
  iteration_length_days: 7,
  iteration_history,
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

describe("closeIteration: stamps iteration:N (canonical projection model)", () => {
  test("transitions delivered → accepted, stamps accepted_at AND iteration:N", () => {
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
      expect(s.frontmatter.accepted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // iteration:N is stamped at close (immutable from here forward).
      expect(s.frontmatter.iteration).toBe(7);
    }
    expect(r.value.project.current_iteration).toBe(8);
    expect(r.value.velocity_actual).toBe(8);
  });

  test("project pushes a new iteration_history record on close", () => {
    const a = makeStory("delivered", { points: 5 });
    const r = closeIteration({
      project: project(3, 0, [], "2026-05-01"),
      stories: [a],
      acceptedIds: [a.frontmatter.id],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.project.iteration_history).toHaveLength(1);
    const rec = r.value.project.iteration_history[0]!;
    expect(rec.number).toBe(3);
    expect(rec.start_date).toBe("2026-05-01");
    expect(rec.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rec.velocity).toBe(5);
  });

  test("ad-hoc accepted story (state=accepted, accepted_at in window) is stamped at close", () => {
    // Chore was accepted ad-hoc earlier in the iteration (e.g. via `fulcrum accept`).
    const chore = makeStory("accepted", {
      type: "chore",
      points: undefined,
      accepted_at: "2026-05-03T10:00:00.000Z",
    });
    // Feature accepted as part of the close ritual.
    const feat = makeStory("delivered", { points: 8 });
    const r = closeIteration({
      project: project(2, 0, [], "2026-05-01"),
      stories: [chore, feat],
      acceptedIds: [feat.frontmatter.id],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Both stories changed (both got stamped with iteration:2).
    expect(r.value.changed).toHaveLength(2);
    const stampedChore = r.value.changed.find((s) => s.frontmatter.id === chore.frontmatter.id);
    const stampedFeat = r.value.changed.find((s) => s.frontmatter.id === feat.frontmatter.id);
    expect(stampedChore?.frontmatter.iteration).toBe(2);
    expect(stampedFeat?.frontmatter.iteration).toBe(2);
    // velocity_actual = chore (0 pts) + feat (8 pts) = 8.
    expect(r.value.velocity_actual).toBe(8);
  });

  test("accepted_at outside current window is NOT stamped (prior iteration)", () => {
    const old = makeStory("accepted", {
      points: 5,
      accepted_at: "2026-04-15T10:00:00.000Z", // before window 2026-05-01
    });
    const r = closeIteration({
      project: project(2, 0, [], "2026-05-01"),
      stories: [old],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Story not in changed (no stamp) and not in velocity_actual.
    expect(r.value.changed).toHaveLength(0);
    expect(r.value.velocity_actual).toBe(0);
  });

  test("already-stamped story is never re-stamped (immutable)", () => {
    const old = makeStory("accepted", {
      points: 5,
      accepted_at: "2026-05-03T10:00:00.000Z",
      iteration: 1, // already stamped in a prior close
    });
    const r = closeIteration({
      project: project(2, 0, [], "2026-05-01"),
      stories: [old],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Iteration field already set → not touched, not in changed.
    expect(r.value.changed).toHaveLength(0);
    // Velocity_actual = 0 because no stories were stamped with iteration:2.
    expect(r.value.velocity_actual).toBe(0);
  });

  test("project velocity (rolling avg) recomputed from iteration_history after close", () => {
    const history: IterationRecord[] = [
      { number: 1, start_date: "2026-04-01", end_date: "2026-04-08", velocity: 8 },
      { number: 2, start_date: "2026-04-08", end_date: "2026-04-15", velocity: 5 },
    ];
    const a = makeStory("delivered", { points: 5 });
    const r = closeIteration({
      project: project(3, 99, history, "2026-04-15"),
      stories: [a],
      acceptedIds: [a.frontmatter.id],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // History after close: [8, 5, 5] → avg = 6 (rounded).
    expect(r.value.project.velocity).toBe(6);
    expect(r.value.project.iteration_history).toHaveLength(3);
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
  test("delivered-but-not-accepted are spilled", () => {
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

  test("started/finished not in acceptedIds are spilled", () => {
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

  test("accepted/rejected stories are NOT spilled", () => {
    const acc = makeStory("accepted", { accepted_at: "2026-05-03T10:00:00.000Z" });
    const rej = makeStory("rejected", { reject_reason: "scope" });
    const r = closeIteration({
      project: project(2),
      stories: [acc, rej],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spilled).toHaveLength(0);
  });

  test("stamped (iteration:N set) stories are NOT spilled", () => {
    const done = makeStory("accepted", {
      points: 3,
      accepted_at: "2026-04-10T10:00:00.000Z",
      iteration: 1,
    });
    const r = closeIteration({
      project: project(2),
      stories: [done],
      acceptedIds: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.spilled).toHaveLength(0);
  });
});

describe("closeIteration: zero accepted", () => {
  test("empty acceptedIds → project advances, history pushed (vel 0), no story changes", () => {
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
    expect(r.value.project.iteration_history).toHaveLength(1);
    expect(r.value.project.iteration_history[0]!.velocity).toBe(0);
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

  test("accepting an already-accepted (state=accepted, no iteration) story stamps it", () => {
    const already = makeStory("accepted", {
      points: 3,
      accepted_at: "2026-05-03T10:00:00.000Z",
    });
    const r = closeIteration({
      project: project(2, 0, [], "2026-05-01"),
      stories: [already],
      acceptedIds: [already.frontmatter.id],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // No state transition (already accepted), but iteration stamp happens.
    expect(r.value.changed).toHaveLength(1);
    expect(r.value.changed[0]!.frontmatter.iteration).toBe(2);
    // It counts toward velocity_actual.
    expect(r.value.velocity_actual).toBe(3);
  });
});

describe("rollingVelocityFromHistory", () => {
  test("zero entries → 0", () => {
    expect(rollingVelocityFromHistory([])).toBe(0);
  });

  test("one entry → that entry's velocity", () => {
    expect(
      rollingVelocityFromHistory([
        { number: 1, start_date: "a", end_date: "b", velocity: 8 },
      ]),
    ).toBe(8);
  });

  test("two entries → average", () => {
    const h: IterationRecord[] = [
      { number: 1, start_date: "a", end_date: "b", velocity: 10 },
      { number: 2, start_date: "b", end_date: "c", velocity: 16 },
    ];
    expect(rollingVelocityFromHistory(h)).toBe(13);
  });

  test("four entries → avg of last 3 only (window=3)", () => {
    const h: IterationRecord[] = [
      { number: 1, start_date: "a", end_date: "b", velocity: 8 }, // dropped
      { number: 2, start_date: "b", end_date: "c", velocity: 5 },
      { number: 3, start_date: "c", end_date: "d", velocity: 5 },
      { number: 4, start_date: "d", end_date: "e", velocity: 8 },
    ];
    // last 3 = [5, 5, 8] → avg = 6
    expect(rollingVelocityFromHistory(h)).toBe(6);
  });

  test("custom windowSize honored", () => {
    const h: IterationRecord[] = [
      { number: 1, start_date: "a", end_date: "b", velocity: 4 },
      { number: 2, start_date: "b", end_date: "c", velocity: 8 },
      { number: 3, start_date: "c", end_date: "d", velocity: 12 },
    ];
    expect(rollingVelocityFromHistory(h, { windowSize: 1 })).toBe(12);
    expect(rollingVelocityFromHistory(h, { windowSize: 2 })).toBe(10);
    expect(rollingVelocityFromHistory(h, { windowSize: 5 })).toBe(8);
  });
});

describe("deliverableStoriesForClose", () => {
  test("returns only delivered, non-iceboxed, non-stamped stories", () => {
    const delivered = makeStory("delivered", { points: 3 });
    const started = makeStory("started", { points: 3 });
    const ice = makeStory("delivered", { icebox: true, points: 3 });
    const acc = makeStory("accepted", { accepted_at: "2026-04-01T10:00:00.000Z" });
    const stampedDone = makeStory("accepted", {
      points: 3,
      accepted_at: "2026-04-15T10:00:00.000Z",
      iteration: 1,
    });
    const result = deliverableStoriesForClose([delivered, started, ice, acc, stampedDone]);
    expect(result.map((s) => s.frontmatter.id)).toEqual([delivered.frontmatter.id]);
  });
});
