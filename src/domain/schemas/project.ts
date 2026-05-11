import { z } from "zod";

export const ProjectSettingsSchema = z
  .object({
    estimate_scale: z.array(z.number().int().nonnegative()).default([0, 1, 2, 3, 5, 8]),
  })
  .default({});

/**
 * One closed iteration's record. The close ritual stamps `iteration: N` on
 * each accepted story in the closing window, then pushes this record into
 * `iteration_history`. `velocity` is the sum of points of stories stamped
 * with this number.
 */
export const IterationRecordSchema = z.object({
  number: z.number().int().positive(),
  /** First day of the window, inclusive (YYYY-MM-DD). */
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD"),
  /** First day AFTER the window, exclusive (YYYY-MM-DD) — i.e. the next iteration's start_date. */
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD"),
  /** Sum of points of stories stamped with this iteration number. */
  velocity: z.number().int().nonnegative(),
});

export type IterationRecord = z.infer<typeof IterationRecordSchema>;

export const ProjectSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  /** Rolling-3 average of points-per-iteration from `iteration_history`. */
  velocity: z.number().int().nonnegative().default(0),
  current_iteration: z.number().int().positive().default(1),
  /** First day of the current (open) iteration window. Rolls forward on close. */
  iteration_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "iteration_start_date must be YYYY-MM-DD")
    .default(() => new Date().toISOString().slice(0, 10)),
  /** Length of each iteration window. Defaults to 7 days. */
  iteration_length_days: z.number().int().positive().default(7),
  /** Closed iteration records, oldest → newest. */
  iteration_history: z.array(IterationRecordSchema).default([]),
  settings: ProjectSettingsSchema,
});

export type Project = z.infer<typeof ProjectSchema>;
