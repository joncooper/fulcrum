import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findProjectRoot, type ProjectRoot } from "../domain/io/project.ts";
import { handleApi } from "./api.ts";

export type ServeOptions = {
  /** Hostname to bind. Default 127.0.0.1. */
  hostname?: string;
  /** Port. 0 means OS-assigned (useful for tests). Default 3737. */
  port?: number;
  /** Pre-resolved project root. If undefined, server resolves from cwd. */
  project?: ProjectRoot;
  /**
   * Path to the built web app's `dist/` directory. If undefined, server
   * locates it relative to this module (the repo's `dist/web/`). Useful for
   * tests that want to skip the static asset path.
   */
  webDist?: string | null;
};

export type RunningServer = {
  hostname: string;
  port: number;
  url: string;
  stop: () => Promise<void>;
};

const FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>fulcrum</title>
<style>
  body { font-family: 'IBM Plex Sans', system-ui, sans-serif; background: #fbf8f1; color: #1c1917; max-width: 60ch; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5; }
  code { background: #f5efde; padding: 0.1em 0.35em; border-radius: 2px; font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace; font-size: 0.9em; }
</style>
</head>
<body>
  <h1>fulcrum</h1>
  <p>The web UI hasn't been built yet. Run <code>bun run build</code> from the repo root, then reload.</p>
  <p>API: <code><a href="/api/stories">/api/stories</a></code> · <code><a href="/api/project">/api/project</a></code></p>
</body>
</html>
`;

function resolveWebDist(): string | null {
  // Default location: <repo-root>/dist/web (built by `bun run build`).
  // From src/server/main.ts (this file), the repo root is two dirs up.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, "../../dist/web");
  return existsSync(join(candidate, "index.html")) ? candidate : null;
}

const STATIC_CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

async function serveStatic(webDist: string, urlPath: string): Promise<Response | null> {
  // Map "/" and unknown SPA routes to /index.html
  let relPath = urlPath === "/" ? "/index.html" : urlPath;
  if (relPath.startsWith("/")) relPath = relPath.slice(1);

  // Prevent path traversal
  const fullPath = resolve(webDist, relPath);
  if (!fullPath.startsWith(webDist)) return null;
  if (!existsSync(fullPath)) return null;

  const ext = fullPath.slice(fullPath.lastIndexOf("."));
  const ct = STATIC_CONTENT_TYPES[ext] ?? "application/octet-stream";
  const file = Bun.file(fullPath);
  return new Response(file, { headers: { "content-type": ct } });
}

export function startServer(opts: ServeOptions = {}): RunningServer {
  const project = opts.project ?? findProjectRoot();
  if (!project) {
    throw new Error("not in a fulcrum project (run `fulcrum init` first)");
  }

  const webDist = opts.webDist === null ? null : opts.webDist ?? resolveWebDist();

  const server = Bun.serve({
    hostname: opts.hostname ?? "127.0.0.1",
    port: opts.port ?? 3737,
    development: false,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) {
        return handleApi(req, project);
      }

      if (webDist) {
        const direct = await serveStatic(webDist, url.pathname);
        if (direct) return direct;
        // SPA fallback: serve index.html for any unknown non-asset path
        const isAsset = /\.(js|css|map|woff2?|svg|png|ico|json)$/.test(url.pathname);
        if (!isAsset) {
          const index = await serveStatic(webDist, "/index.html");
          if (index) return index;
        }
        return new Response("not found", { status: 404 });
      }

      // No build present — fallback message telling user to run build
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(FALLBACK_HTML, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found (and the web UI hasn't been built)", { status: 404 });
    },
  });

  const hostname = server.hostname ?? opts.hostname ?? "127.0.0.1";
  const port = server.port ?? opts.port ?? 3737;

  return {
    hostname,
    port,
    url: `http://${hostname}:${port}`,
    stop: async () => {
      await server.stop(true);
    },
  };
}
