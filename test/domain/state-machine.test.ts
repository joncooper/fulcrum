import { describe, expect, test } from "bun:test";
import {
  TRANSITION_TABLE,
  transition,
  type Command,
} from "../../src/domain/state-machine.ts";
import type { StoryFrontmatter, StoryState } from "../../src/domain/schemas/story.ts";

const baseStory = (state: StoryState, extras: Partial<StoryFrontmatter> = {}): StoryFrontmatter =>
  ({
    id: "T-1042-7b21",
    type: "feature",
    state,
    points: 3,
    position: "a0",
    labels: [],
    icebox: false,
    created: "2026-05-08",
    ...extras,
  }) as StoryFrontmatter;

describe("transition: start", () => {
  test("unstarted → started", () => {
    const r = transition(baseStory("unstarted"), { kind: "start" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("started");
  });

  test("already started → INVALID_TRANSITION", () => {
    const r = transition(baseStory("started"), { kind: "start" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("INVALID_TRANSITION");
  });

  test("from finished (backward) → INVALID_TRANSITION", () => {
    const r = transition(baseStory("finished"), { kind: "start" });
    expect(r.ok).toBe(false);
  });

  test("from accepted → INVALID_TRANSITION", () => {
    const r = transition(baseStory("accepted", { accepted_at: "2026-05-03T10:00:00.000Z" }), { kind: "start" });
    expect(r.ok).toBe(false);
  });

  test("from rejected → INVALID_TRANSITION (use restart)", () => {
    const r = transition(
      baseStory("rejected", { reject_reason: "wrong scope" }),
      { kind: "start" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("restart");
  });
});

describe("transition: finish (auto-chain forward)", () => {
  test("started → finished", () => {
    const r = transition(baseStory("started"), { kind: "finish" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("finished");
  });

  test("auto-chain: unstarted → finished (skips through started)", () => {
    const r = transition(baseStory("unstarted"), { kind: "finish" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("finished");
  });

  test("from finished (already there) → INVALID_TRANSITION", () => {
    const r = transition(baseStory("finished"), { kind: "finish" });
    expect(r.ok).toBe(false);
  });

  test("from delivered (backward) → INVALID_TRANSITION", () => {
    const r = transition(baseStory("delivered"), { kind: "finish" });
    expect(r.ok).toBe(false);
  });
});

describe("transition: deliver (auto-chain forward)", () => {
  test("finished → delivered", () => {
    const r = transition(baseStory("finished"), { kind: "deliver" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("delivered");
  });

  test("auto-chain: unstarted → delivered", () => {
    const r = transition(baseStory("unstarted"), { kind: "deliver" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("delivered");
  });

  test("auto-chain: started → delivered", () => {
    const r = transition(baseStory("started"), { kind: "deliver" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("delivered");
  });

  test("from accepted (backward) → INVALID_TRANSITION", () => {
    const r = transition(
      baseStory("accepted", { accepted_at: "2026-05-03T10:00:00.000Z" }),
      { kind: "deliver" },
    );
    expect(r.ok).toBe(false);
  });
});

describe("transition: accept (no auto-chain past delivered)", () => {
  test("delivered → accepted", () => {
    const r = transition(baseStory("delivered"), { kind: "accept" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("accepted");
  });

  test("from finished → INVALID_TRANSITION (no auto-chain past deliver)", () => {
    const r = transition(baseStory("finished"), { kind: "accept" });
    expect(r.ok).toBe(false);
  });

  test("from started → INVALID_TRANSITION", () => {
    const r = transition(baseStory("started"), { kind: "accept" });
    expect(r.ok).toBe(false);
  });

  test("from unstarted → INVALID_TRANSITION", () => {
    const r = transition(baseStory("unstarted"), { kind: "accept" });
    expect(r.ok).toBe(false);
  });
});

describe("transition: reject", () => {
  test("started → rejected (with reason)", () => {
    const r = transition(baseStory("started"), { kind: "reject", reason: "scope mismatch" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe("rejected");
      expect(r.value.reject_reason).toBe("scope mismatch");
    }
  });

  test("finished → rejected", () => {
    const r = transition(baseStory("finished"), { kind: "reject", reason: "broken" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("rejected");
  });

  test("delivered → rejected", () => {
    const r = transition(baseStory("delivered"), { kind: "reject", reason: "bug found" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("rejected");
  });

  test("from unstarted → INVALID_TRANSITION (nothing to reject)", () => {
    const r = transition(baseStory("unstarted"), { kind: "reject", reason: "x" });
    expect(r.ok).toBe(false);
  });

  test("from accepted → INVALID_TRANSITION (terminal)", () => {
    const r = transition(
      baseStory("accepted", { accepted_at: "2026-05-03T10:00:00.000Z" }),
      { kind: "reject", reason: "x" },
    );
    expect(r.ok).toBe(false);
  });

  test("from rejected → INVALID_TRANSITION", () => {
    const r = transition(
      baseStory("rejected", { reject_reason: "old" }),
      { kind: "reject", reason: "new" },
    );
    expect(r.ok).toBe(false);
  });
});

describe("transition: restart", () => {
  test("rejected → started (clears reject_reason)", () => {
    const r = transition(
      baseStory("rejected", { reject_reason: "old reason" }),
      { kind: "restart" },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.state).toBe("started");
      expect(r.value.reject_reason).toBeUndefined();
    }
  });

  test("from any non-rejected → INVALID_TRANSITION", () => {
    for (const state of ["unstarted", "started", "finished", "delivered"] as StoryState[]) {
      const r = transition(baseStory(state), { kind: "restart" });
      expect(r.ok).toBe(false);
    }
  });
});

describe("TRANSITION_TABLE: all 36 cells (6 states × 6 commands)", () => {
  const STATES: StoryState[] = [
    "unstarted",
    "started",
    "finished",
    "delivered",
    "accepted",
    "rejected",
  ];
  const COMMANDS: Command["kind"][] = [
    "start",
    "finish",
    "deliver",
    "accept",
    "reject",
    "restart",
  ];

  // Build a story that's valid in the given state. Accepted/rejected need
  // their extra fields to satisfy schema refinements when needed (but the
  // transition function only reads state, so a minimal story works).
  const storyAt = (s: StoryState): StoryFrontmatter => {
    if (s === "rejected") {
      return {
        id: "T-1001-aaaa",
        type: "feature",
        state: s,
        points: 3,
        position: "a0",
        labels: [],
        icebox: false,
        created: "2026-05-08",
        reject_reason: "scope",
      };
    }
    return {
      id: "T-1001-aaaa",
      type: "feature",
      state: s,
      points: 3,
      position: "a0",
      labels: [],
      icebox: false,
      created: "2026-05-08",
      ...(s === "accepted" ? { accepted_at: "2026-05-08T10:00:00.000Z" } : {}),
    };
  };

  const cmdFor = (kind: Command["kind"]): Command =>
    kind === "reject" ? { kind: "reject", reason: "test" } : ({ kind } as Command);

  for (const state of STATES) {
    for (const kind of COMMANDS) {
      const expected = TRANSITION_TABLE[state][kind];
      test(`${state} + ${kind} → ${expected}`, () => {
        const r = transition(storyAt(state), cmdFor(kind));
        if (expected === "INVALID_TRANSITION") {
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.error.kind).toBe("INVALID_TRANSITION");
        } else {
          expect(r.ok).toBe(true);
          if (r.ok) expect(r.value.state).toBe(expected);
        }
      });
    }
  }

  test("table reports exactly 11 valid transitions", () => {
    let validCount = 0;
    for (const state of STATES) {
      for (const kind of COMMANDS) {
        if (TRANSITION_TABLE[state][kind] !== "INVALID_TRANSITION") validCount++;
      }
    }
    expect(validCount).toBe(11);
  });
});

describe("transition: pure function (no mutation)", () => {
  test("input story is not mutated", () => {
    const story = baseStory("started");
    const before = JSON.stringify(story);
    transition(story, { kind: "finish" });
    expect(JSON.stringify(story)).toBe(before);
  });

  test("output story is a fresh object", () => {
    const story = baseStory("started");
    const r = transition(story, { kind: "finish" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).not.toBe(story);
  });
});
