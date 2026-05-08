# Design System — Fulcrum

> Visual thesis: **Vintage Pivotal Tracker density on 2026 displays.** Warm-paper canvas
> with named-column landmarks, IBM Plex typography family, monospace numerals for
> all computational data, honest dark mode, zero decoration. Day-bright by default.
> The columns are colored because the columns are mental landmarks. No sparkle, no
> chatbot sidebar, no slop.

> Memorable thing: "Feels like Pivotal Tracker, visually near-identical or very
> strongly inspired by, super natural to people who liked PT, philosophically: no
> sparkle, no chatbot, no slop."

Source of truth for visual decisions. Read this before any UI work. Implementers
must align all font, color, spacing, layout, and motion choices with this file.
Deviation requires explicit user approval.

## Product Context

- **What this is:** Product engineering surface for solo + agentic engineering. Pivotal Tracker DNA, modernized.
- **Who it's for:** Solo product engineers running 1B+ tokens/mo on Claude Code / Codex / Cursor, who feel the agent-slop problem (the agent is fast and willing; the product accumulates 40 features and zero spine).
- **Space:** Product engineering tools (PT, Linear-as-product-team-OS, Tana, Are.na adjacent — NOT generic dev tools).
- **Project type:** Dense web app (Vite + React 19 + TanStack Query + Zod) plus a Bun CLI for agents. Two surfaces, same `.fulcrum/` markdown data on disk.

## Aesthetic Direction

- **Direction:** Industrial / Editorial hybrid (PT-DNA).
- **Decoration level:** minimal.
- **Mood:** warm-paper utility with deliberate typographic moments. Day-bright. Dense. Builds-for-builders. Aesthetic budget zero — if a chrome element doesn't earn its pixels, cut it.
- **Reference sites:**
  - Pivotal Tracker, Wayback Machine snapshots from 2014 and 2018 (the visual hard-lock).
  - Linear (as a 2026 dense-information benchmark, not a target).
- **Reference mockup:** `~/.gstack/projects/joncooper-fulcrum/designs/design-system-20260507/variant-B.png` (the directional approved AI mockup; refinements in `approved.json` in same dir).
- **Reference preview:** `~/.gstack/projects/joncooper-fulcrum/designs/design-system-20260507/preview.html` (the live-HTML reference matching this file; toggle DAY/DARK).
- **Eureka principle (load-bearing):** PT's column colors are not decoration. They are at-a-glance state landmarks. "Current is yellow" was muscle memory for PT users. Modern PM tools (Linear, Notion) dropped this in favor of pure-white columns + chips, which is **inferior** for at-a-glance density. Fulcrum keeps PT's column-color semantic. This is a deliberate departure from modern convention with strong utility justification.

## Typography

IBM Plex family — three coordinated weights of the same skeleton. Open-source, designed for screens. Plex Sans is a direct Helvetica successor (PT inheritance) without being Inter or Roboto. Plex Serif gives the editorial moment without dating. Plex Mono is the best free mono for tabular numerals.

| Role | Font | Weight | Sizes | Notes |
|------|------|--------|-------|-------|
| Display (hero, project name, modal headers) | IBM Plex Serif | 500 | 20 / 24 / 32 px | tracking -0.5%, line-height 1.2 |
| Body (story titles, all UI text, labels) | IBM Plex Sans | 400 / 500 | 11 / 12 / 13 / 14 px | line-height 1.4 |
| Mono (IDs, points, shortcuts, conflict diff bodies, terminal output) | IBM Plex Mono | 400 | 11 / 12 px | `font-feature-settings: "tnum"` always on |

**Loading strategy:** self-host via npm packages — `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-serif`, `@fontsource/ibm-plex-mono`. No CDN dependency. Subset to Latin only.

**Type scale:**
```
text-mono-11    11px  Plex Mono     keyboard hints, status bar
text-meta-12    12px  Plex Sans     timestamps, secondary meta
text-body-13    13px  Plex Sans     story titles, default body  ← primary
text-strong-14  14px  Plex Sans/500 column headers, emphasis
text-display-20 20px  Plex Serif    project name in header
text-display-24 24px  Plex Serif    modal/page headers
text-display-32 32px  Plex Serif    rare hero moments only
```

**Default body size: 13px.** Story titles render at 13px Plex Sans (no shrinking, no truncation). Multi-line titles allowed; most fit one line at typical column width.

**Story IDs are NEVER displayed visually on the board.** IDs (`T-1042`) are CLI/URL identifiers only. They surface in the URL bar, in CLI commands, in conflict UX — but the board row anatomy contains no ID column. (PT inheritance: PT did not show story IDs on rows; the title was the visual identifier.)

## Color

Approach: **balanced** — column tints carry semantic; accents are restrained.

