import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  allocateId,
  generateRandomSuffix,
  highestSequence,
} from "../../src/domain/id-allocator.ts";

function makeStoriesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "fulcrum-alloc-test-"));
  return dir;
}

describe("generateRandomSuffix", () => {
  test("returns 4 hex chars", () => {
    for (let i = 0; i < 20; i++) {
      const s = generateRandomSuffix();
      expect(s).toMatch(/^[0-9a-f]{4}$/);
    }
  });

  test("is non-deterministic across calls", () => {
    const samples = new Set<string>();
    for (let i = 0; i < 50; i++) samples.add(generateRandomSuffix());
    // 50 random 4-hex-char strings: collision probability ~50²/(2·65536) ≈ 1.9%
    // Not zero but very rarely all 50 collide; the test just verifies it's not constant.
    expect(samples.size).toBeGreaterThan(40);
  });
});

describe("highestSequence", () => {
  test("returns FIRST_SEQUENCE - 1 (1000) when stories dir is missing", async () => {
    const result = await highestSequence("/this/path/does/not/exist");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(1000);
  });

  test("returns FIRST_SEQUENCE - 1 (1000) for an empty stories dir", async () => {
    const dir = makeStoriesDir();
    try {
      const result = await highestSequence(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(1000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("finds max sequence across multiple files", async () => {
    const dir = makeStoriesDir();
    try {
      writeFileSync(join(dir, "T-1001-aaaa-first.md"), "");
      writeFileSync(join(dir, "T-1042-bbbb-mid.md"), "");
      writeFileSync(join(dir, "T-1003-cccc-low.md"), "");
      const result = await highestSequence(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(1042);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("ignores files that don't match the story filename pattern", async () => {
    const dir = makeStoriesDir();
    try {
      writeFileSync(join(dir, "T-1042-7b21-x.md"), "");
      writeFileSync(join(dir, "README.md"), "");
      writeFileSync(join(dir, ".DS_Store"), "");
      writeFileSync(join(dir, "T-99-bad.md"), ""); // missing hex suffix
      const result = await highestSequence(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(1042);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("matches files with no slug (T-{seq}-{hex}.md exactly)", async () => {
    const dir = makeStoriesDir();
    try {
      writeFileSync(join(dir, "T-1099-cafe.md"), "");
      const result = await highestSequence(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(1099);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("allocateId", () => {
  test("allocates first id as T-1001-{hex} on empty dir", async () => {
    const dir = makeStoriesDir();
    try {
      const result = await allocateId(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.sequence).toBe(1001);
      expect(result.value.fullId).toMatch(/^T-1001-[0-9a-f]{4}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("allocates max+1 when stories exist", async () => {
    const dir = makeStoriesDir();
    try {
      writeFileSync(join(dir, "T-1042-aaaa.md"), "");
      writeFileSync(join(dir, "T-1043-bbbb.md"), "");
      const result = await allocateId(dir);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.sequence).toBe(1044);
      expect(result.value.fullId).toMatch(/^T-1044-[0-9a-f]{4}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("two consecutive allocations on same dir produce different suffixes", async () => {
    const dir = makeStoriesDir();
    try {
      // Note: highestSequence reads disk each time. If we don't WRITE the first
      // story, both allocations see same max → both produce T-1001-{hex} but
      // with random suffixes. The test asserts different IDs.
      const a = await allocateId(dir);
      const b = await allocateId(dir);
      expect(a.ok).toBe(true);
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      // Same sequence (no write happened) but different suffix.
      expect(a.value.sequence).toBe(1001);
      expect(b.value.sequence).toBe(1001);
      // Suffixes are random 4-hex; collision probability ~1/65536
      expect(a.value.suffix).not.toBe(b.value.suffix);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
