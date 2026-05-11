import { existsSync, readFileSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
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

export type LoadedProject = {
  project: Project;
  /** SHA-256 of the raw project.yml content; pass back for CAS-on-hash on writes. */
  hash: string;
};

export function loadProject(p: ProjectRoot): Result<Project, FulcrumError> {
  const loaded = loadProjectWithHash(p);
  if (!loaded.ok) return loaded;
  return ok(loaded.value.project);
}

/**
 * Same as loadProject but also returns the content hash. Use this variant when
 * you intend to write back via writeProjectAtomic with CAS-on-hash.
 */
export function loadProjectWithHash(p: ProjectRoot): Result<LoadedProject, FulcrumError> {
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
  const hash = createHash("sha256").update(yaml).digest("hex");
  return ok({ project: validated.data, hash });
}

/**
 * Atomic write of project.yml: temp file + rename. Optional CAS-on-hash —
 * pass `expectedHash` from a prior load and the write returns STALE_WRITE if
 * the on-disk content changed underneath. Schema-validates before writing so
 * we never persist garbage.
 *
 * Temp file form: `.fulcrum/.project-tmp-{uuid}` (hidden dotfile in the
 * fulcrum dir; watcher ignores `-tmp-{hex}$` paths).
 */
export async function writeProjectAtomic(
  p: ProjectRoot,
  project: Project,
  opts: { expectedHash?: string } = {},
): Promise<Result<void, FulcrumError>> {
  const validated = ProjectSchema.safeParse(project);
  if (!validated.success) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: `project.yml schema invalid: ${validated.error.message}`,
      cause: validated.error,
    });
  }

  // CAS check: re-read the current file and hash it; if the caller's expected
  // hash doesn't match, refuse to overwrite. Surfaces the "another process
  // changed project.yml under us" case as STALE_WRITE.
  if (opts.expectedHash !== undefined && existsSync(p.projectFile)) {
    let current: string;
    try {
      current = readFileSync(p.projectFile, "utf-8");
    } catch (cause) {
      return err({ kind: "IO_ERROR", message: `cannot read ${p.projectFile}`, cause });
    }
    const currentHash = createHash("sha256").update(current).digest("hex");
    if (currentHash !== opts.expectedHash) {
      return err({
        kind: "STALE_WRITE",
        message: `project.yml changed underneath: expected ${opts.expectedHash.slice(0, 8)}, got ${currentHash.slice(0, 8)}`,
        currentHash,
      });
    }
  }

  const content = fulcrumYamlStringify(validated.data);
  const uuid = randomBytes(8).toString("hex");
  const tmpPath = join(p.fulcrumDir, `.project-tmp-${uuid}`);
  try {
    await writeFile(tmpPath, content, { flag: "wx", encoding: "utf-8" });
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
