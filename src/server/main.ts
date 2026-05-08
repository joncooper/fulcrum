import { findProjectRoot, type ProjectRoot } from "../domain/io/project.ts";
import { handleApi } from "./api.ts";

export type ServeOptions = {
  /** Hostname to bind. Default 127.0.0.1. */
  hostname?: string;
  /** Port. 0 means OS-assigned (useful for tests). Default 3737. */
  port?: number;
  /** Pre-resolved project root. If undefined, server resolves from cwd. */
  project?: ProjectRoot;
};

export type RunningServer = {
  hostname: string;
  port: number;
  url: string;
  stop: () => Promise<void>;
};

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>fulcrum</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: 'IBM Plex Sans', system-ui, sans-serif; background: #fbf8f1; color: #1c1917; max-width: 60ch; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5; }
  code { background: #f5efde; padding: 0.1em 0.35em; border-radius: 2px; font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace; font-size: 0.9em; }
  ul { padding-left: 1.5rem; }
  small { color: #57534e; }
</style>
</head>
<body>
  <h1>fulcrum</h1>
  <p>Server is running. The dense web UI lands in <strong>D2</strong>.</p>
  <p>API endpoints (read-only in D1):</p>
  <ul>
    <li><code><a href="/api/health">/api/health</a></code></li>
    <li><code><a href="/api/project">/api/project</a></code></li>
    <li><code><a href="/api/stories">/api/stories</a></code></li>
    <li><code>/api/stories/:id</code></li>
  </ul>
  <p><small>fulcrum — product engineering surface for solo agentic engineering.</small></p>
</body>
</html>
`;

export function startServer(opts: ServeOptions = {}): RunningServer {
  const project = opts.project ?? findProjectRoot();
  if (!project) {
    throw new Error("not in a fulcrum project (run `fulcrum init` first)");
  }

  const server = Bun.serve({
    hostname: opts.hostname ?? "127.0.0.1",
    port: opts.port ?? 3737,
    development: false,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) {
        return handleApi(req, project);
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(LANDING_HTML, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("not found", { status: 404 });
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
