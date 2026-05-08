import { basename, resolve } from "node:path";
import { initProject } from "../../domain/io/init.ts";

export async function runInit(args: string[]): Promise<number> {
  const cwd = process.cwd();
  const explicit = args[0]?.trim();
  const name = explicit && explicit.length > 0 ? explicit : basename(resolve(cwd));

  const result = await initProject({ cwd, name });

  if (!result.ok) {
    const { error } = result;
    console.error(`fulcrum init: ${error.kind}: ${error.message}`);
    return 1;
  }

  console.log(`fulcrum: initialized at ${result.value.projectFile}`);
  console.log(`         project name: ${name}`);
  return 0;
}
