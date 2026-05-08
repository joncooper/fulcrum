import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectRoot } from "../../src/domain/io/project.ts";
import { initProject } from "../../src/domain/io/init.ts";
import { createStory } from "../../src/domain/io/stories.ts";
import { startServer, type RunningServer } from "../../src/server/main.ts";

let cwd: string;
let server: RunningServer;

beforeEach(async () => {
  cwd = mkdtempSync(join(tmpdir(), "fulcrum-server-test-"));
  await initProject({ cwd, name: "server-test" });
  await createStory({
    storiesDir: join(cwd, ".fulcrum/stories"),
    type: "feature",
    title: "first story",
    points: 3,
    position: "a0",
  });
  await createStory({
    storiesDir: join(cwd, ".fulcrum/stories"),
    type: "chore",
    title: "second story",
    position: "a1",
  });
  const proj = findProjectRoot(cwd);
  if (!proj) throw new Error("setup: project not found");
  server = startServer({ port: 0, project: proj });
});

afterEach(async () => {
  await server.stop();
  rmSync(cwd, { recursive: true, force: true });
});

describe("API: /api/health", () => {
  test("returns 200 with ok + name + version", async () => {
    const res = await fetch(`${server.url}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.name).toBe("fulcrum");
    expect(body.version).toBeDefined();
  });

  test("rejects POST with 405", async () => {
    const res = await fetch(`${server.url}/api/health`, { method: "POST" });
    expect(res.status).toBe(405);
  });
});

describe("API: /api/project", () => {
  test("returns project.yml as JSON", async () => {
    const res = await fetch(`${server.url}/api/project`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.project.name).toBe("server-test");
    expect(body.project.version).toBe(1);
  });
});

describe("API: /api/stories", () => {
  test("returns list of stories with title + body + hash", async () => {
    const res = await fetch(`${server.url}/api/stories`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.stories).toHaveLength(2);
    expect(body.stories[0].title).toBe("first story");
    expect(body.stories[0].state).toBe("unstarted");
    expect(body.stories[0].points).toBe(3);
    expect(body.stories[0].hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.stories[1].title).toBe("second story");
    expect(body.stories[1].type).toBe("chore");
    expect(body.malformed).toEqual([]);
  });

  test("stories sorted by position", async () => {
    const res = await fetch(`${server.url}/api/stories`);
    const body = (await res.json()) as Record<string, any>;
    expect(body.stories[0].position < body.stories[1].position).toBe(true);
  });
});

describe("API: /api/stories/:id", () => {
  test("returns one story by full id", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const fullId = list.stories[0]!.id;

    const res = await fetch(`${server.url}/api/stories/${fullId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      story: { id: string; title: string };
      hash: string;
    };
    expect(body.ok).toBe(true);
    expect(body.story.id).toBe(fullId);
    expect(body.story.title).toBe("first story");
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("returns one story by short numeric id", async () => {
    const res = await fetch(`${server.url}/api/stories/1001`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { story: { title: string } };
    expect(body.story.title).toBe("first story");
  });

  test("returns 404 for unknown id", async () => {
    const res = await fetch(`${server.url}/api/stories/9999`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("NOT_FOUND");
  });
});

describe("API: unknown routes", () => {
  test("returns 404 for unknown /api/ path", async () => {
    const res = await fetch(`${server.url}/api/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("/ returns the placeholder landing page (text/html)", async () => {
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("fulcrum");
    expect(text).toContain("/api/stories");
  });

  test("non-/api non-/ returns 404", async () => {
    const res = await fetch(`${server.url}/some/random/thing`);
    expect(res.status).toBe(404);
  });
});
