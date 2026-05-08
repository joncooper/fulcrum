import { describe, expect, test } from "bun:test";
import { matchesQuery } from "../../src/web/components/SearchBar.tsx";

const story = {
  id: "T-1042-abcd",
  title: "Iteration close ritual",
  body: "# Iteration close ritual\n\nA 400ms transition.",
  labels: ["motion", "ritual"],
};

describe("matchesQuery", () => {
  test("empty query matches everything", () => {
    expect(matchesQuery(story, "")).toBe(true);
  });

  test("matches title (case-insensitive)", () => {
    expect(matchesQuery(story, "RITUAL")).toBe(true);
    expect(matchesQuery(story, "iter")).toBe(true);
  });

  test("matches body content", () => {
    expect(matchesQuery(story, "400ms")).toBe(true);
    expect(matchesQuery(story, "transition")).toBe(true);
  });

  test("matches id (full or short)", () => {
    expect(matchesQuery(story, "T-1042")).toBe(true);
    expect(matchesQuery(story, "1042")).toBe(true);
    expect(matchesQuery(story, "abcd")).toBe(true);
  });

  test("matches labels", () => {
    expect(matchesQuery(story, "motion")).toBe(true);
  });

  test("non-match returns false", () => {
    expect(matchesQuery(story, "nope-not-here")).toBe(false);
  });
});
