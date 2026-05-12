import { describe, expect, test } from "bun:test";
import {
  StoryFrontmatterSchema,
  idMatches,
  shortId,
  validatePointsAgainstScale,
  type StoryFrontmatter,
} from "../../src/domain/schemas/story.ts";

const baseStory: StoryFrontmatter = {
  id: "T-1042-7b21",
  type: "feature",
  state: "unstarted",
  points: 3,
  position: "a0",
  labels: [],
  icebox: false,
  created: "2026-05-08",
};

describe("StoryFrontmatterSchema — happy paths", () => {
  test("parses a minimal valid feature story", () => {
    const result = StoryFrontmatterSchema.safeParse(baseStory);
    expect(result.success).toBe(true);
  });

  test("parses a bug story without points", () => {
    const { points: _omit, ...withoutPoints } = baseStory;
    void _omit;
    const result = StoryFrontmatterSchema.safeParse({
      ...withoutPoints,
      type: "bug",
    });
    expect(result.success).toBe(true);
  });

  test("parses a chore story without points", () => {
    const { points: _omit, ...withoutPoints } = baseStory;
    void _omit;
    const result = StoryFrontmatterSchema.safeParse({
      ...withoutPoints,
      type: "chore",
    });
    expect(result.success).toBe(true);
  });

  test("parses a story with M2-reserved fields populated", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      assignee: "@claude-code",
      transcripts: ".fulcrum/transcripts/T-1042-7b21/2026-05-08T10:00.jsonl",
      artifact: "/design/concepts/login.png",
      provenance: "fulcrum: T-1042 land conflict UX",
    });
    expect(result.success).toBe(true);
  });
});

describe("StoryFrontmatterSchema — id format", () => {
  test("rejects id missing suffix", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      id: "T-1042",
    });
    expect(result.success).toBe(false);
  });

  test("rejects id with non-hex suffix", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      id: "T-1042-zzzz",
    });
    expect(result.success).toBe(false);
  });

  test("rejects id with wrong suffix length", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      id: "T-1042-7b2",
    });
    expect(result.success).toBe(false);
  });

  test("accepts id with sequence > 4 digits", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      id: "T-99999-7b21",
    });
    expect(result.success).toBe(true);
  });
});

describe("StoryFrontmatterSchema — refinements", () => {
  test("feature without points is allowed (deferred estimation)", () => {
    const { points: _omit, ...withoutPoints } = baseStory;
    void _omit;
    const result = StoryFrontmatterSchema.safeParse(withoutPoints);
    // Features may skip estimation at create time; user can size later
    // in the iteration close panel or via fulcrum edit.
    expect(result.success).toBe(true);
  });

  test("non-feature stories cannot carry points (bug/chore/release are non-estimable)", () => {
    for (const t of ["bug", "chore", "release"] as const) {
      const result = StoryFrontmatterSchema.safeParse({
        ...baseStory,
        type: t,
        points: 3,
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.includes("points"))).toBe(true);
      }
    }
  });

  test("schema accepts any non-negative integer for points (scale is project-driven)", () => {
    // Structural validation: any non-negative int. The "must be in estimate_scale"
    // check is enforced at the write boundary via validatePointsAgainstScale.
    for (const pts of [0, 1, 2, 3, 4, 5, 7, 8, 100]) {
      const result = StoryFrontmatterSchema.safeParse({ ...baseStory, points: pts });
      expect(result.success).toBe(true);
    }
  });

  test("Fibonacci points {0,1,2,3,5,8} all accepted for feature", () => {
    for (const pts of [0, 1, 2, 3, 5, 8]) {
      const result = StoryFrontmatterSchema.safeParse({ ...baseStory, points: pts });
      expect(result.success).toBe(true);
    }
  });

  test("validatePointsAgainstScale: undefined points → no error", () => {
    expect(validatePointsAgainstScale(undefined, [0, 1, 2, 3, 5, 8])).toBe(null);
  });

  test("validatePointsAgainstScale: in-scale value → no error", () => {
    expect(validatePointsAgainstScale(3, [0, 1, 2, 3, 5, 8])).toBe(null);
  });

  test("validatePointsAgainstScale: off-scale value → error", () => {
    const err = validatePointsAgainstScale(4, [0, 1, 2, 3, 5, 8]);
    expect(err).not.toBe(null);
    expect(err).toContain("0, 1, 2, 3, 5, 8");
  });

  test("validatePointsAgainstScale: respects custom scale", () => {
    // Project chose a different scale; 4 is now legal.
    expect(validatePointsAgainstScale(4, [0, 1, 2, 4, 8])).toBe(null);
    // But 5 is not.
    expect(validatePointsAgainstScale(5, [0, 1, 2, 4, 8])).not.toBe(null);
  });

  test("icebox=true on accepted is rejected", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      state: "accepted",
      icebox: true,
      iteration: 5,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("icebox"))).toBe(true);
    }
  });

  test("icebox=true on rejected is rejected", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      state: "rejected",
      icebox: true,
      reject_reason: "doesn't match plan",
    });
    expect(result.success).toBe(false);
  });

  test("icebox=true on started is allowed", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      state: "started",
      icebox: true,
    });
    expect(result.success).toBe(true);
  });

  test("rejected state without reject_reason is rejected", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      state: "rejected",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("reject_reason")),
      ).toBe(true);
    }
  });

  test("rejected state with reject_reason is accepted", () => {
    const result = StoryFrontmatterSchema.safeParse({
      ...baseStory,
      state: "rejected",
      reject_reason: "scope mismatch",
    });
    expect(result.success).toBe(true);
  });

  test("labels default to empty array when omitted", () => {
    const { labels: _omit, ...withoutLabels } = baseStory;
    void _omit;
    const result = StoryFrontmatterSchema.safeParse(withoutLabels);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.labels).toEqual([]);
    }
  });

  test("icebox defaults to false when omitted", () => {
    const { icebox: _omit, ...withoutIcebox } = baseStory;
    void _omit;
    const result = StoryFrontmatterSchema.safeParse(withoutIcebox);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.icebox).toBe(false);
    }
  });
});

describe("shortId / idMatches", () => {
  test("shortId extracts sequence from full id", () => {
    expect(shortId("T-1042-7b21")).toBe("1042");
    expect(shortId("T-99999-aaaa")).toBe("99999");
  });

  test("shortId throws on malformed id", () => {
    expect(() => shortId("T-1042")).toThrow();
    expect(() => shortId("not-an-id")).toThrow();
  });

  test("idMatches: full id exact match", () => {
    expect(idMatches("T-1042-7b21", "T-1042-7b21")).toBe(true);
    expect(idMatches("T-1042-7b21", "T-1043-7b21")).toBe(false);
  });

  test("idMatches: short numeric form", () => {
    expect(idMatches("1042", "T-1042-7b21")).toBe(true);
    expect(idMatches("1043", "T-1042-7b21")).toBe(false);
  });

  test("idMatches: T-prefixed without suffix", () => {
    expect(idMatches("T-1042", "T-1042-7b21")).toBe(true);
    expect(idMatches("T-1043", "T-1042-7b21")).toBe(false);
  });
});
