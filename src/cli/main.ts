import { runEdit } from "./commands/edit.ts";
import { runInit } from "./commands/init.ts";
import { runList } from "./commands/list.ts";
import { runNew } from "./commands/new.ts";
import { runServe } from "./commands/serve.ts";
import { runShow } from "./commands/show.ts";
import { runTransition, type TransitionVerb } from "./commands/transition.ts";

const HELP = `fulcrum — product engineering surface for solo agentic engineering

Usage:
  fulcrum <command> [args]

Commands (M1):
  init [name]              Initialize fulcrum in the current directory.
  new <type> "<title>"     Create a new story (type: feature/bug/chore/release).
                           Flags: --points N --epic SLUG --labels a,b,c --json
  list                     List all stories. Flags: --state X --type Y --json
  show <id>                Print one story (frontmatter + body). Flag: --json
  edit <id>                Edit story fields. Flags: --title --description
                           --type --points (N|-) --labels a,b --epic (S|-)
                           --icebox true|false --body @- --json
  start <id>               Transition unstarted → started.
  finish <id>              Transition → finished (auto-chains forward).
  deliver <id>             Transition → delivered (auto-chains forward).
  accept <id>              Transition delivered → accepted.
  reject <id> --reason X   Transition started/finished/delivered → rejected.
  restart <id>             Transition rejected → started.
  serve                    Boot the web UI + HTTP API on http://127.0.0.1:3737
                           Flags: --port N --host X

All commands accept --json for parseable output (intended for agent callers).

See the design doc at ~/.gstack/projects/fulcrum/ for the full M1 plan.
`;

const TRANSITION_VERBS: ReadonlySet<string> = new Set([
  "start",
  "finish",
  "deliver",
  "accept",
  "reject",
  "restart",
]);

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
    case "new":
      return runNew(rest);
    case "list":
    case "ls":
      return runList(rest);
    case "show":
      return runShow(rest);
    case "edit":
      return runEdit(rest);
    case "serve":
      return runServe(rest);
    default:
      if (TRANSITION_VERBS.has(subcommand)) {
        return runTransition(subcommand as TransitionVerb, rest);
      }
      process.stderr.write(`fulcrum: unknown subcommand: ${subcommand}\n\n`);
      process.stderr.write(HELP);
      return 1;
  }
}
