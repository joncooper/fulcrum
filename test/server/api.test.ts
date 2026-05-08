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
  // webDist: null skips the static-asset path so tests focus on the API.
  server = startServer({ port: 0, project: proj, webDist: null });
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

describe("API: PATCH /api/stories/:id (position)", () => {
  test("updates position, returns updated story + new hash", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string; hash: string; position: string }[];
    };
    const target = list.stories[0]!;
    expect(target.position).toBe("a0");

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: "a05" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      story: { id: string; position: string };
      hash: string;
    };
    expect(body.ok).toBe(true);
    expect(body.story.position).toBe("a05");
    expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.hash).not.toBe(target.hash);

    const after = (await (await fetch(`${server.url}/api/stories/${target.id}`)).json()) as {
      story: { position: string };
    };
    expect(after.story.position).toBe("a05");
  });

  test("returns 409 STALE_WRITE on hash mismatch", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: "a05", expectedHash: "deadbeef".repeat(8) }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("STALE_WRITE");
  });

  test("rejects unsupported fields with 400", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: "started" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { kind: string; message: string } };
    expect(body.error.kind).toBe("INVALID_FRONTMATTER");
    expect(body.error.message).toContain("state");
  });

  test("updates title (replaces H1 in body)", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "renamed first story" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; story: { title: string; body: string } };
    expect(body.ok).toBe(true);
    expect(body.story.title).toBe("renamed first story");
    expect(body.story.body.split("\n")[0]).toBe("# renamed first story");
  });

  test("updates points + type together", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ points: 8, type: "bug" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; story: { points: number; type: string } };
    expect(body.story.points).toBe(8);
    expect(body.story.type).toBe("bug");
  });

  test("rejects invalid points (off-scale) via schema validation", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ points: 4 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("INVALID_FRONTMATTER");
  });

  test("clears points with null", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string; type: string }[];
    };
    // Use the chore (no points required) so clearing is valid.
    const chore = list.stories.find((s) => s.type === "chore")!;

    const res = await fetch(`${server.url}/api/stories/${chore.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ points: null }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; story: { points?: number } };
    expect(body.story.points).toBeUndefined();
  });

  test("toggles icebox flag", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ icebox: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; story: { icebox: boolean } };
    expect(body.story.icebox).toBe(true);
  });

  test("updates labels (array)", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ labels: ["alpha", "beta"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; story: { labels: string[] } };
    expect(body.story.labels).toEqual(["alpha", "beta"]);
  });

  test("replaces full body when body field is provided", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const newBody = "# kept title\n\nThis is the new description.\n";
    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: newBody }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; story: { body: string; title: string } };
    expect(body.story.body).toBe(newBody);
    expect(body.story.title).toBe("kept title");
  });

  test("rejects empty body with 400", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("rejects non-string position with 400", async () => {
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = list.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: 42 }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 404 for unknown story id", async () => {
    const res = await fetch(`${server.url}/api/stories/9999`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ position: "a05" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("API: DELETE /api/stories/:id", () => {
  test("removes story file, returns 204, list shrinks", async () => {
    const before = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    expect(before.stories.length).toBe(2);
    const target = before.stories[0]!;

    const res = await fetch(`${server.url}/api/stories/${target.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);

    const after = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    expect(after.stories.length).toBe(1);
    expect(after.stories.some((s) => s.id === target.id)).toBe(false);
  });

  test("returns 404 for unknown id", async () => {
    const res = await fetch(`${server.url}/api/stories/9999`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  test("returns 409 STALE_WRITE on hash mismatch", async () => {
    const before = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const target = before.stories[0]!;
    const res = await fetch(
      `${server.url}/api/stories/${target.id}?expectedHash=${"deadbeef".repeat(8)}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("STALE_WRITE");
  });
});

describe("API: POST /api/iteration/close", () => {
  async function transitionTo(id: string, verb: string) {
    const res = await fetch(`${server.url}/api/stories/${id}/transitions/${verb}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`transition ${verb} ${id} failed: ${res.status} ${body}`);
    }
  }

  test("empty acceptedIds → bumps iteration, no stamped stories, velocity_actual 0", async () => {
    const res = await fetch(`${server.url}/api/iteration/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acceptedIds: [] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.closed_iteration).toBe(1);
    expect(body.next_iteration).toBe(2);
    expect(body.velocity_actual).toBe(0);
    expect(body.accepted_ids).toEqual([]);

    const proj = (await (await fetch(`${server.url}/api/project`)).json()) as {
      project: { current_iteration: number };
    };
    expect(proj.project.current_iteration).toBe(2);
  });

  test("close with one delivered story → story stamped + accepted, project bumped, velocity recomputed", async () => {
    await transitionTo("1001", "deliver"); // unstarted → delivered (auto-chain)

    const res = await fetch(`${server.url}/api/iteration/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acceptedIds: ["1001"] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.closed_iteration).toBe(1);
    expect(body.next_iteration).toBe(2);
    expect(body.velocity_actual).toBe(3); // first story has 3 points
    expect(body.velocity_next).toBe(3);
    expect(body.accepted_ids).toHaveLength(1);

    const story = (await (await fetch(`${server.url}/api/stories/1001`)).json()) as {
      story: { state: string; iteration: number };
    };
    expect(story.story.state).toBe("accepted");
    expect(story.story.iteration).toBe(1);
  });

  test("non-existent story id → 404", async () => {
    const res = await fetch(`${server.url}/api/iteration/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acceptedIds: ["T-9999-aaaa"] }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("NOT_FOUND");
  });

  test("non-delivered story → 409 INVALID_TRANSITION", async () => {
    // 1001 is currently unstarted (no transitions in this test)
    const list = (await (await fetch(`${server.url}/api/stories`)).json()) as {
      stories: { id: string }[];
    };
    const fullId = list.stories[0]!.id;
    const res = await fetch(`${server.url}/api/iteration/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ acceptedIds: [fullId] }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { kind: string } };
    expect(body.error.kind).toBe("INVALID_TRANSITION");
  });

  test("missing acceptedIds → 400", async () => {
    const res = await fetch(`${server.url}/api/iteration/close`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("API: unknown routes", () => {
  test("returns 404 for unknown /api/ path", async () => {
    const res = await fetch(`${server.url}/api/nonexistent`);
    expect(res.status).toBe(404);
  });

  test("/ returns the fallback landing page when no web build is present", async () => {
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text).toContain("fulcrum");
    expect(text).toContain("/api/stories");
  });

  test("non-/api non-/ returns 404 when no web build is present", async () => {
    const res = await fetch(`${server.url}/some/random/thing`);
    expect(res.status).toBe(404);
  });
});
