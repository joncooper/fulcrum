# Fulcrum

Bun + Vite + React 19 + TanStack Query + Zod app with a Bun server.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore

## GBrain Configuration (configured by /setup-gbrain)
- Mode: local-stdio
- Engine: pglite
- Config file: ~/.gbrain/config.json (mode 0600)
- Setup date: 2026-05-07
- MCP registered: yes (user scope)
- Artifacts sync: full
- Current repo policy: n/a (no origin remote yet)

## GBrain Search Guidance (configured by /sync-gbrain)
<!-- gstack-gbrain-search-guidance:start -->

GBrain is set up and synced on this machine. The agent should prefer gbrain
over Grep when the question is semantic or when you don't know the exact
identifier yet. Two indexed corpora available via the `gbrain` CLI:
- This repo's code (registered as `gstack-code-<repo>` source).
- `~/.gstack/` curated memory (registered as `gstack-brain-<user>` source via
  the existing federation pipeline).

Prefer gbrain when:
- "Where is X handled?" / semantic intent, no exact string yet:
    `gbrain search "<terms>"` or `gbrain query "<question>"`
- "Where is symbol Y defined?" / symbol-based code questions:
    `gbrain code-def <symbol>` or `gbrain code-refs <symbol>`
- "What calls Y?" / "What does Y depend on?":
    `gbrain code-callers <symbol>` / `gbrain code-callees <symbol>`
- "What did we decide last time?" / past plans, retros, learnings:
    `gbrain search "<terms>" --source gstack-brain-<user>`

Grep is still right for known exact strings, regex, multiline patterns, and
file globs. The brain auto-syncs incrementally on every gstack skill start.
Run `/sync-gbrain` to force-refresh, `/sync-gbrain --full` for full reindex.

<!-- gstack-gbrain-search-guidance:end -->

## Design System
Always read `DESIGN.md` before making any visual or UI decisions.
All font choices, colors, spacing, layout, and aesthetic direction are defined there.
Do not deviate without explicit user approval.

Visual thesis: vintage Pivotal Tracker density on 2026 displays. IBM Plex family
typography. Warm-paper canvas with PT-saturated column tints (Current=yellow,
Backlog=sky, Icebox=lavender) as load-bearing semantic landmarks. NO story IDs
shown visually on the board — they are CLI/URL identifiers only. Row height
24-28px (PT-class density). Mobile is a read-only fallback; M1 is desktop-first.

When implementing UI:
- Self-host IBM Plex via `@fontsource/ibm-plex-{sans,serif,mono}` (no CDN).
- Use the CSS variables defined in `DESIGN.md` (do not hardcode hex values).
- Story row anatomy: `[type icon] [title] [points] [state pill]` — no ID column.
- State pills use lowercase mono labels; type icons use Unicode glyphs (★ ● ⚙ ▼).
- Motion is minimal-functional (0/80/100/150ms); no spring physics, no entrance animations.

In QA mode, flag any code that doesn't match `DESIGN.md`.
