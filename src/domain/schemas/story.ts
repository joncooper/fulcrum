import { z } from "zod";

/**
 * Story ID format: `T-{sequence}-{4-hex-random}`. Example: `T-1043-7b21`.
 *
 * - `{sequence}` is sequential within a (branch, author, machine) tuple but
 *   not unique across filesystems.
 * - `{4-hex-random}` is generated fresh at story creation; provides global
 *   filename uniqueness even across worktrees / cloud agents.
 */
export const StoryIdSchema = z
  .string()
  .regex(/^T-\d+-[0-9a-f]{4}$/, "story id must match T-{seq}-{4hex}");

export const StoryTypeSchema = z.enum(["feature", "bug", "chore", "release"]);
export type StoryType = z.infer<typeof StoryTypeSchema>;

export const StoryStateSchema = z.enum([
  "unstarted",
  "started",
  "finished",
  "delivered",
  "accepted",
  "rejected",
]);
export type StoryState = z.infer<typeof StoryStateSchema>;

/** Points must be in the Fibonacci-ish scale {0, 1, 2, 3, 5, 8} per plan. */
export const FibPointsSchema = z
  .number()
  .int()
  .nonnegative()
  .refine((n) => [0, 1, 2, 3, 5, 8].includes(n), {
    message: "points must be one of {0, 1, 2, 3, 5, 8}",
  });

const TERMINAL_STATES = new Set<StoryState>(["accepted", "rejected"]);

export const StoryFrontmatterSchema = z
  .object({
    id: StoryIdSchema,
    type: StoryTypeSchema,
    state: StoryStateSchema,
    /** Required for features; ignored for bug/chore/release (they're non-estimable per plan). */
    points: FibPointsSchema.optional(),
    /** Lexorank position field; non-empty string. */
    position: z.string().min(1),
    /** Optional epic slug. */
    epic: z.string().min(1).optional(),
    /** Free-form tag list. */
    labels: z.array(z.string().min(1)).default([]),
    /** Hide from current/backlog projection. Forbidden when state is terminal. */
    icebox: z.boolean().default(false),
    /** Only set when state=accepted, at iteration close. Immutable thereafter. */
    iteration: z.number().int().positive().optional(),
    /** ISO date string (YYYY-MM-DD or full ISO timestamp). */
    created: z.string().min(1),
    /** Required when state=rejected, otherwise omitted. */
    reject_reason: z.string().min(1).optional(),

    // M2-reserved optional fields (per eng review). M1 ignores them; reserving
    // here means M2 stories don't need a schema migration.
    assignee: z.string().min(1).optional(),
    transcripts: z.string().min(1).optional(),
    artifact: z.string().min(1).optional(),
    provenance: z.string().min(1).optional(),
  })
  .refine(
    (s) => s.type !== "feature" || (s.points !== undefined),
    {
      message: "feature stories require `points`",
      path: ["points"],
    },
  )
  .refine(
    (s) => !s.icebox || !TERMINAL_STATES.has(s.state),
    {
      message: "icebox cannot be true for accepted or rejected stories",
      path: ["icebox"],
    },
  )
  .refine(
    (s) => s.state !== "rejected" || s.reject_reason !== undefined,
    {
      message: "rejected stories require `reject_reason`",
      path: ["reject_reason"],
    },
  );

export type StoryFrontmatter = z.infer<typeof StoryFrontmatterSchema>;

/**
 * A complete story: frontmatter (metadata) + body (markdown description).
 * Stored on disk as a single `.md` file with YAML frontmatter.
 */
export type Story = {
  frontmatter: StoryFrontmatter;
  body: string;
};

/** Parse the short form (e.g. "1043") out of a full ID ("T-1043-7b21"). */
export function shortId(fullId: string): string {
  const match = /^T-(\d+)-[0-9a-f]{4}$/.exec(fullId);
  if (!match) throw new Error(`not a valid story id: ${fullId}`);
  return match[1]!;
}

/** Match a partial / short id against a full id. */
export function idMatches(query: string, fullId: string): boolean {
  if (query === fullId) return true;
  // Just the sequence portion: "1043" matches "T-1043-{anything}"
  if (/^\d+$/.test(query)) return shortId(fullId) === query;
  // T-1043 (no suffix): matches "T-1043-{anything}"
  if (/^T-\d+$/.test(query)) return fullId.startsWith(query + "-");
  return false;
}
