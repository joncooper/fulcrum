import { loadProject, type ProjectRoot } from "../domain/io/project.ts";
import { findStoryPath, listStories, readStoryFile } from "../domain/io/stories.ts";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function titleFromBody(body: string): string {
  const firstLine = body.split("\n")[0] ?? "";
  return firstLine.replace(/^#\s*/, "").trim();
}

/**
 * HTTP API handler. Routes:
 *   GET /api/health          → { ok, name, version }
 *   GET /api/project         → { ok, project }
 *   GET /api/stories         → { ok, stories: [...], malformed: [...] }
 *   GET /api/stories/:id     → { ok, story, path, hash }
 *
 * All endpoints are read-only in D1. Write endpoints land in E1.
 */
export async function handleApi(req: Request, project: ProjectRoot): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return json({ error: { kind: "METHOD_NOT_ALLOWED", message: `${req.method} not allowed` } }, 405);
  }

  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname === "/api/health") {
    return json({ ok: true, name: "fulcrum", version: "0.0.1" });
  }

  if (pathname === "/api/project") {
    const result = loadProject(project);
    if (!result.ok) return json({ error: result.error }, 500);
    return json({ ok: true, project: result.value });
  }

  if (pathname === "/api/stories") {
    const result = await listStories(project.storiesDir);
    if (!result.ok) return json({ error: result.error }, 500);
    return json({
      ok: true,
      stories: result.value.stories.map((s) => ({
        ...s.story.frontmatter,
        title: titleFromBody(s.story.body),
        body: s.story.body,
        path: s.path,
        hash: s.hash,
      })),
      malformed: result.value.malformed.map((m) => ({
        path: m.path,
        error: { kind: m.error.kind, message: m.error.message },
      })),
    });
  }

  const idMatch = /^\/api\/stories\/([^/]+)$/.exec(pathname);
  if (idMatch) {
    const path = await findStoryPath({ storiesDir: project.storiesDir, query: idMatch[1]! });
    if (!path.ok) {
      const status = path.error.kind === "NOT_FOUND" ? 404 : 500;
      return json({ error: path.error }, status);
    }
    const file = await readStoryFile(path.value);
    if (!file.ok) return json({ error: file.error }, 500);
    return json({
      ok: true,
      story: {
        ...file.value.story.frontmatter,
        title: titleFromBody(file.value.story.body),
        body: file.value.story.body,
      },
      path: file.value.path,
      hash: file.value.hash,
    });
  }

  return json({ error: { kind: "NOT_FOUND", message: `no route: ${pathname}` } }, 404);
}
