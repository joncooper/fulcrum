import { runInit } from "./commands/init.ts";

const HELP = `fulcrum — product engineering surface for solo agentic engineering

Usage:
  fulcrum <command> [args]

Commands (M1, in progress):
  init [name]    Initialize fulcrum in the current directory.

See the design doc at ~/.gstack/projects/fulcrum/ for the full M1 plan.
`;

export async function main(argv: string[]): Promise<number> {
  const [subcommand, ...rest] = argv;

  if (!subcommand) {
    process.stderr.write(HELP);
    return 1;
  }

  if (subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    process.stdout.write(HELP);
    return 0;
  }

  switch (subcommand) {
    case "init":
      return runInit(rest);
    default:
      process.stderr.write(`fulcrum: unknown subcommand: ${subcommand}\n\n`);
      process.stderr.write(HELP);
      return 1;
  }
}
