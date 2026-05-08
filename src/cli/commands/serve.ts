import { startServer } from "../../server/main.ts";
import { failNoProject, findProjectRoot, parseArgs } from "../util.ts";

export async function runServe(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const proj = findProjectRoot();
  if (!proj) return failNoProject();

  const port = flags.port !== undefined ? parseInt(String(flags.port), 10) : 3737;
  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    process.stderr.write(`fulcrum serve: invalid --port: ${flags.port}\n`);
    return 1;
  }
  const hostname = typeof flags.host === "string" ? flags.host : "127.0.0.1";

  let server;
  try {
    server = startServer({ port, hostname, project: proj });
  } catch (cause) {
    process.stderr.write(`fulcrum serve: ${(cause as Error).message}\n`);
    return 1;
  }

  process.stdout.write(`fulcrum: serving ${proj.root}\n`);
  process.stdout.write(`         ${server.url}\n`);
  process.stdout.write(`         press ctrl-c to stop\n`);

  return new Promise<number>((resolve) => {
    const stop = async () => {
      await server.stop();
      resolve(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}
