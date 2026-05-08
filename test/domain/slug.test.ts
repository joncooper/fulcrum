import { describe, expect, test } from "bun:test";
import { slugify } from "../../src/domain/slug.ts";

describe("slugify", () => {
  test("basic title becomes lowercase-dash-separated", () => {
    expect(slugify("Iteration close ritual UX")).toBe("iteration-close-ritual-ux");
  });

  test("collapses runs of non-alphanumeric to single dash", () => {
    expect(slugify("foo!!! bar??? baz")).toBe("foo-bar-baz");
    expect(slugify("a / b / c")).toBe("a-b-c");
  });

  test("trims leading and trailing dashes", () => {
    expect(slugify("---trim---")).toBe("trim");
    expect(slugify("!!hello!!")).toBe("hello");
  });

  test("preserves digits", () => {
    expect(slugify("M1 plan v2")).toBe("m1-plan-v2");
  });

  test("non-ASCII letters get stripped or transliterated to ASCII range", () => {
    // Latin combining marks get stripped; other scripts produce empty → fallback "story"
    expect(slugify("Café Résumé")).toBe("cafe-resume");
  });

  test("empty / whitespace input falls back to 'story'", () => {
    expect(slugify("")).toBe("story");
    expect(slugify("   ")).toBe("story");
    expect(slugify("???")).toBe("story");
  });

  test("caps at 60 chars without trailing dash", () => {
    const long = "a".repeat(80) + " bee";
    const out = slugify(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out).not.toEndWith("-");
  });
});
