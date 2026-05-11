# Fulcrum API reference

One source of truth for agent + human callers. Both surfaces operate on the
same `.fulcrum/` directory; either path produces identical end state.

- **CLI** — `fulcrum <command>` (this is what agents call from subprocesses)
- **HTTP** — JSON over `http://127.0.0.1:3737/api/*` (this is what the web UI
  calls; agents can use it too)

All write paths are atomic (temp file + rename / link) and protected by CAS
on SHA-256 hash to surface concurrent edits as `STALE_WRITE` rather than
silently overwriting.

---

## CLI

Every CLI subcommand accepts `--json` for parseable output. Non-zero exit
code indicates failure; in JSON mode, errors land on stderr as
`{"ok": false, "error": {"kind", "message"}}`.

### `fulcrum init [name]`

Initialize a new fulcrum project in the current directory. Creates
`.fulcrum/project.yml`, `.fulcrum/stories/`. If `name` is omitted, derives
it from the directory name.

JSON output:
```json
{ "ok": true, "name": "<name>", "projectFile": "<abs-path>/project.yml" }
```

### `fulcrum new <type> "<title>" [flags]`

Create a new story. `<type>` is one of `feature`, `bug`, `chore`, `release`.

Flags:
- `--points N` — required for `feature`; must be in the project's
  `settings.estimate_scale` (defaults to `{0,1,2,3,5,8}`). Non-feature types
  reject points entirely.
- `--epic SLUG` — attach to an epic.
- `--labels a,b,c` — comma-separated label list.
- `--json` — JSON output.

JSON output on success:
```json
{ "ok": true, "id": "T-1042-7b21", "type": "feature", "state": "unstarted",
  "points": 3, "title": "...", "path": "..." }
```

### `fulcrum list [flags]`

List all stories. Flags: `--state X`, `--type Y`, `--json`.

JSON output:
```json
{ "ok": true,
  "stories": [{ "id", "type", "state", "title", "points", "position",
                "icebox", "accepted_at", "iteration", "labels", "path" }],
  "malformed": [{ "path", "kind", "message" }] }
```

### `fulcrum show <id> [--json]`

Print one story's frontmatter + body. `<id>` accepts full
(`T-1042-7b21`), short (`T-1042`), or numeric (`1042`) forms.

### `fulcrum edit <id> [flags]`

Edit story fields in place. Flags:
- `--title "..."`, `--description "..."`, `--body @-` (read body from stdin)
- `--type X`, `--points N` (or `--points -` to clear),
- `--labels a,b,c`, `--epic SLUG` (or `--epic -` to clear),
- `--icebox true|false`, `--json`.

### `fulcrum rm <id> [--force] [--json]`

Delete a story. Prompts for confirmation unless `--force` or `--json`.

### `fulcrum start <id>` / `fulcrum finish <id>` / `fulcrum deliver <id>` / `fulcrum accept <id>` / `fulcrum reject <id> --reason "..."` / `fulcrum restart <id>`

State transitions. The forward verbs (`start`/`finish`/`deliver`) auto-chain
— `fulcrum finish` on an unstarted story = start + finish.

### `fulcrum doctor [--fix] [--json]`

Surface filesystem anomalies:
- Malformed YAML frontmatter
- Orphan temp files (`.fulcrum/stories/.{seq}-tmp-{uuid}`)
- ID collisions across worktrees
- Lexorank ranks longer than 12 chars (suggest `fulcrum repack`)

With `--fix`, deletes orphan temps. Other findings are reported only.

### `fulcrum serve [--port N] [--host X] [--json]`

Start the HTTP server on `http://127.0.0.1:3737`. Web UI served from
`dist/web/` if built; falls back to a "build first" message page otherwise.

---

## HTTP API

Base: `http://127.0.0.1:3737`. All endpoints return JSON. Server-Sent Events
on `/api/events` for live updates.

### `GET /api/health`

```json
{ "ok": true, "name": "fulcrum", "version": "0.0.1" }
```

### `GET /api/project`

```json
{ "ok": true,
  "project": { "version": 1, "name", "velocity", "current_iteration",
               "iteration_start_date", "iteration_length_days",
               "iteration_history": [{ "number", "start_date", "end_date", "velocity" }],
               "settings": { "estimate_scale": [...] } } }
```

### `GET /api/stories`

```json
{ "ok": true,
  "stories": [{ "id", "type", "state", "points?", "position", "epic?",
                "labels", "icebox", "accepted_at?", "iteration?", "created",
                "reject_reason?", "title", "body", "path", "hash" }],
  "malformed": [{ "path", "error": { "kind", "message" } }] }
```

