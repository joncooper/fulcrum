import { err, ok, type FulcrumError, type Result } from "./result.ts";
import type { StoryFrontmatter, StoryState } from "./schemas/story.ts";

/**
 * State machine commands. Maps to CLI verbs and keyboard shortcuts.
 *
 * Per plan + design review (D10): forward commands (start/finish/deliver) auto-
 * chain. `finish` on an unstarted story = start + finish in one operation.
 * `deliver` on an unstarted story = start + finish + deliver. Auto-chain stops
 * at `delivered` — `accept` requires explicit delivered → accepted.
 */
export type Command =
  | { kind: "start" }
  | { kind: "finish" }
  | { kind: "deliver" }
  | { kind: "accept" }
  | { kind: "reject"; reason: string }
  | { kind: "restart" };

const AUTO_CHAIN_INDEX: Partial<Record<StoryState, number>> = {
  unstarted: 0,
  started: 1,
  finished: 2,
  delivered: 3,
};

const AUTO_CHAIN_TARGET = {
  start: "started",
  finish: "finished",
  deliver: "delivered",
} as const satisfies Record<string, StoryState>;

const REJECTABLE: ReadonlySet<StoryState> = new Set(["started", "finished", "delivered"]);

/**
 * Explicit transition table. Each cell is either the resulting state or
 * `"INVALID_TRANSITION"`. The implementation in `transition()` is the source
 * of truth; this table is a static doc-comment-shaped representation that
 * exercises the same logic for tests and review.
 *
 *                   start       finish      deliver     accept       reject       restart
 *   unstarted   →   started     finished    delivered   INVALID      INVALID      INVALID
 *   started     →   INVALID     finished    delivered   INVALID      rejected     INVALID
 *   finished    →   INVALID     INVALID     delivered   INVALID      rejected     INVALID
 *   delivered   →   INVALID     INVALID     INVALID     accepted     rejected     INVALID
 *   accepted    →   INVALID     INVALID     INVALID     INVALID      INVALID      INVALID
 *   rejected    →   INVALID     INVALID     INVALID     INVALID      INVALID      started
 *
 * Valid transitions: 11 of 36 cells. Forward-only auto-chain (`finish` on
 * `unstarted` jumps to `finished`; `deliver` on `unstarted` jumps to
 * `delivered`); backward transitions are rejected; only `rejected` can
 * `restart` back to `started`.
 */
export const TRANSITION_TABLE: Readonly<
  Record<StoryState, Readonly<Record<Command["kind"], StoryState | "INVALID_TRANSITION">>>
> = {
  unstarted: {
    start: "started",
    finish: "finished",
    deliver: "delivered",
    accept: "INVALID_TRANSITION",
    reject: "INVALID_TRANSITION",
    restart: "INVALID_TRANSITION",
  },
  started: {
    start: "INVALID_TRANSITION",
    finish: "finished",
    deliver: "delivered",
    accept: "INVALID_TRANSITION",
    reject: "rejected",
    restart: "INVALID_TRANSITION",
  },
  finished: {
    start: "INVALID_TRANSITION",
    finish: "INVALID_TRANSITION",
    deliver: "delivered",
    accept: "INVALID_TRANSITION",
    reject: "rejected",
    restart: "INVALID_TRANSITION",
  },
  delivered: {
    start: "INVALID_TRANSITION",
    finish: "INVALID_TRANSITION",
    deliver: "INVALID_TRANSITION",
    accept: "accepted",
    reject: "rejected",
    restart: "INVALID_TRANSITION",
  },
  accepted: {
    start: "INVALID_TRANSITION",
    finish: "INVALID_TRANSITION",
    deliver: "INVALID_TRANSITION",
    accept: "INVALID_TRANSITION",
    reject: "INVALID_TRANSITION",
    restart: "INVALID_TRANSITION",
  },
  rejected: {
    start: "INVALID_TRANSITION",
    finish: "INVALID_TRANSITION",
    deliver: "INVALID_TRANSITION",
    accept: "INVALID_TRANSITION",
    reject: "INVALID_TRANSITION",
    restart: "started",
  },
};

/**
 * Apply a command to a story. Returns a new frontmatter with the resulting
 * state, or an INVALID_TRANSITION error.
 *
 * Pure function. Does not touch disk.
 */
export function transition(
  story: StoryFrontmatter,
  command: Command,
): Result<StoryFrontmatter, FulcrumError> {
  switch (command.kind) {
    case "start":
    case "finish":
    case "deliver": {
      const target = AUTO_CHAIN_TARGET[command.kind];
      const targetIdx = AUTO_CHAIN_INDEX[target]!;
      const currentIdx = AUTO_CHAIN_INDEX[story.state];

      if (currentIdx === undefined) {
        return err({
          kind: "INVALID_TRANSITION",
          message: `cannot ${command.kind} a ${story.state} story (use restart first)`,
        });
      }
      if (targetIdx < currentIdx) {
        return err({
          kind: "INVALID_TRANSITION",
          message: `cannot move backward: ${story.state} -> ${target}`,
        });
      }
      if (targetIdx === currentIdx) {
        return err({
          kind: "INVALID_TRANSITION",
          message: `already in state ${story.state}`,
        });
      }
      return ok({ ...story, state: target });
    }

    case "accept": {
      if (story.state !== "delivered") {
        return err({
          kind: "INVALID_TRANSITION",
          message: `accept only valid from delivered, got ${story.state}`,
        });
      }
      // Stamp accepted_at on the transition itself. The story's iteration is
      // derived later by checking which iteration window contains this
      // timestamp; there is no `iteration: N` field on stories.
      return ok({
        ...story,
        state: "accepted",
        accepted_at: new Date().toISOString(),
      });
    }

    case "reject": {
      if (!REJECTABLE.has(story.state)) {
        return err({
          kind: "INVALID_TRANSITION",
          message: `reject only valid from started/finished/delivered, got ${story.state}`,
        });
      }
      return ok({ ...story, state: "rejected", reject_reason: command.reason });
    }

    case "restart": {
      if (story.state !== "rejected") {
        return err({
          kind: "INVALID_TRANSITION",
          message: `restart only valid from rejected, got ${story.state}`,
        });
      }
      const next: StoryFrontmatter = { ...story, state: "started" };
      delete next.reject_reason;
      return ok(next);
    }
  }
}
