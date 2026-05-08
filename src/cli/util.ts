import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import { err, ok, type FulcrumError, type Result } from "../domain/result.ts";
import { ProjectSchema, type Project } from "../domain/schemas/project.ts";

export type ProjectRoot = {
  /** Absolute path to the directory containing `.fulcrum/`. */
  root: string;
  fulcrumDir: string;
  storiesDir: string;
  projectFile: string;
};

/** Walk up from `start` looking for `.fulcrum/project.yml`. Like git's repo discovery. */
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

export type ParsedArgs = {
  positional: string[];
  flags: Record<string, string | boolean>;
};

/**
 * Tiny argv parser. No external dep.
 * - `--key value` → `{ key: "value" }`
 * - `--key=value` → `{ key: "value" }`
 * - `--flag`      → `{ flag: true }`  (when next arg is missing or starts with "--")
 * - everything else is positional
 */
export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

export function failNoProject(): number {
  process.stderr.write(
    "fulcrum: not in a fulcrum project (no .fulcrum/project.yml in cwd or parents)\n" +
      "         run `fulcrum init` to create one\n",
  );
  return 1;
}

export function emitError(prefix: string, error: FulcrumError, json: boolean): void {
  if (json) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: { kind: error.kind, message: error.message } }) + "\n",
    );
  } else {
    process.stderr.write(`${prefix}: ${error.kind}: ${error.message}\n`);
  }
}

export function emitOk(
  json: boolean,
  payload: Record<string, unknown>,
  humanLine?: string,
): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: true, ...payload }) + "\n");
  } else if (humanLine !== undefined) {
    process.stdout.write(humanLine + "\n");
  }
}