The `hash` is SHA-256 of the on-disk file content. Pass it back via
`expectedHash` on write requests to opt into CAS protection.

### `GET /api/stories/:id`

```json
{ "ok": true, "story": { ... }, "path", "hash" }
```

### `POST /api/stories`

Create a story.

Body: `{ "type", "title", "points?", "body?", "epic?" }`

Returns `201 { ok: true, story, path, hash }` or `400 { error }`.

### `PATCH /api/stories/:id`

Update editable fields: `title`, `body`, `points`, `type`, `labels`,
`epic`, `icebox`, `position`. Pass `expectedHash` for CAS-on-hash
protection (returns `409 STALE_WRITE` on mismatch).

State is immutable via PATCH — use `/transitions/:verb` instead.

### `DELETE /api/stories/:id?expectedHash=...`

Delete a story. Returns `204` on success. `409 STALE_WRITE` if the on-disk
content changed underneath since `expectedHash` was captured.

### `POST /api/stories/:id/transitions/:verb`

`:verb` is one of `start`, `finish`, `deliver`, `accept`, `reject`,
`restart`. Body `{ "reason?", "expectedHash?" }`. Forward verbs auto-chain.

Returns `200 { ok: true, story, path, hash }` or `409` on
`INVALID_TRANSITION` / `STALE_WRITE`.

### `POST /api/iteration/close`

Run the iteration close ritual.

Body: `{ "acceptedIds": ["T-1042-7b21", ...] }`

The server:
1. Transitions each `acceptedId` from `delivered` to `accepted`.
2. Stamps `iteration: N` (immutable) on every accepted story whose
   `accepted_at` falls in the closing window.
3. Bumps `current_iteration`, advances `iteration_start_date` to today.
4. Recomputes `project.velocity` as rolling-3 average of
   `iteration_history`.

Returns:
```json
{ "ok": true, "closed_iteration", "next_iteration", "velocity_actual",
  "velocity_next", "accepted_ids", "spilled_count" }
```

### `GET /api/events` (SSE)

Server-Sent Events stream. Events:

- `stories-changed` — any story file changed (external git pull, manual edit, CLI write that wasn't suppressed). Client invalidates `stories` cache.
- `story-transitioned` — server completed a transition write. Client invalidates `stories` cache.
- `story-removed` — story file deleted. Client invalidates `stories` cache.
- `project-changed` — `project.yml` changed externally. Client invalidates `project` cache (drives live velocity reflow).
- `iteration-closed` — payload `{ closed_iteration, next_iteration, velocity_actual, velocity_next, accepted_ids, spilled_count }`. Triggers the 400ms close ritual transition.
- `watcher-restarted` — chokidar died and the server auto-restarted it. Client invalidates all caches (events during the gap may have been missed).

Browser auto-reconnects on disconnect (native `EventSource` 3s backoff).
On reconnect, the client invalidates all caches to recover from any missed
events during the gap.

---

## Concurrency and safety

- **Atomic writes.** Every story write goes through a temp file
  (`.fulcrum/stories/.{seq}-tmp-{uuid}`) and a single `rename` (replace)
  or `link` (create-or-fail) — never a partial write of the final
  filename.
- **CAS-on-hash.** Reads return the story plus its SHA-256 hash. Writes
  may pass that hash back as `expectedHash`. If the on-disk hash differs,
  the write returns `STALE_WRITE` with the current hash; the caller
  surfaces "this story changed under you" and the user re-reads + retries.
- **File watcher.** chokidar watches `.fulcrum/` and emits SSE events
  for external changes. Server's own writes are marked `recentSelfWrites`
  (TTL 200ms) and suppressed to avoid double-broadcast. Heartbeat probes
  detect a silently-dead watcher and auto-restart it (yellow indicator
  flashes for 2s).

---

## Error kinds

The server returns a structured error envelope:

```json
{ "error": { "kind": "<KIND>", "message": "..." } }
```

| `kind` | When | Status |
|---|---|---|
| `NOT_FOUND` | Story id doesn't resolve, file missing | 404 |
| `AMBIGUOUS_ID` | Short-form id matches multiple stories | 409 |
| `INVALID_FRONTMATTER` | Body failed schema or validation | 400 |
| `INVALID_TRANSITION` | State machine rejected the verb | 409 |
| `STALE_WRITE` | CAS-on-hash mismatch (concurrent edit) | 409 |
| `ID_COLLISION` | Two stories on disk claim the same id | (doctor only) |
| `IO_ERROR` | OS-level failure (ENOSPC, permission, etc.) | 500 |

CLI surfaces the same `kind` field in `--json` mode for parseable error
handling.
