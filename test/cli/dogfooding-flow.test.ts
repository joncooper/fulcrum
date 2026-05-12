import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../src/cli/main.ts";

/**
 * End-to-end integration tests for the CLI dogfooding loop:
 * init → new → list → start → finish → deliver → accept → show
 *
 * These exercise the full stack: arg parsing, project root discovery,
 * domain layer, file I/O, atomic writes, state machine.
 */

let cwd: string;
let originalCwd: string;
let stdoutChunks: string[] = [];
let stderrChunks: string[] = [];

const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(join(tmpdir(), "fulcrum-cli-test-"));
  process.chdir(cwd);
  stdoutChunks = [];
  stderrChunks = [];
  // Capture writes
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return origStdoutWrite(chunk as string);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderrChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
    return origStderrWrite(chunk as string);
  }) as typeof process.stderr.write;
});

afterEach(() => {
  process.stdout.write = origStdoutWrite;
  process.stderr.write = origStderrWrite;
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

const stdout = (): string => stdoutChunks.join("");
const stderr = (): string => stderrChunks.join("");

describe("CLI dogfooding flow", () => {
  test("init creates project, new creates story, list shows it", async () => {
    expect(await main(["init", "test-project"])).toBe(0);
    stdoutChunks = [];

    expect(await main(["new", "feature", "Iteration close ritual UX", "--points", "5"])).toBe(0);
    expect(stdout()).toContain("T-1001-");
    expect(stdout()).toContain("Iteration close ritual UX");
    stdoutChunks = [];

    expect(await main(["list"])).toBe(0);
    const out = stdout();
    expect(out).toContain("★");
    expect(out).toContain("[5]");
    expect(out).toContain("unstarted");
    expect(out).toContain("Iteration close ritual UX");
  });

  test("new with --json emits parseable JSON", async () => {
    await main(["init"]);
    stdoutChunks = [];
    expect(await main(["new", "chore", "bun upgrade", "--json"])).toBe(0);
    const parsed = JSON.parse(stdout().trim());
    expect(parsed.ok).toBe(true);
    expect(parsed.id).toMatch(/^T-1001-[0-9a-f]{4}$/);
    expect(parsed.type).toBe("chore");
    expect(parsed.state).toBe("unstarted");
    expect(parsed.title).toBe("bun upgrade");
  });

  test("list with --json emits structured stories array", async () => {
    await main(["init"]);
    await main(["new", "feature", "first feature", "--points", "3"]);
    await main(["new", "bug", "fix a thing"]);
    stdoutChunks = [];

    expect(await main(["list", "--json"])).toBe(0);
    const parsed = JSON.parse(stdout().trim());
    expect(parsed.ok).toBe(true);
    expect(parsed.stories).toHaveLength(2);
    expect(parsed.stories[0].title).toBe("first feature");
    expect(parsed.stories[1].title).toBe("fix a thing");
    expect(parsed.malformed).toEqual([]);
  });

  test("full lifecycle: new → start → finish → deliver → accept → show", async () => {
    await main(["init"]);
    await main(["new", "feature", "ship M1", "--points", "8"]);
    stdoutChunks = [];

    // Capture the id from list --json
    await main(["list", "--json"]);
    const id = JSON.parse(stdout().trim()).stories[0].id;
    stdoutChunks = [];

    expect(await main(["start", id])).toBe(0);
    expect(stdout()).toContain("unstarted → started");
    stdoutChunks = [];

    expect(await main(["finish", id])).toBe(0);
    expect(stdout()).toContain("started → finished");
    stdoutChunks = [];

    expect(await main(["deliver", id])).toBe(0);
    expect(stdout()).toContain("finished → delivered");
    stdoutChunks = [];

    expect(await main(["accept", id])).toBe(0);
    expect(stdout()).toContain("delivered → accepted");
    stdoutChunks = [];

    expect(await main(["show", id])).toBe(0);
    const showOut = stdout();
    expect(showOut).toContain("state:     accepted");
    expect(showOut).toContain("ship M1");
  });

  test("auto-chain forward: finish on unstarted goes to finished", async () => {
    await main(["init"]);
    await main(["new", "chore", "auto-chain target"]);
    stdoutChunks = [];
    await main(["list", "--json"]);
    const id = JSON.parse(stdout().trim()).stories[0].id;
    stdoutChunks = [];

    expect(await main(["finish", id])).toBe(0);
    expect(stdout()).toContain("unstarted → finished");
  });

  test("auto-chain forward: deliver on unstarted goes to delivered", async () => {
    await main(["init"]);
    await main(["new", "chore", "ship now"]);
    stdoutChunks = [];
    await main(["list", "--json"]);
    const id = JSON.parse(stdout().trim()).stories[0].id;
    stdoutChunks = [];

    expect(await main(["deliver", id])).toBe(0);
    expect(stdout()).toContain("unstarted → delivered");
  });

  test("accept on unstarted is rejected (no auto-chain past delivered)", async () => {
    await main(["init"]);
    await main(["new", "chore", "x"]);
    stdoutChunks = [];
    await main(["list", "--json"]);
    const id = JSON.parse(stdout().trim()).stories[0].id;
    stderrChunks = [];

    expect(await main(["accept", id])).toBe(1);
    expect(stderr()).toContain("INVALID_TRANSITION");
  });

  test("reject requires --reason", async () => {
    await main(["init"]);
    await main(["new", "chore", "x"]);
    stdoutChunks = [];
    await main(["list", "--json"]);
    const id = JSON.parse(stdout().trim()).stories[0].id;
    await main(["start", id]);
    stderrChunks = [];

    expect(await main(["reject", id])).toBe(1);
    expect(stderr()).toContain("--reason");
  });

  test("reject with --reason transitions to rejected and persists reason", async () => {
    await main(["init"]);
    await main(["new", "chore", "x"]);
    stdoutChunks = [];
    await main(["list", "--json"]);
    const id = JSON.parse(stdout().trim()).stories[0].id;
    await main(["start", id]);
    stdoutChunks = [];

    expect(await main(["reject", id, "--reason", "scope mismatch"])).toBe(0);
    stdoutChunks = [];

    await main(["show", id, "--json"]);
    const story = JSON.parse(stdout().trim()).story;
    expect(story.frontmatter.state).toBe("rejected");
    expect(story.frontmatter.reject_reason).toBe("scope mismatch");
  });

  test("show by short numeric id resolves the full id", async () => {
    await main(["init"]);
    await main(["new", "feature", "the only story", "--points", "2"]);
    stdoutChunks = [];

    expect(await main(["show", "1001"])).toBe(0);
    expect(stdout()).toContain("T-1001-");
    expect(stdout()).toContain("the only story");
  });

  test("typed-into-cwd commands fail gracefully outside a fulcrum project", async () => {
    // No init; cwd has no .fulcrum/
    stderrChunks = [];
    expect(await main(["list"])).toBe(1);
    expect(stderr()).toContain("not in a fulcrum project");
  });

  test("two stories created in sequence get different ids and positions", async () => {
    await main(["init"]);
    await main(["new", "chore", "first"]);
    await main(["new", "chore", "second"]);
    stdoutChunks = [];

    await main(["list", "--json"]);
    const stories = JSON.parse(stdout().trim()).stories;
    expect(stories[0].id).not.toBe(stories[1].id);
    expect(stories[0].id).toMatch(/^T-1001-/);
    expect(stories[1].id).toMatch(/^T-1002-/);
    expect(stories[0].position < stories[1].position).toBe(true);
  });

  test("invalid points (4 — not Fibonacci) is rejected", async () => {
    await main(["init"]);
    stderrChunks = [];
    expect(await main(["new", "feature", "bad points", "--points", "4"])).toBe(1);
    expect(stderr()).toContain("INVALID_FRONTMATTER");
  });

  test("feature without --points is allowed (deferred estimation)", async () => {
    await main(["init"]);
    stdoutChunks = [];
    expect(await main(["new", "feature", "size me later"])).toBe(0);
    expect(stdout()).toContain("T-1001-");
    expect(stdout()).toContain("size me later");
    stdoutChunks = [];
    await main(["show", "1001"]);
    const out = stdout();
    expect(out).toContain("type:      feature");
    expect(out).not.toContain("points:");
  });

  test("filenames are slugified and grep-friendly", async () => {
    await main(["init"]);
    await main(["new", "feature", "Iteration close ritual: build the 400ms transition!", "--points", "5"]);
    const fs = await import("node:fs/promises");
    const entries = await fs.readdir(join(cwd, ".fulcrum/stories"));
    expect(entries.some((e) => e.includes("iteration-close-ritual-build-the-400ms-transition"))).toBe(true);
  });

  test("project.yml is at repo root and contains the project name", async () => {
    await main(["init", "my-thing"]);
    const yml = readFileSync(join(cwd, ".fulcrum/project.yml"), "utf-8");
    expect(yml).toContain("name: my-thing");
    expect(yml).toContain("version: 1");
  });

  test("edit changes the title (splices into H1)", async () => {
    await main(["init"]);
    await main(["new", "feature", "old title", "--points", "3"]);
    stdoutChunks = [];
    expect(await main(["edit", "1001", "--title", "renamed!"])).toBe(0);
    const dir = join(cwd, ".fulcrum/stories");
    const fs = await import("node:fs/promises");
    const files = await fs.readdir(dir);
    const content = readFileSync(join(dir, files[0]!), "utf-8");
    expect(content).toContain("# renamed!");
    expect(content).not.toContain("# old title");
  });

  test("edit type → bug requires clearing points (non-feature types are non-estimable)", async () => {
    await main(["init"]);
    await main(["new", "feature", "x", "--points", "1"]);
    stdoutChunks = [];
    // Two-step: clear points first, then change type — schema rejects bug with points.
    expect(await main(["edit", "1001", "--points", "-", "--type", "bug"])).toBe(0);
    stdoutChunks = [];
    await main(["show", "1001"]);
    const out = stdout();
    expect(out).toContain("type:      bug");
    expect(out).not.toContain("points:");
  });

  test("edit --points - clears points (chore created without points)", async () => {
    await main(["init"]);
    await main(["new", "chore", "do laundry"]);
    stdoutChunks = [];
    expect(await main(["edit", "1001", "--points", "-"])).toBe(0);
    stdoutChunks = [];
    await main(["show", "1001"]);
    const out = stdout();
    expect(out).not.toContain("points:    1");
  });

  test("edit rejects off-scale points (4)", async () => {
    await main(["init"]);
    await main(["new", "feature", "x", "--points", "1"]);
    stdoutChunks = [];
    stderrChunks = [];
    expect(await main(["edit", "1001", "--points", "4"])).toBe(1);
    expect(stderr()).toContain("INVALID_FRONTMATTER");
  });

  test("edit with no flags shows usage", async () => {
    await main(["init"]);
    await main(["new", "feature", "x", "--points", "1"]);
    stderrChunks = [];
    expect(await main(["edit", "1001"])).toBe(1);
    expect(stderr()).toContain("usage");
  });

  test("rm --force --json deletes the story file", async () => {
    await main(["init"]);
    await main(["new", "feature", "doomed", "--points", "1"]);
    const fs = await import("node:fs/promises");
    const before = await fs.readdir(join(cwd, ".fulcrum/stories"));
    expect(before.length).toBe(1);

    stdoutChunks = [];
    expect(await main(["rm", "1001", "--force", "--json"])).toBe(0);
    const after = await fs.readdir(join(cwd, ".fulcrum/stories"));
    expect(after.length).toBe(0);
    expect(stdout()).toContain('"ok":true');
  });

  test("rm of unknown id surfaces NOT_FOUND", async () => {
    await main(["init"]);
    stderrChunks = [];
    expect(await main(["rm", "9999", "--force"])).toBe(1);
    expect(stderr()).toContain("NOT_FOUND");
  });

  test("edit --description rewrites body but keeps title", async () => {
    await main(["init"]);
    await main(["new", "feature", "kept title", "--points", "1"]);
    stdoutChunks = [];
    expect(await main(["edit", "1001", "--description", "Now with detail."])).toBe(0);
    const dir = join(cwd, ".fulcrum/stories");
    const fs = await import("node:fs/promises");
    const files = await fs.readdir(dir);
    const content = readFileSync(join(dir, files[0]!), "utf-8");
    expect(content).toContain("# kept title");
    expect(content).toContain("Now with detail.");
  });

  test("new --epic stamps the epic field", async () => {
    await main(["init"]);
    stdoutChunks = [];
    expect(await main(["new", "feature", "x", "--points", "1", "--epic", "growth-loop"])).toBe(0);
    stdoutChunks = [];
    await main(["show", "1001"]);
    expect(stdout()).toContain("epic:      growth-loop");
  });

  test("doctor: clean repo reports all clear", async () => {
    await main(["init"]);
    await main(["new", "feature", "x", "--points", "1"]);
    stdoutChunks = [];
    expect(await main(["doctor"])).toBe(0);
    expect(stdout()).toContain("all clear");
  });

  test("doctor: detects orphan temp files in stories/", async () => {
    await main(["init"]);
    await main(["new", "feature", "x", "--points", "1"]);
    const dir = join(cwd, ".fulcrum/stories");
    const fs = await import("node:fs/promises");
    // Create an orphan temp file matching the `.{seq}-tmp-{uuid}` pattern.
    await fs.writeFile(join(dir, ".9999-tmp-deadbeefcafebabe"), "leftover\n");
    stdoutChunks = [];
    expect(await main(["doctor"])).toBe(0);
    expect(stdout()).toContain("orphan temp files (1)");
    expect(stdout()).toContain(".9999-tmp-");
  });

  test("doctor --fix: deletes orphan temp files", async () => {
    await main(["init"]);
    await main(["new", "feature", "x", "--points", "1"]);
    const dir = join(cwd, ".fulcrum/stories");
    const fs = await import("node:fs/promises");
    await fs.writeFile(join(dir, ".9999-tmp-deadbeefcafebabe"), "leftover\n");
    stdoutChunks = [];
    expect(await main(["doctor", "--fix"])).toBe(0);
    expect(stdout()).toContain("deleted 1 orphan temp");
    const remaining = await fs.readdir(dir);
    expect(remaining.some((e) => /-tmp-/.test(e))).toBe(false);
  });

  test("doctor --json: structured report shape", async () => {
    await main(["init"]);
    await main(["new", "feature", "x", "--points", "1"]);
    stdoutChunks = [];
    expect(await main(["doctor", "--json"])).toBe(0);
    const out = stdout().trim();
    const report = JSON.parse(out);
    expect(report.ok).toBe(true);
    expect(report.all_clear).toBe(true);
    expect(Array.isArray(report.malformed)).toBe(true);
    expect(Array.isArray(report.orphan_temps)).toBe(true);
    expect(Array.isArray(report.id_collisions)).toBe(true);
    expect(Array.isArray(report.long_ranks)).toBe(true);
  });
});
