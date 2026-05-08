import { describe, expect, test } from "bun:test";
import { formatIsoDate, iterationWindow } from "../../src/web/iteration-window.ts";

describe("iterationWindow", () => {
  test("7-day window starting 2026-05-08", () => {
    const w = iterationWindow({
      iteration_start_date: "2026-05-08",
      iteration_length_days: 7,
    });
    expect(w.start).toBe("2026-05-08");
    expect(w.end).toBe("2026-05-14");
  });

  test("crosses month boundary", () => {
    const w = iterationWindow({
      iteration_start_date: "2026-05-30",
      iteration_length_days: 7,
    });
    expect(w.start).toBe("2026-05-30");
    expect(w.end).toBe("2026-06-05");
  });

  test("1-day window has start == end", () => {
    const w = iterationWindow({
      iteration_start_date: "2026-01-01",
      iteration_length_days: 1,
    });
    expect(w.end).toBe("2026-01-01");
  });
});

describe("formatIsoDate", () => {
  test("formats as MMM D", () => {
    expect(formatIsoDate("2026-05-08")).toBe("May 8");
    expect(formatIsoDate("2026-12-25")).toBe("Dec 25");
    expect(formatIsoDate("2026-01-01")).toBe("Jan 1");
  });

  test("returns input on malformed string", () => {
    expect(formatIsoDate("not a date")).toBe("not a date");
  });
});
