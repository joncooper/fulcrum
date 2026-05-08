import { z } from "zod";

export const ProjectSettingsSchema = z
  .object({
    estimate_scale: z.array(z.number().int().nonnegative()).default([0, 1, 2, 3, 5, 8]),
  })
  .default({});

export const ProjectSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1),
  velocity: z.number().int().nonnegative().default(0),
  current_iteration: z.number().int().positive().default(1),
  /** First day of the current iteration (ISO YYYY-MM-DD). Reset on each close. */
  iteration_start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "iteration_start_date must be YYYY-MM-DD")
    .default(() => new Date().toISOString().slice(0, 10)),
  /** Length of each iteration window. Defaults to 7 days. */
  iteration_length_days: z.number().int().positive().default(7),
  settings: ProjectSettingsSchema,
});

export type Project = z.infer<typeof ProjectSchema>;
