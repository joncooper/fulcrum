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
 */
export class FileWatcher {
  private watcher: FSWatcher;
  private recentSelfWrites = new Map<string, number>();
  private readonly SELF_WRITE_TTL_MS = 200;
  private readonly DEBOUNCE_MS = 100;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private project: ProjectRoot,
    private hub: SseHub,
  ) {
    this.watcher = watch(this.project.fulcrumDir, {
      ignored: [/\.cache\b/, /\.tmp\./, /\.last-write/],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 25 },
    });

    this.watcher.on("add", (path: string) => this.handleEvent(path));
    this.watcher.on("change", (path: string) => this.handleEvent(path));
    this.watcher.on("unlink", (path: string) => this.handleEvent(path, true));
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
      this.hub.broadcast({
        type: removed ? "story-removed" : "stories-changed",
        path: abs,
      });
    }, this.DEBOUNCE_MS);
    this.debounceTimers.set(abs, t);
  }

  async stop(): Promise<void> {
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    await this.watcher.close();
  }
}