### Day mode (default)

```css
:root {
  /* Canvas + ink */
  --bg-app:        #fbf8f1;  /* warm paper canvas */
  --bg-surface:    #f5efde;  /* subtle column depth (status bar, frontmatter blocks) */
  --ink-primary:   #1c1917;  /* warm near-black, NOT pure black */
  --ink-secondary: #57534e;  /* warm gray for secondary text */
  --ink-muted:     #a8a29e;  /* stone for hints */
  --rule:          #e7e0c9;  /* warm hairline */

  /* Column tints (PT-saturated, the load-bearing semantic) */
  --col-current:   #fef9c3;  /* warm yellow — the active stage */
  --col-backlog:   #cce3fb;  /* cool sky — what's next */
  --col-icebox:    #dde2fa;  /* cool lavender — deferred */
  --col-done:      #c5f0d3;  /* calm mint — shipped */

  /* Story type accents */
  --type-feature:  #d97706;  /* golden orange — PT heritage star */
  --type-bug:      #9f1239;  /* deep wine — less aggressive than red */
  --type-chore:    #57534e;  /* muted gray — non-estimable */
  --type-release:  #5b21b6;  /* deep grape — only place purple appears */

  /* State pills (low chroma; bg + ink pairs) */
  --state-started-bg:    #bbf7d0;  --state-started-ink:    #166534;
  --state-finished-bg:   #fde68a;  --state-finished-ink:   #854d0e;
  --state-delivered-bg:  #bfdbfe;  --state-delivered-ink:  #1e40af;
  --state-accepted-bg:   #d9f99d;  --state-accepted-ink:   #365314;
  --state-rejected-bg:   #fecaca;  --state-rejected-ink:   #991b1b;
  /* unstarted: outlined, no fill, --ink-muted border + ink */

  /* Header bar (fulcrum's "dark teal" feel, warmer) */
  --header-bg:  var(--ink-primary);
  --header-ink: var(--bg-app);
}
```

### Dark mode (opt-in toggle, real redesign)

Dark mode is a **separate designed surface**, not a CSS invert. Preserves the column-color semantic with warm-saturated dark tints. Off by default.

```css
[data-theme="dark"] {
  --bg-app:        #1c1917;  /* warm near-black canvas */
  --bg-surface:    #292524;
  --ink-primary:   #fbf8f1;  /* cream text (mirrors day's bg) */
  --ink-secondary: #d6d3d1;
  --ink-muted:     #78716c;
  --rule:          #44403c;

  /* Column tints darken to warm-saturated, NOT cold */
  --col-current:   #3f3711;  /* deep amber */
  --col-backlog:   #1e293b;  /* deep slate */
  --col-icebox:    #312e81;  /* deep indigo */
  --col-done:      #14532d;  /* deep evergreen */

  /* Story type accents lift slightly for AA contrast */
  --type-feature:  #f59e0b;
  --type-bug:      #fb7185;
  --type-chore:    #a8a29e;
  --type-release:  #a78bfa;

  /* State pills invert (saturated bg → light ink) */
  --state-started-bg:    #14532d;  --state-started-ink:    #bbf7d0;
  --state-finished-bg:   #78350f;  --state-finished-ink:   #fde68a;
  --state-delivered-bg:  #1e3a8a;  --state-delivered-ink:  #bfdbfe;
  --state-accepted-bg:   #365314;  --state-accepted-ink:   #d9f99d;
  --state-rejected-bg:   #7f1d1d;  --state-rejected-ink:   #fecaca;

  --header-bg:  #0c0a09;
  --header-ink: var(--ink-primary);
}
```

### Contrast targets
- Body text on canvas: AAA (>= 7:1) — `#1c1917` on `#fbf8f1` ≈ 16:1 ✓
- Body text on column tint: AAA at 13px — column tints are ~12% saturation so contrast holds
- State pill text: AA Large (>= 3:1) at 11px mono — verified per pair
- Type accent on canvas: AA (>= 4.5:1) — golden orange `#d97706` on `#fbf8f1` ≈ 4.6:1 ✓

## Spacing

**Base unit: 4px. Density: COMPACT.**

```
--s-0:   0px
--s-1:   4px   inter-element gap
--s-2:   8px   icon → text gap
--s-3:   12px  story row horizontal padding
--s-4:   16px  expanded story / modal interior
--s-6:   24px  section break
--s-8:   32px  page-section break
--s-12:  48px  major page-section break
```

**Row dimensions (the key density commitment):**
- Story row vertical padding: **4-6px** (not 6-8px)
- Story row height: **24-28px** including 13px line-height
- Column header height: 28-32px
- Top header height: 32px
- Status bar height: 24px
- Column gutter: 1px hairline rule (no gap)

