import type { FulcrumError } from "../domain/result.ts";

// Re-export for callers that already import from cli/util. Both CLI and server
// share these via src/domain/io/project.ts.
export {
  findProjectRoot,
  loadProject,
  type ProjectRoot,
} from "../domain/io/project.ts";

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

export function failNoProject(json = false): number {
  if (json) {
    process.stderr.write(
      JSON.stringify({
        ok: false,
        error: {
          kind: "NOT_FOUND",
          message: "not in a fulcrum project (no .fulcrum/project.yml in cwd or parents); run `fulcrum init`",
        },
      }) + "\n",
    );
  } else {
    process.stderr.write(
      "fulcrum: not in a fulcrum project (no .fulcrum/project.yml in cwd or parents)\n" +
        "         run `fulcrum init` to create one\n",
    );
  }
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
