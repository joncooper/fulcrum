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
  settings: ProjectSettingsSchema,
});

export type Project = z.infer<typeof ProjectSchema>;