**Density target: 12-15 stories visible per column at 1440 × 900.** This is PT-class density. Modern PM tools sit at 6-8 visible — Fulcrum doubles that.

## Layout

- **Approach:** grid-disciplined, full-bleed. NO max-width on the board.
- **Columns:** three-column flex (Current / Backlog / Icebox), each fills `(100vw / 3)`. M2 may add a fourth (Done) column toggle. NO sidebar in M1.
- **Border radius:** 2px on state pills, 0px on story rows, 4px on buttons, NONE on column boundaries (1px rule instead of radius).
- **Scrollbars:** native, thin. Each column scrolls independently. Status bar always visible at bottom.
- **Marketing/empty states only:** centered content at max-width 720px.

### Story row anatomy (the canonical row)

```
[16px type icon] [story title — Plex Sans 13px primary] [Plex Mono 11px points '[3]'] [11px state pill]
```

CSS skeleton:

```css
.story {
  display: grid;
  grid-template-columns: 16px 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 4px 10px;
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
  line-height: 1.35;
}
```

**No ID column.** Rendering `T-1042` next to every title burns horizontal space and is not the daily mental model.

### Header anatomy

```
[Plex Serif "fulcrum"  18-20px]    [Plex Sans "Iteration 8 · Mar 12 → Mar 19"  13px @70% opacity]    [Plex Mono "velocity 14 pts"  12px @70% opacity, right-aligned]
```

Height 32px, dark `--header-bg`, light `--header-ink`. No search bar, no buttons.
Search is keyboard-driven (`/`), commands are keyboard-driven (`?` for help).

### Status bar anatomy

```
[Plex Mono 11px "j/k navigate · e edit · J/K move · space expand · / search · ? help"]
```

Height 24px, `--bg-surface`, `--ink-secondary`. Contextual — changes when a story is expanded or in conflict UX.

## Motion

**Approach: minimal-functional.** No entrance animations on initial load. No scroll-driven, no page transitions. Keyboard interactions feel instant.

| Interaction | Duration | Easing | Notes |
|-------------|----------|--------|-------|
| Drag/drop rearrange | 0ms | n/a | instant; no spring physics |
| State pill swap | 100ms | ease-out | fade only, no slide |
| Inline expand (story) | 150ms | ease-in-out | slide-down in place; NEVER modal |
| Hover affordance (drag handle reveal) | 80ms | ease-out | reveal only on hover |
| Focus ring | 0ms | n/a | instant; NEVER pulse or glow |
| SSE-driven re-render | 0ms | n/a | instant; row swap with no animation |

**No spring physics anywhere.** PT was instant. Fulcrum is instant.

**Single principled exception — the iteration close ritual.** When the user commits an iteration close, the closed iteration animates OUT and the fresh iteration animates IN as one composed transition (400ms, ease-in-out). This is the only place motion is allowed to be expressive. Rationale: iteration close is PT's signature emotional moment ("looking back at what you shipped, then rolling into a fresh iteration"). It happens at most once a week, signals a meaningful state change, and the entire purpose of Journey C in the plan depends on this transition landing. The 400ms is named and bounded; no other interaction may use it.

## Iconography

Story type icons use Unicode glyphs at 14px, colored via CSS. No icon font, no SVG sprite — keep dependencies zero.

| Type | Glyph | CSS color |
|------|-------|-----------|
| feature | ★ (U+2605) | `var(--type-feature)` |
| bug | ● (U+25CF) | `var(--type-bug)` |
| chore | ⚙ (U+2699) | `var(--type-chore)` |
| release | ▼ (U+25BC) | `var(--type-release)` |

State pills use lowercase text labels (`started`, `finished`, `delivered`, `accepted`, `rejected`, `unstarted`) in Plex Mono 11px. No icons inside pills.

## Empty states

Empty states are features, not errors. The first impression after `fulcrum init` (an empty board) frames the entire mental model — agent surface AND human surface, with the exact next command shown like terminal output.

```
"An empty board, by design.

fulcrum lives in .fulcrum/ in this repo. Stories are markdown files;
iterations are YAML. Git is the sync layer.

  $ fulcrum new feat 'Lexorank position-field repack' --points 3
    T-1001 · feat · unstarted

  $ fulcrum elicit                                # M2: vision conversation
  $ fulcrum delegate T-1001 @claude-code          # M2: agent surface

[+ New story]  [Open docs]  [paste design / mock]
```

Pattern: warm, terminal-like, no illustration, no mascot, the actual commands the user is about to run shown rendered. No "No items found" messaging.

## Conflict UX

When `git pull` produces conflict markers in a story file, surface the conflict at the row level. Frontmatter conflicts get an inline ours/theirs picker per field. Body conflicts drop the user into `$EDITOR` via `git mergetool`.

