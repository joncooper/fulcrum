# Fulcrum

A product engineering surface for solo agentic engineering.

## What

Fulcrum is a Pivotal Tracker–DNA tracker rebuilt for a world where coding agents do most of the typing and the human's job is taste and curation. Local-only, in-repo, git-versionable. The board orchestrates work, captures provenance, and surfaces vision drift before it becomes slop.

## Why

Code generation has 1000x'd. Product judgment has not.

Terminal-agent loops (Claude Code, Codex, Cursor) are low-friction for *making code get written*. They are high-friction for *product engineering*: deliberately articulating what you're building, why, in what order, and refining as you learn. Fulcrum is the explicit response.

## Status

M1 in flight, dogfooding on its own backlog. The CLI, server, and web UI all
work; you can clone this repo and `bun run ./bin/fulcrum serve` to drive the
board against `.fulcrum/`. Iteration semantics, atomic writes, CAS-on-hash,
keyboard model, and mobile read-only mode are shipped. Remaining M1 work tracked
in `.fulcrum/stories/`.

Canonical design doc: [`~/.gstack/projects/fulcrum/jdc-main-design-20260507-154520.md`](file:///Users/jdc/.gstack/projects/fulcrum/jdc-main-design-20260507-154520.md) (three review passes, APPROVED 2026-05-07).

## Architecture

**Two surfaces, same data:**

- **Human surface** — dense web UI, keyboard-driven, opinionated. The actual product. Vintage Pivotal Tracker rebuilt beautifully and performantly.
- **Agent surface** — Bun CLI plus direct manipulation of `.fulcrum/` markdown files. The API for agents (Claude Code, Codex, etc.) to do CRUD on tickets without going through the UI.

**Storage:** a `.fulcrum/` directory committed to the project's own git repo. Markdown + YAML frontmatter for tickets. Git is the sync layer. No backend, no accounts, no cloud.

**Stack:** Bun + Vite + React 19 + @dnd-kit + zod + @tanstack/react-query + chokidar.

## Run it

```bash
bun install
bun run ./bin/fulcrum init       # first time only, creates .fulcrum/
bun run ./bin/fulcrum serve      # board at http://127.0.0.1:3737
bun test                         # run the test suite
bun run check                    # typecheck
```

CLI subcommands: `init`, `new`, `list`, `show`, `edit`, `rm`, `start`,
`finish`, `deliver`, `accept`, `reject`, `restart`, `serve`. Most subcommands
accept `--json` for agent callers.

## Roadmap

- **M1 (5–6 weeks).** A beautiful, performant Pivotal Tracker clone. Dense board, hand-managed tickets, full PT lifecycle (`unstarted → started → finished → delivered → accepted/rejected`), keyboard model, drag/drop, iteration close, velocity. Zero AI features.
- **M2 (3–4 weeks after M1).** The agentic layer, layered onto the M1 board: vision elicitation, story critique, agent delegation, artifact channel, provenance channel. All M2 features feel native to the board — no sidebar, no chat panel, no AI mode toggle.

## Constitution

> "I want it to feel like a super duper dialed-in version of the original Pivotal Tracker experience with these agentic features feeling completely natural and intuitive as part of that same philosophy of simplicity, power and opinionatedness."
