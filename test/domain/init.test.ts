import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import YAML from "yaml";
import { initProject } from "../../src/domain/io/init.ts";

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), "fulcrum-init-test-"));
}

describe("initProject", () => {
  test("creates .fulcrum/project.yml and stories/ on a clean directory", async () => {
    const cwd = makeTmp();
    try {
      const result = await initProject({ cwd, name: "test-project" });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(existsSync(join(cwd, ".fulcrum"))).toBe(true);
      expect(statSync(join(cwd, ".fulcrum")).isDirectory()).toBe(true);
      expect(existsSync(join(cwd, ".fulcrum/project.yml"))).toBe(true);
      expect(existsSync(join(cwd, ".fulcrum/stories"))).toBe(true);
      expect(statSync(join(cwd, ".fulcrum/stories")).isDirectory()).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("project.yml content matches schema with provided name", async () => {
    const cwd = makeTmp();
    try {
      const result = await initProject({ cwd, name: "my-product" });
      expect(result.ok).toBe(true);

      const raw = readFileSync(join(cwd, ".fulcrum/project.yml"), "utf-8");
      const parsed = YAML.parse(raw);

      expect(parsed.version).toBe(1);
      expect(parsed.name).toBe("my-product");
      expect(parsed.velocity).toBe(0);
      expect(parsed.current_iteration).toBe(1);
      expect(parsed.settings).toEqual({ estimate_scale: [0, 1, 2, 3, 5, 8] });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("project.yml is deterministic: alphabetical keys, one field per line", async () => {
    const cwd = makeTmp();
    try {
      await initProject({ cwd, name: "alpha-test" });
      const raw = readFileSync(join(cwd, ".fulcrum/project.yml"), "utf-8");
      const lines = raw.trimEnd().split("\n");

      // Top-level keys appear alphabetically.
      const topLevelKeys = lines
        .filter((l) => /^[a-z_]+:/.test(l))
        .map((l) => l.split(":")[0]);
      const sorted = [...topLevelKeys].sort();
      expect(topLevelKeys).toEqual(sorted);

      // Trailing newline normalized to single \n.
      expect(raw.endsWith("\n")).toBe(true);
      expect(raw.endsWith("\n\n")).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns ALREADY_INITIALIZED if project.yml already exists", async () => {
    const cwd = makeTmp();
    try {
      const first = await initProject({ cwd, name: "first" });
      expect(first.ok).toBe(true);

      const second = await initProject({ cwd, name: "second" });
      expect(second.ok).toBe(false);
      if (second.ok) return;
      expect(second.error.kind).toBe("ALREADY_INITIALIZED");
      expect(second.error.message).toContain("already initialized");

      // First project name should still be intact.
      const raw = readFileSync(join(cwd, ".fulcrum/project.yml"), "utf-8");
      expect(YAML.parse(raw).name).toBe("first");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("returns IO_ERROR when cwd does not exist", async () => {
    const result = await initProject({
      cwd: "/this/path/definitely/does/not/exist/fulcrum-test",
      name: "ghost",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("IO_ERROR");
    expect(result.error.message).toContain("cwd does not exist");
  });

  test("project name with spaces and special characters is preserved verbatim in YAML", async () => {
    const cwd = makeTmp();
    try {
      const result = await initProject({ cwd, name: "Quirky Project: v2 (2026)" });
      expect(result.ok).toBe(true);

      const raw = readFileSync(join(cwd, ".fulcrum/project.yml"), "utf-8");
      const parsed = YAML.parse(raw);
      expect(parsed.name).toBe("Quirky Project: v2 (2026)");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