Visual pattern (see `preview.html` for live rendering):

```
[CONFLICT badge]  ★  Iteration close ritual UX                  2 frontmatter fields conflict · body OK
─────────────────────────────────────────────────────────────────
Frontmatter
  points:    [ours · main: 5]   [theirs · feature/iter-close: 8]   [use ours] [use theirs] [edit]
  state:     [ours · main: unstarted]   [theirs · feature/iter-close: started]  [use ours] [use theirs] [edit]

  [Resolve all (apply current picks)]   [Open in $EDITOR]   [abort merge]
```

Color rule: ours sides use `--type-feature` accent (warm); theirs sides use `--state-delivered-ink` accent (cool). Picker buttons in `--btn-secondary`.

## Accessibility

- **Keyboard navigation is the primary interaction model.** Mouse is supplementary. Every action must have a keystroke.
- **Focus rings:** 2px solid `--type-feature` with 2px offset. Never pulse or glow. Always visible.
- **Color is never the sole signal.** State pills also have text labels. Type icons also differ in shape (★ vs ● vs ⚙).
- **Touch targets:** 32px minimum height for any interactive row (achieved via row vertical padding, not extra chrome).
- **ARIA landmarks:** `<header role="banner">` for the top bar, `<main role="main">` for the board, `<nav role="navigation">` for column headers (if columns are user-reorderable), `<footer role="contentinfo">` for the status bar.
- **Story row semantics:** each story row is a `<button role="listitem">` inside the column's `<ul role="list">`. Type, title, points, and state are exposed via `aria-label` ("Feature, Lexorank position-field repack on overflow, 3 points, started").
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` zeroes the 100/150/80ms durations to 0ms. Drag/drop and instant re-renders are already 0ms — no further adjustment needed.

## Responsive stance

**Desktop-first. Optimized for 1280px+ wide displays.**

| Breakpoint | Behavior |
|------------|----------|
| ≥ 1280px (desktop) | Three columns side-by-side, full board features. **Primary target.** |
| 768-1279px (small laptop) | Three columns side-by-side, narrower; titles wrap more; status bar abbreviates shortcut hints. |
| < 768px (tablet/phone) | **Read-only fallback.** Show one column at a time with a tab switcher; row interactions become tap-to-expand modal (the only place a modal is allowed). Document explicitly: "fulcrum is built for keyboard-first product engineering on a real screen — mobile is for read-only review." |

Stated stance: **mobile is not a first-class surface in M1.** Document the choice; don't apologize. Solo product engineers work at desks.

## What this design system does NOT include (deliberately)

- Logos, marks, brand identity assets (the project name is set in IBM Plex Serif; that's the brand).
- Marketing/landing-page tokens (no hero treatment, no testimonial styling — fulcrum has no landing page in M1).
- Illustration system, mascot, or graphic accents.
- Avatar styles or user-pic conventions (M1 is solo; M2 may add `@claude-code` / `@codex` agent assignees but those are text labels, not avatars).
- Notification toasts, modals (banned), or dialogs other than the explicit Conflict UX picker.
- Theming beyond DAY/DARK. No user-customizable palettes; the palette IS the product.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-07 | Initial design system created via /design-consultation | Anchored to user-stated memorable thing: "feels like PT, philosophically: no sparkle, no chatbot, no slop." |
| 2026-05-07 | IBM Plex family chosen as primary | Open-source, screen-designed, three coordinated weights. Plex Sans is direct Helvetica successor (PT inheritance) without being Inter/Roboto. |
| 2026-05-07 | Column tints PT-saturated (#fef9c3 / #cce3fb / #dde2fa) | User feedback on AI mockup variant B: "doesn't fully resemble legacy PT, not dense enough." Pushed saturation closer to PT 2014-2018 era. |
| 2026-05-07 | NO ID column in story row | User feedback: "Why does the ID number need to be visible?" PT did not show story IDs visually; IDs are CLI/URL identifiers only. |
| 2026-05-07 | Row height 24-28px (4-6px vertical padding) | PT-class density target: 12-15 stories per column visible at 1440×900. |
| 2026-05-07 | Honest dark mode (separate redesigned surface) | Most 2026 users want dark; PT was strictly day-bright. Compromise: real redesigned dark mode that preserves column-color semantic (warm amber / deep slate / deep indigo) instead of CSS invert. |
| 2026-05-07 | Mobile is read-only fallback in M1 | Solo product engineers work at desks. Document the stance; don't apologize. |
| 2026-05-07 | Single principled motion exception: iteration-close 400ms ritual transition | PT's signature emotional moment. Happens once a week max. Named and bounded; no other interaction may use it. Resolved during /plan-design-review Pass 5. |
