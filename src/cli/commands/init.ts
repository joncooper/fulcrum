import { basename, resolve } from "node:path";
import { initProject } from "../../domain/io/init.ts";
import { parseArgs } from "../util.ts";

export async function runInit(args: string[]): Promise<number> {
  const { positional, flags } = parseArgs(args);
  const json = flags.json === true;
  const cwd = process.cwd();
  const explicit = positional[0]?.trim();
  const name = explicit && explicit.length > 0 ? explicit : basename(resolve(cwd));

  const result = await initProject({ cwd, name });

  if (!result.ok) {
    const { error } = result;
    if (json) {
      process.stderr.write(
        JSON.stringify({ ok: false, error: { kind: error.kind, message: error.message } }) + "\n",
      );
    } else {
      process.stderr.write(`fulcrum init: ${error.kind}: ${error.message}\n`);
    }
    return 1;
  }

  if (json) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        name,
        projectFile: result.value.projectFile,
      }) + "\n",
    );
  } else {
    process.stdout.write(`fulcrum: initialized at ${result.value.projectFile}\n`);
    process.stdout.write(`         project name: ${name}\n`);
  }
  return 0;
}
