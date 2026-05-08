import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { err, ok, type FulcrumError, type Result } from "../result.ts";
import { ProjectSchema, type Project } from "../schemas/project.ts";
import { fulcrumYamlStringify } from "../yaml.ts";

export type InitOptions = {
  cwd: string;
  name: string;
};

export type InitResult = {
  created: string[];
  projectFile: string;
};

/**
 * Initialize a new fulcrum project at `opts.cwd`.
 *
 * Layout produced:
 *   .fulcrum/
 *   ├── project.yml   (version, name, velocity, current_iteration, settings)
 *   └── stories/      (empty)
 *
 * Errors:
 * - IO_ERROR if `cwd` does not exist
 * - ALREADY_INITIALIZED if `.fulcrum/project.yml` already exists
 */
export async function initProject(
  opts: InitOptions,
): Promise<Result<InitResult, FulcrumError>> {
  if (!existsSync(opts.cwd)) {
    return err({ kind: "IO_ERROR", message: `cwd does not exist: ${opts.cwd}` });
  }

  const fulcrumDir = join(opts.cwd, ".fulcrum");
  const projectFile = join(fulcrumDir, "project.yml");
  const storiesDir = join(fulcrumDir, "stories");

  if (existsSync(projectFile)) {
    return err({
      kind: "ALREADY_INITIALIZED",
      message: `fulcrum is already initialized: ${projectFile} exists`,
    });
  }

  let project: Project;
  try {
    project = ProjectSchema.parse({
      version: 1,
      name: opts.name,
      velocity: 0,
      current_iteration: 1,
      settings: {},
    });
  } catch (cause) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: `project.yml schema validation failed for new project`,
      cause,
    });
  }

  try {
    await mkdir(storiesDir, { recursive: true });
    await writeFile(projectFile, fulcrumYamlStringify(project), "utf-8");
  } catch (cause) {
    return err({
      kind: "IO_ERROR",
      message: `failed to write fulcrum project files`,
      cause,
    });
  }

  return ok({
    created: [fulcrumDir, projectFile, storiesDir],
    projectFile,
  });
}
