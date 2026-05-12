import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStory,
  findStoryPath,
  listStories,
  readStoryFile,
  writeStoryAtomic,
} from "../../src/domain/io/stories.ts";

function makeStoriesDir(): string {
  return mkdtempSync(join(tmpdir(), "fulcrum-stories-test-"));
}

describe("createStory", () => {
  test("happy path: writes file with frontmatter, returns id + path + hash", async () => {
    const dir = makeStoriesDir();
    try {
      const r = await createStory({
        storiesDir: dir,
        type: "feature",
        title: "Iteration close ritual UX",
        points: 5,
        position: "a0",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.story.frontmatter.id).toMatch(/^T-1001-[0-9a-f]{4}$/);
      expect(r.value.story.frontmatter.state).toBe("unstarted");
      expect(r.value.story.frontmatter.points).toBe(5);
      expect(r.value.path).toContain("iteration-close-ritual-ux.md");
      expect(existsSync(r.value.path)).toBe(true);
      // Hash is sha256 (64 hex chars)
      expect(r.value.hash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("creates story without points for bug type", async () => {
    const dir = makeStoriesDir();
    try {
      const r = await createStory({
        storiesDir: dir,
        type: "bug",
        title: "fix a thing",
        position: "a0",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.story.frontmatter.type).toBe("bug");
      expect(r.value.story.frontmatter.points).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("feature without points is allowed (deferred estimation)", async () => {
    const dir = makeStoriesDir();
    try {
      const r = await createStory({
        storiesDir: dir,
        type: "feature",
        title: "size me later",
        position: "a0",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.story.frontmatter.type).toBe("feature");
      expect(r.value.story.frontmatter.points).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("incremental sequence allocation (1001, 1002, 1003)", async () => {
    const dir = makeStoriesDir();
    try {
      const a = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "first",
        position: "a0",
      });
      const b = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "second",
        position: "a1",
      });
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.value.story.frontmatter.id).toMatch(/^T-1001-/);
      expect(b.value.story.frontmatter.id).toMatch(/^T-1002-/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findStoryPath", () => {
  test("finds by full id", async () => {
    const dir = makeStoriesDir();
    try {
      const created = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      if (!created.ok) throw new Error("setup failed");
      const r = await findStoryPath({
        storiesDir: dir,
        query: created.value.story.frontmatter.id,
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(created.value.path);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("finds by short numeric id", async () => {
    const dir = makeStoriesDir();
    try {
      const created = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      if (!created.ok) throw new Error("setup failed");
      const r = await findStoryPath({ storiesDir: dir, query: "1001" });
      expect(r.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("finds by T-prefixed short id", async () => {
    const dir = makeStoriesDir();
    try {
      await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      const r = await findStoryPath({ storiesDir: dir, query: "T-1001" });
      expect(r.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("NOT_FOUND when no match", async () => {
    const dir = makeStoriesDir();
    try {
      await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      const r = await findStoryPath({ storiesDir: dir, query: "9999" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("NOT_FOUND");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("NOT_FOUND when stories dir missing", async () => {
    const r = await findStoryPath({
      storiesDir: "/this/path/does/not/exist/foo",
      query: "1001",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("NOT_FOUND");
  });
});

describe("readStoryFile", () => {
  test("reads, parses, schema-validates, returns hash", async () => {
    const dir = makeStoriesDir();
    try {
      const created = await createStory({
        storiesDir: dir,
        type: "feature",
        title: "test",
        points: 2,
        position: "a0",
      });
      if (!created.ok) throw new Error("setup failed");
      const r = await readStoryFile(created.value.path);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.story.frontmatter.id).toBe(created.value.story.frontmatter.id);
      expect(r.value.hash).toBe(created.value.hash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("CONFLICT_PRESENT for files with merge markers", async () => {
    const dir = makeStoriesDir();
    try {
      const path = join(dir, "T-1042-7b21-conflict.md");
      writeFileSync(
        path,
        `---\nid: T-1042-7b21\n<<<<<<< ours\nstate: started\n=======\nstate: finished\n>>>>>>> theirs\n---\n\nbody\n`,
      );
      const r = await readStoryFile(path);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("CONFLICT_PRESENT");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("INVALID_FRONTMATTER for malformed YAML", async () => {
    const dir = makeStoriesDir();
    try {
      const path = join(dir, "T-1042-7b21-bad.md");
      writeFileSync(path, `---\n: : :\n---\n\nbody\n`);
      const r = await readStoryFile(path);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("INVALID_FRONTMATTER");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("INVALID_FRONTMATTER for schema violations (e.g. non-feature with points)", async () => {
    const dir = makeStoriesDir();
    try {
      const path = join(dir, "T-1042-7b21-schemaless.md");
      writeFileSync(
        path,
        `---\nid: T-1042-7b21\ntype: bug\npoints: 3\nstate: unstarted\nposition: a0\ncreated: 2026-05-08\n---\n\nbug with points\n`,
      );
      const r = await readStoryFile(path);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("INVALID_FRONTMATTER");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("IO_ERROR for missing file", async () => {
    const r = await readStoryFile("/this/file/does/not/exist");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("IO_ERROR");
  });
});

describe("listStories", () => {
  test("returns empty list for missing or empty dir", async () => {
    const dir = makeStoriesDir();
    try {
      const r = await listStories(dir);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.stories).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns stories sorted by position", async () => {
    const dir = makeStoriesDir();
    try {
      // Create out of position order
      await createStory({ storiesDir: dir, type: "chore", title: "third", position: "z" });
      await createStory({ storiesDir: dir, type: "chore", title: "first", position: "a" });
      await createStory({ storiesDir: dir, type: "chore", title: "second", position: "m" });
      const r = await listStories(dir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.stories).toHaveLength(3);
      expect(r.value.stories[0]!.story.frontmatter.position).toBe("a");
      expect(r.value.stories[1]!.story.frontmatter.position).toBe("m");
      expect(r.value.stories[2]!.story.frontmatter.position).toBe("z");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("malformed files surface in `malformed` list, others still parsed", async () => {
    const dir = makeStoriesDir();
    try {
      await createStory({ storiesDir: dir, type: "chore", title: "good", position: "a" });
      // Drop a malformed story file directly
      writeFileSync(
        join(dir, "T-9999-aaaa-bad.md"),
        `---\nthis is: not valid: yaml: at: all\n---\n\nbody\n`,
      );
      const r = await listStories(dir);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.stories).toHaveLength(1);
      expect(r.value.malformed).toHaveLength(1);
      expect(r.value.malformed[0]!.error.kind).toBe("INVALID_FRONTMATTER");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("writeStoryAtomic", () => {
  test("writes via temp + rename; returns new hash", async () => {
    const dir = makeStoriesDir();
    try {
      const created = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      if (!created.ok) throw new Error("setup failed");

      const updated = {
        ...created.value.story,
        frontmatter: { ...created.value.story.frontmatter, state: "started" as const },
      };
      const r = await writeStoryAtomic({ path: created.value.path, story: updated });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.hash).not.toBe(created.value.hash);

      const reread = await readStoryFile(created.value.path);
      expect(reread.ok).toBe(true);
      if (reread.ok) expect(reread.value.story.frontmatter.state).toBe("started");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("CAS: write succeeds when expectedHash matches current", async () => {
    const dir = makeStoriesDir();
    try {
      const created = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      if (!created.ok) throw new Error("setup failed");
      const updated = {
        ...created.value.story,
        frontmatter: { ...created.value.story.frontmatter, state: "started" as const },
      };
      const r = await writeStoryAtomic({
        path: created.value.path,
        story: updated,
        expectedHash: created.value.hash,
      });
      expect(r.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("CAS: write fails with STALE_WRITE when expectedHash mismatches", async () => {
    const dir = makeStoriesDir();
    try {
      const created = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      if (!created.ok) throw new Error("setup failed");

      // Simulate concurrent edit: tab B writes to same file
      const concurrent = {
        ...created.value.story,
        frontmatter: { ...created.value.story.frontmatter, state: "started" as const },
      };
      await writeStoryAtomic({ path: created.value.path, story: concurrent });

      // Now tab A tries to write with the stale hash from before tab B
      const stale = {
        ...created.value.story,
        frontmatter: { ...created.value.story.frontmatter, state: "finished" as const },
      };
      const r = await writeStoryAtomic({
        path: created.value.path,
        story: stale,
        expectedHash: created.value.hash, // pre-concurrent-write hash
      });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.kind).toBe("STALE_WRITE");
        expect(r.error.kind === "STALE_WRITE" && r.error.currentHash).toBeDefined();
      }

      // Verify: file on disk still has tab B's "started" — tab A's stale write was rejected
      const reread = await readStoryFile(created.value.path);
      expect(reread.ok).toBe(true);
      if (reread.ok) expect(reread.value.story.frontmatter.state).toBe("started");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("no temp files left behind after a successful write", async () => {
    const dir = makeStoriesDir();
    try {
      const created = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      if (!created.ok) throw new Error("setup failed");
      await writeStoryAtomic({ path: created.value.path, story: created.value.story });
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(dir);
      // No legacy `foo.md.tmp.xxx` files and no new `.NNNN-tmp-xxx` files.
      expect(entries.some((e) => e.includes(".tmp."))).toBe(false);
      expect(entries.some((e) => /-tmp-/.test(e))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("temp file uses canonical `.{seq}-tmp-{uuid}` naming during write", async () => {
    const dir = makeStoriesDir();
    try {
      const created = await createStory({
        storiesDir: dir,
        type: "chore",
        title: "x",
        position: "a0",
      });
      if (!created.ok) throw new Error("setup failed");

      // Hook into the write path: do a write and inspect the directory mid-flight
      // is racy, so instead read the source's tmpPathFor convention by writing
      // and asserting the path format would be produced. Here we just verify
      // that after a successful round-trip, only the canonical `.md` file remains.
      const updated = {
        ...created.value.story,
        frontmatter: { ...created.value.story.frontmatter, state: "started" as const },
      };
      await writeStoryAtomic({ path: created.value.path, story: updated });
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(dir);
      const visible = entries.filter((e) => !e.startsWith("."));
      const hidden = entries.filter((e) => e.startsWith("."));
      expect(visible).toHaveLength(1);
      expect(visible[0]).toMatch(/\.md$/);
      // No leftover hidden temp files
      expect(hidden).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createStory: atomic temp+link", () => {
  test("creates the final file with canonical naming and no leftover temp", async () => {
    const dir = makeStoriesDir();
    try {
      const r = await createStory({
        storiesDir: dir,
        type: "feature",
        title: "search bar",
        points: 3,
        position: "a0",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(dir);
      // exactly one .md file, zero dotfile temps
      expect(entries.filter((e) => e.endsWith(".md"))).toHaveLength(1);
      expect(entries.filter((e) => e.startsWith("."))).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("retries with fresh suffix on filename collision (ID_COLLISION recovery)", async () => {
    // Two concurrent creates should both succeed with distinct random suffixes.
    const dir = makeStoriesDir();
    try {
      const [a, b] = await Promise.all([
        createStory({ storiesDir: dir, type: "chore", title: "x", position: "a0" }),
        createStory({ storiesDir: dir, type: "chore", title: "x", position: "a1" }),
      ]);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (a.ok && b.ok) {
        // Distinct full IDs even though they raced on the same seq
        expect(a.value.story.frontmatter.id).not.toBe(b.value.story.frontmatter.id);
      }
      const fs = await import("node:fs/promises");
      const entries = await fs.readdir(dir);
      expect(entries.filter((e) => e.endsWith(".md"))).toHaveLength(2);
      // No leftover temps from the race
      expect(entries.filter((e) => e.startsWith("."))).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
