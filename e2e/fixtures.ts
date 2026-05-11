import { test as base } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

/**
 * Per-test fixture: a fresh `fulcrum init` in a tmpdir, with a running
 * `fulcrum serve` on an ephemeral port. The browser navigates to the
 * server's URL. After the test, the server is stopped and the tmpdir
 * removed.
 *
 * Uses `bun run ./bin/fulcrum` so the test exercises the same code path
 * production uses (Bun runtime, real CLI entry point).
 */

const REPO_ROOT = process.cwd();
const FULCRUM_BIN = join(REPO_ROOT, "bin", "fulcrum");

type FulcrumServer = {
  /** Project root (the tmpdir). */
  projectRoot: string;
  /** Base URL the browser should hit. */
  url: string;
  /** Server's port. */
  port: number;
};

let nextPort = 7700;

async function spawnServe(projectRoot: string): Promise<FulcrumServer & { proc: ChildProcess }> {
  const port = nextPort++;
  const proc = spawn("bun", ["run", FULCRUM_BIN, "serve", "--port", String(port)], {
    cwd: projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Wait for the server to be reachable by polling /api/health.
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return { projectRoot, url, port, proc };
    } catch {
      /* not ready yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error(`fulcrum serve never came up on ${url}`);
}

async function fulcrumCli(projectRoot: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", ["run", FULCRUM_BIN, ...args], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    proc.stdout.on("data", (c) => (stdout += String(c)));
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? 1, stdout }));
  });
}

export const test = base.extend<{ fulcrum: FulcrumServer }>({
  fulcrum: async ({}, use) => {
    const projectRoot = mkdtempSync(join(tmpdir(), "fulcrum-e2e-"));
    const initResult = await fulcrumCli(projectRoot, ["init", "e2e"]);
    if (initResult.code !== 0) {
      rmSync(projectRoot, { recursive: true, force: true });
      throw new Error(`fulcrum init failed: ${initResult.stdout}`);
    }
    const server = await spawnServe(projectRoot);
    try {
      await use(server);
    } finally {
      server.proc.kill("SIGTERM");
      // Wait briefly for graceful shutdown
      await new Promise((r) => setTimeout(r, 200));
      try {
        server.proc.kill("SIGKILL");
      } catch {
        /* already dead */
      }
      rmSync(projectRoot, { recursive: true, force: true });
    }
  },
});

export { expect } from "@playwright/test";

/** Helper for tests that need to drive `fulcrum new` etc. against the same project. */
export async function fulcrumCmd(
  projectRoot: string,
  args: string[],
): Promise<{ code: number; stdout: string }> {
  return fulcrumCli(projectRoot, args);
}
