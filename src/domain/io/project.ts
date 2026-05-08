import { existsSync, readFileSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { err, ok, type FulcrumError, type Result } from "../result.ts";
import { ProjectSchema, type Project } from "../schemas/project.ts";
import { fulcrumYamlStringify } from "../yaml.ts";

export type ProjectRoot = {
  /** Absolute path to the directory containing `.fulcrum/`. */
  root: string;
  fulcrumDir: string;
  storiesDir: string;
  projectFile: string;
};

/**
 * Walk up from `start` looking for `.fulcrum/project.yml`. Like git's repo
 * discovery — works from anywhere inside the project tree.
 */
export function findProjectRoot(start = process.cwd()): ProjectRoot | null {
  let cur = resolve(start);
  while (true) {
    const fulcrumDir = join(cur, ".fulcrum");
    if (existsSync(join(fulcrumDir, "project.yml"))) {
      return {
        root: cur,
        fulcrumDir,
        storiesDir: join(fulcrumDir, "stories"),
        projectFile: join(fulcrumDir, "project.yml"),
      };
    }
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

export function loadProject(p: ProjectRoot): Result<Project, FulcrumError> {
  let yaml: string;
  try {
    yaml = readFileSync(p.projectFile, "utf-8");
  } catch (cause) {
    return err({ kind: "IO_ERROR", message: `cannot read ${p.projectFile}`, cause });
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(yaml);
  } catch (cause) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: `project.yml is not valid YAML`,
      cause,
    });
  }
  const validated = ProjectSchema.safeParse(parsed);
  if (!validated.success) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: `project.yml schema invalid: ${validated.error.message}`,
      cause: validated.error,
    });
  }
  return ok(validated.data);
}

/**
 * Atomic write of project.yml: temp file + rename. No CAS — project.yml is a
 * singleton and concurrent writes are rare; M1 accepts the race. Schema-validates
 * before writing so we never persist garbage.
 */
export async function writeProjectAtomic(
  p: ProjectRoot,
  project: Project,
): Promise<Result<void, FulcrumError>> {
  const validated = ProjectSchema.safeParse(project);
  if (!validated.success) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: `project.yml schema invalid: ${validated.error.message}`,
      cause: validated.error,
    });
  }
  const content = fulcrumYamlStringify(validated.data);
  const tmpPath = `${p.projectFile}.tmp.${randomBytes(4).toString("hex")}`;
  try {
    await writeFile(tmpPath, content, { encoding: "utf-8" });
    await rename(tmpPath, p.projectFile);
    return ok(undefined);
  } catch (cause) {
    try {
      await unlink(tmpPath);
    } catch {
      /* best effort */
    }
    return err({
      kind: "IO_ERROR",
      message: `failed to write ${p.projectFile}`,
      cause,
    });
  }
}
