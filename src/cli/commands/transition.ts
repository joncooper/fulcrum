import { findStoryPath, readStoryFile, writeStoryAtomic } from "../../domain/io/stories.ts";
import { transition, type Command } from "../../domain/state-machine.ts";
import { emitError, emitOk, failNoProject, findProjectRoot, parseArgs } from "../util.ts";

export type TransitionVerb = "start" | "finish" | "deliver" | "accept" | "reject" | "restart";

export async function runTransition(verb: TransitionVerb, args: string[]): Promise<number> {
  const { positional, flags } = parseArgs(args);
  const json = flags.json === true;

  if (positional.length < 1) {
    process.stderr.write(`fulcrum ${verb}: usage: fulcrum ${verb} <id>${verb === "reject" ? ' --reason "..."' : ""} [--json]\n`);
    return 1;
  }

  const proj = findProjectRoot();
  if (!proj) return failNoProject();

  const path = await findStoryPath({ storiesDir: proj.storiesDir, query: positional[0]! });
  if (!path.ok) {
    emitError(`fulcrum ${verb}`, path.error, json);
    return 1;
  }
  const file = await readStoryFile(path.value);
  if (!file.ok) {
    emitError(`fulcrum ${verb}`, file.error, json);
    return 1;
  }

  let cmd: Command;
  if (verb === "reject") {
    const reason = typeof flags.reason === "string" ? flags.reason : undefined;
    if (!reason || reason.trim().length === 0) {
      process.stderr.write(`fulcrum reject: --reason "..." required\n`);
      return 1;
    }
    cmd = { kind: "reject", reason };
  } else {
    cmd = { kind: verb };
  }

  const transitioned = transition(file.value.story.frontmatter, cmd);
  if (!transitioned.ok) {
    emitError(`fulcrum ${verb}`, transitioned.error, json);
    return 1;
  }

  const updated = { frontmatter: transitioned.value, body: file.value.story.body };
  const written = await writeStoryAtomic({
    path: file.value.path,
    story: updated,
    expectedHash: file.value.hash,
  });
  if (!written.ok) {
    emitError(`fulcrum ${verb}`, written.error, json);
    return 1;
  }

  emitOk(
    json,
    {
      id: transitioned.value.id,
      previousState: file.value.story.frontmatter.state,
      state: transitioned.value.state,
      path: file.value.path,
    },
    `${transitioned.value.id}  ${file.value.story.frontmatter.state} → ${transitioned.value.state}`,
  );
  return 0;
}
