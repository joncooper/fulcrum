import { watch, type FSWatcher } from "chokidar";
import { resolve } from "node:path";
import type { ProjectRoot } from "../domain/io/project.ts";
import type { SseHub } from "./sse.ts";

/**
 * Watches `.fulcrum/` for external changes (CLI commands, git pull, manual
 * editor edit) and broadcasts SSE events. The server's own writes are added
 * to `recentSelfWrites` BEFORE the file is touched and removed when the
 * watcher fires for that path (or after a 200ms TTL). When the watcher
 * fires for a path in the set, we suppress (we already broadcast at write
 * time per D12).
 *
 * Health: chokidar can die silently on macOS under load. We emit a heartbeat
 * to ourselves via a short-lived touch file every HEARTBEAT_MS; if the
 * watcher doesn't see the touch within HEARTBEAT_TIMEOUT_MS, we assume the
 * watcher is dead, broadcast `watcher-restarted` (yellow indicator), close
 * the dead watcher, and start a fresh one. The client invalidates all
 * caches on the SSE reconnect that follows, so any events missed during the
 * gap are recovered.
 */
export class FileWatcher {
  private watcher: FSWatcher;
  private recentSelfWrites = new Map<string, number>();
  private readonly SELF_WRITE_TTL_MS = 200;
  private readonly DEBOUNCE_MS = 100;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Heartbeat plumbing
  private readonly HEARTBEAT_MS = 5_000;
  private readonly HEARTBEAT_TIMEOUT_MS = 12_000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatSeenAt: number = Date.now();
  private heartbeatToken: string | null = null;

  constructor(
    private project: ProjectRoot,
    private hub: SseHub,
  ) {
    this.watcher = this.createWatcher();
    this.startHeartbeat();
  }

  private createWatcher(): FSWatcher {
    const w = watch(this.project.fulcrumDir, {
      // Ignore atomic-write temp files. The canonical form is
      // `.fulcrum/stories/.{seq}-tmp-{uuid}` (per tmpPathFor in io/stories.ts).
      // Keep `\.tmp\.` for legacy files that may linger from prior versions.
      // Also ignore the heartbeat touch file (`.fulcrum/.heartbeat`) which is
      // expected and would otherwise broadcast a spurious "changed" event.
      ignored: [
        /\.cache\b/,
        /\.tmp\./,
        /-tmp-[0-9a-f]+$/,
        /\.last-write/,
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    });
    w.on("add", (path: string) => this.handleEvent(path));
    w.on("change", (path: string) => this.handleEvent(path));
    w.on("unlink", (path: string) => this.handleEvent(path, true));
    return w;
  }

  /**
   * Tell the watcher "ignore the next event for this path because the server
   * just wrote it." Per D12 the in-memory set has a short TTL.
   */
  markSelfWrite(path: string): void {
    this.recentSelfWrites.set(resolve(path), Date.now() + this.SELF_WRITE_TTL_MS);
  }

  private handleEvent(path: string, removed = false): void {
    const abs = resolve(path);
    // Heartbeat probe file: our own touches confirm the watcher is alive.
    // Don't broadcast SSE for these — just record the timestamp.
    if (abs.endsWith("/.heartbeat") && abs.startsWith(resolve(this.project.fulcrumDir))) {
      this.lastHeartbeatSeenAt = Date.now();
      return;
    }
    const expiresAt = this.recentSelfWrites.get(abs);
    if (expiresAt !== undefined && Date.now() < expiresAt) {
      // Self-write — suppress; SSE was already broadcast at write time.
      this.recentSelfWrites.delete(abs);
      return;
    }

    // Per-path debounce: a `git pull` rewriting many files in quick succession
    // produces one event per file, but we coalesce per-path within DEBOUNCE_MS
    // and broadcast at most once per file in the burst.
    const existing = this.debounceTimers.get(abs);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.debounceTimers.delete(abs);
      const isProjectFile = abs === resolve(this.project.projectFile);
      const type = removed
        ? "story-removed"
        : isProjectFile
          ? "project-changed"
          : "stories-changed";
      this.hub.broadcast({ type, path: abs });
    }, this.DEBOUNCE_MS);
    this.debounceTimers.set(abs, t);
  }

  private startHeartbeat(): void {
    this.lastHeartbeatSeenAt = Date.now();
    this.heartbeatTimer = setInterval(() => {
      void this.beat();
    }, this.HEARTBEAT_MS);
  }

  private async beat(): Promise<void> {
    const heartbeatPath = resolve(this.project.fulcrumDir, ".heartbeat");
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.heartbeatToken = token;
    try {
      const { writeFile } = await import("node:fs/promises");
      // Write a small file the watcher should pick up. The watcher recognizes
      // the path and bumps lastHeartbeatSeenAt without broadcasting.
      await writeFile(heartbeatPath, token, { encoding: "utf-8" });
    } catch {
      // disk full or read-only — heartbeat will look dead, that's the right
      // signal to the client anyway
    }
    // After HEARTBEAT_TIMEOUT_MS, check whether the watcher saw any touch.
    const since = Date.now() - this.lastHeartbeatSeenAt;
    if (since > this.HEARTBEAT_TIMEOUT_MS) {
      await this.restartWatcher();
    }
  }

  private async restartWatcher(): Promise<void> {
    try {
      await this.watcher.close();
    } catch {
      /* best effort */
    }
    this.watcher = this.createWatcher();
    this.lastHeartbeatSeenAt = Date.now();
    this.hub.broadcast({
      type: "watcher-restarted",
      data: { at: new Date().toISOString() },
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(resolve(this.project.fulcrumDir, ".heartbeat"));
    } catch {
      /* may not exist */
    }
    await this.watcher.close();
  }
}
