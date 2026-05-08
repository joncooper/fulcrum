import { loadProject, writeProjectAtomic, type ProjectRoot } from "../domain/io/project.ts";
import {
  createStory,
  findStoryPath,
  listStories,
  readStoryFile,
  writeStoryAtomic,
} from "../domain/io/stories.ts";
import { closeIteration } from "../domain/iteration-close.ts";
import { between } from "../domain/position.ts";
import { StoryFrontmatterSchema, idMatches } from "../domain/schemas/story.ts";
import { transition, type Command } from "../domain/state-machine.ts";
import type { SseHub } from "./sse.ts";
import type { FileWatcher } from "./file-watcher.ts";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function titleFromBody(body: string): string {
  const firstLine = body.split("\n")[0] ?? "";
  return firstLine.replace(/^#\s*/, "").trim();
}

/** Replace the first H1 line in body with `# {title}`; preserves the rest. */
function replaceTitleInBody(body: string, title: string): string {
  const lines = body.split("\n");
  if (lines.length > 0 && /^#\s/.test(lines[0]!)) {
    lines[0] = `# ${title}`;
    return lines.join("\n");
  }
  // No H1 — prepend one with a blank separator.
  return `# ${title}\n\n${body}`;
}

export type ApiContext = {
  project: ProjectRoot;
  hub: SseHub;
  watcher: FileWatcher | null;
};

/**
 * HTTP API handler. Routes:
 *   GET    /api/health
 *   GET    /api/project
 *   GET    /api/stories
 *   GET    /api/stories/:id
 *   POST   /api/stories                         { type, title, points?, body? }
 *   PATCH  /api/stories/:id                     { position?, title?, body?,
 *                                                 points?, type?, labels?,
 *                                                 epic?, icebox?, expectedHash? }
 *   POST   /api/stories/:id/transitions/:verb   { reason? } for reject
 *   POST   /api/iteration/close                 { acceptedIds: string[] }
 *   GET    /api/events                          SSE stream
 */
export async function handleApi(req: Request, ctx: ApiContext): Promise<Response> {
  const { project, hub, watcher } = ctx;
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  if (pathname === "/api/events") {
    if (method !== "GET") {
      return json({ error: { kind: "METHOD_NOT_ALLOWED", message: `${method} not allowed` } }, 405);
    }
    return hub.openStream();
  }

  // Read-only routes
  if (method === "GET" || method === "HEAD") {

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

  // Write routes
  if (method === "POST" && pathname === "/api/stories") {
    let body: { type?: string; title?: string; points?: number; body?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "request body is not JSON" } }, 400);
    }
    const type = body.type;
    if (type !== "feature" && type !== "bug" && type !== "chore" && type !== "release") {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "type must be feature/bug/chore/release" } }, 400);
    }
    const title = (body.title ?? "").trim();
    if (title.length === 0) {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "title required" } }, 400);
    }

    const list = await listStories(project.storiesDir);
    if (!list.ok) return json({ error: list.error }, 500);
    const lastPos =
      list.value.stories.length === 0
        ? null
        : list.value.stories[list.value.stories.length - 1]!.story.frontmatter.position;
    const position = between(lastPos, null);

    const result = await createStory({
      storiesDir: project.storiesDir,
      type,
      title,
      points: body.points,
      position,
      body: body.body,
    });
    if (!result.ok) return json({ error: result.error }, 400);

    if (watcher) watcher.markSelfWrite(result.value.path);
    hub.broadcast({ type: "stories-changed", path: result.value.path, id: result.value.story.frontmatter.id });

    return json(
      {
        ok: true,
        story: {
          ...result.value.story.frontmatter,
          title,
          body: result.value.story.body,
        },
        path: result.value.path,
        hash: result.value.hash,
      },
      201,
    );
  }

  // PATCH /api/stories/:id — partial story update. Editable fields:
  //   position, title, body, points, type, labels, epic, icebox.
  // Immutable: id, state (use /transitions), iteration (set at close),
  // created, reject_reason (set by reject transition).
  const patchMatch = /^\/api\/stories\/([^/]+)$/.exec(pathname);
  if (method === "PATCH" && patchMatch) {
    const idQuery = patchMatch[1]!;

    let reqBody: Record<string, unknown>;
    try {
      reqBody = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "body is not JSON" } }, 400);
    }

    const ALLOWED = new Set([
      "position",
      "title",
      "body",
      "points",
      "type",
      "labels",
      "epic",
      "icebox",
      "expectedHash",
    ]);
    const unknownFields = Object.keys(reqBody).filter((k) => !ALLOWED.has(k));
    if (unknownFields.length > 0) {
      return json(
        {
          error: {
            kind: "INVALID_FRONTMATTER",
            message: `unsupported fields: ${unknownFields.join(", ")}`,
          },
        },
        400,
      );
    }
    const editableFields = Object.keys(reqBody).filter((k) => k !== "expectedHash");
    if (editableFields.length === 0) {
      return json(
        { error: { kind: "INVALID_FRONTMATTER", message: "patch requires at least one field" } },
        400,
      );
    }
    if (reqBody.expectedHash !== undefined && typeof reqBody.expectedHash !== "string") {
      return json(
        { error: { kind: "INVALID_FRONTMATTER", message: "expectedHash must be a string" } },
        400,
      );
    }

    // Per-field shape checks (Zod re-validates the whole frontmatter below).
    if (reqBody.position !== undefined) {
      if (typeof reqBody.position !== "string" || reqBody.position.length === 0) {
        return json({ error: { kind: "INVALID_FRONTMATTER", message: "position must be a non-empty string" } }, 400);
      }
    }
    if (reqBody.title !== undefined) {
      if (typeof reqBody.title !== "string" || reqBody.title.trim().length === 0) {
        return json({ error: { kind: "INVALID_FRONTMATTER", message: "title must be a non-empty string" } }, 400);
      }
    }
    if (reqBody.body !== undefined && typeof reqBody.body !== "string") {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "body must be a string" } }, 400);
    }
    if (reqBody.icebox !== undefined && typeof reqBody.icebox !== "boolean") {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "icebox must be a boolean" } }, 400);
    }
    if (reqBody.labels !== undefined) {
      if (!Array.isArray(reqBody.labels) || !reqBody.labels.every((x) => typeof x === "string")) {
        return json({ error: { kind: "INVALID_FRONTMATTER", message: "labels must be string[]" } }, 400);
      }
    }
    if (reqBody.epic !== undefined && reqBody.epic !== null && typeof reqBody.epic !== "string") {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "epic must be a string or null" } }, 400);
    }
    if (reqBody.points !== undefined && reqBody.points !== null && typeof reqBody.points !== "number") {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "points must be a number or null" } }, 400);
    }
    if (reqBody.type !== undefined && reqBody.type !== "feature" && reqBody.type !== "bug" && reqBody.type !== "chore" && reqBody.type !== "release") {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "type must be feature/bug/chore/release" } }, 400);
    }

    const path = await findStoryPath({ storiesDir: project.storiesDir, query: idQuery });
    if (!path.ok) {
      const status = path.error.kind === "NOT_FOUND" ? 404 : 500;
      return json({ error: path.error }, status);
    }
    const file = await readStoryFile(path.value);
    if (!file.ok) return json({ error: file.error }, 500);

    // Compose the next frontmatter. `epic: null` clears the field; `points: null` clears it.
    const cur = file.value.story.frontmatter;
    const nextFm: Record<string, unknown> = { ...cur };
    if (reqBody.position !== undefined) nextFm.position = reqBody.position;
    if (reqBody.type !== undefined) nextFm.type = reqBody.type;
    if (reqBody.labels !== undefined) nextFm.labels = reqBody.labels;
    if (reqBody.icebox !== undefined) nextFm.icebox = reqBody.icebox;
    if (reqBody.epic !== undefined) {
      if (reqBody.epic === null) delete nextFm.epic;
      else nextFm.epic = reqBody.epic;
    }
    if (reqBody.points !== undefined) {
      if (reqBody.points === null) delete nextFm.points;
      else nextFm.points = reqBody.points;
    }

    const validated = StoryFrontmatterSchema.safeParse(nextFm);
    if (!validated.success) {
      return json(
        {
          error: {
            kind: "INVALID_FRONTMATTER",
            message: validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          },
        },
        400,
      );
    }

    // Body: explicit `body` wins; otherwise splice title into existing body.
    let nextBody = file.value.story.body;
    if (reqBody.body !== undefined) nextBody = reqBody.body as string;
    if (reqBody.title !== undefined) {
      nextBody = replaceTitleInBody(nextBody, (reqBody.title as string).trim());
    }

    const updated = { frontmatter: validated.data, body: nextBody };
    const written = await writeStoryAtomic({
      path: file.value.path,
      story: updated,
      expectedHash: (reqBody.expectedHash as string | undefined) ?? file.value.hash,
    });
    if (!written.ok) {
      const status = written.error.kind === "STALE_WRITE" ? 409 : 500;
      return json({ error: written.error }, status);
    }

    if (watcher) watcher.markSelfWrite(file.value.path);
    hub.broadcast({
      type: "stories-changed",
      path: file.value.path,
      id: updated.frontmatter.id,
    });

    return json({
      ok: true,
      story: {
        ...updated.frontmatter,
        title: titleFromBody(updated.body),
        body: updated.body,
      },
      path: file.value.path,
      hash: written.value.hash,
    });
  }

  const transitionMatch = /^\/api\/stories\/([^/]+)\/transitions\/(start|finish|deliver|accept|reject|restart)$/.exec(
    pathname,
  );
  if (method === "POST" && transitionMatch) {
    const idQuery = transitionMatch[1]!;
    const verb = transitionMatch[2]! as
      | "start"
      | "finish"
      | "deliver"
      | "accept"
      | "reject"
      | "restart";

    let reqBody: { reason?: string; expectedHash?: string } = {};
    if (req.headers.get("content-length") && Number(req.headers.get("content-length")) > 0) {
      try {
        reqBody = (await req.json()) as typeof reqBody;
      } catch {
        return json({ error: { kind: "INVALID_FRONTMATTER", message: "body is not JSON" } }, 400);
      }
    }

    const path = await findStoryPath({ storiesDir: project.storiesDir, query: idQuery });
    if (!path.ok) {
      const status = path.error.kind === "NOT_FOUND" ? 404 : 500;
      return json({ error: path.error }, status);
    }
    const file = await readStoryFile(path.value);
    if (!file.ok) return json({ error: file.error }, 500);

    let cmd: Command;
    if (verb === "reject") {
      const reason = reqBody.reason?.trim();
      if (!reason) {
        return json({ error: { kind: "INVALID_FRONTMATTER", message: "reject requires reason" } }, 400);
      }
      cmd = { kind: "reject", reason };
    } else {
      cmd = { kind: verb };
    }

    const transitioned = transition(file.value.story.frontmatter, cmd);
    if (!transitioned.ok) {
      return json({ error: transitioned.error }, 409);
    }

    const updated = { frontmatter: transitioned.value, body: file.value.story.body };
    const written = await writeStoryAtomic({
      path: file.value.path,
      story: updated,
      expectedHash: reqBody.expectedHash ?? file.value.hash,
    });
    if (!written.ok) {
      const status = written.error.kind === "STALE_WRITE" ? 409 : 500;
      return json({ error: written.error }, status);
    }

    if (watcher) watcher.markSelfWrite(file.value.path);
    hub.broadcast({
      type: "story-transitioned",
      path: file.value.path,
      id: transitioned.value.id,
      data: { from: file.value.story.frontmatter.state, to: transitioned.value.state },
    });

    return json({
      ok: true,
      story: {
        ...transitioned.value,
        title: titleFromBody(file.value.story.body),
        body: file.value.story.body,
      },
      path: file.value.path,
      hash: written.value.hash,
    });
  }

  if (method === "POST" && pathname === "/api/iteration/close") {
    let reqBody: { acceptedIds?: unknown };
    try {
      reqBody = (await req.json()) as typeof reqBody;
    } catch {
      return json({ error: { kind: "INVALID_FRONTMATTER", message: "body is not JSON" } }, 400);
    }
    const acceptedIds = reqBody.acceptedIds;
    if (!Array.isArray(acceptedIds) || !acceptedIds.every((x) => typeof x === "string")) {
      return json(
        { error: { kind: "INVALID_FRONTMATTER", message: "acceptedIds must be string[]" } },
        400,
      );
    }

    const projResult = loadProject(project);
    if (!projResult.ok) return json({ error: projResult.error }, 500);

    const list = await listStories(project.storiesDir);
    if (!list.ok) return json({ error: list.error }, 500);

    // Build a path map keyed by story id so we can write changes atomically with
    // CAS-on-hash (the original hash from the freshly-read story file).
    const loadedById = new Map(
      list.value.stories.map((s) => [s.story.frontmatter.id, s] as const),
    );
    const allIds = list.value.stories.map((s) => s.story.frontmatter.id);

    // Resolve callers' partial ids ("1001" or "T-1001") to full ids before
    // handing them to the domain layer. NOT_FOUND on miss; AMBIGUOUS_ID on
    // multiple matches — same semantics as findStoryPath for /transitions/.
    const resolvedIds: string[] = [];
    for (const q of acceptedIds) {
      const matches = allIds.filter((full) => idMatches(q, full));
      if (matches.length === 0) {
        return json(
          { error: { kind: "NOT_FOUND", message: `no story matches ${JSON.stringify(q)}` } },
          404,
        );
      }
      if (matches.length > 1) {
        return json(
          {
            error: {
              kind: "AMBIGUOUS_ID",
              message: `${matches.length} stories match ${JSON.stringify(q)}: ${matches.join(", ")}`,
            },
          },
          409,
        );
      }
      resolvedIds.push(matches[0]!);
    }

    const closeResult = closeIteration({
      project: projResult.value,
      stories: list.value.stories.map((s) => s.story),
      acceptedIds: resolvedIds,
    });
    if (!closeResult.ok) {
      const status =
        closeResult.error.kind === "NOT_FOUND"
          ? 404
          : closeResult.error.kind === "INVALID_TRANSITION"
            ? 409
            : 500;
      return json({ error: closeResult.error }, status);
    }

    // Persist each changed story (CAS-on-hash so concurrent edits surface as STALE_WRITE).
    const writtenIds: string[] = [];
    for (const updated of closeResult.value.changed) {
      const loaded = loadedById.get(updated.frontmatter.id);
      if (!loaded) {
        return json(
          {
            error: {
              kind: "NOT_FOUND",
              message: `internal: changed story ${updated.frontmatter.id} not in loaded set`,
            },
          },
          500,
        );
      }
      const written = await writeStoryAtomic({
        path: loaded.path,
        story: updated,
        expectedHash: loaded.hash,
      });
      if (!written.ok) {
        const status = written.error.kind === "STALE_WRITE" ? 409 : 500;
        return json({ error: written.error }, status);
      }
      if (watcher) watcher.markSelfWrite(loaded.path);
      writtenIds.push(updated.frontmatter.id);
    }

    // Persist the new project.yml (bumped iteration + recomputed velocity).
    const projWritten = await writeProjectAtomic(project, closeResult.value.project);
    if (!projWritten.ok) return json({ error: projWritten.error }, 500);
    if (watcher) watcher.markSelfWrite(project.projectFile);

    const closingIteration = projResult.value.current_iteration;
    hub.broadcast({
      type: "iteration-closed",
      data: {
        closed_iteration: closingIteration,
        next_iteration: closeResult.value.project.current_iteration,
        velocity_actual: closeResult.value.velocity_actual,
        velocity_next: closeResult.value.project.velocity,
        accepted_ids: writtenIds,
        spilled_count: closeResult.value.spilled.length,
      },
    });

    return json({
      ok: true,
      closed_iteration: closingIteration,
      next_iteration: closeResult.value.project.current_iteration,
      velocity_actual: closeResult.value.velocity_actual,
      velocity_next: closeResult.value.project.velocity,
      accepted_ids: writtenIds,
      spilled_count: closeResult.value.spilled.length,
      project: closeResult.value.project,
    });
  }

  return json({ error: { kind: "METHOD_NOT_ALLOWED", message: `${method} ${pathname}` } }, 405);
}
