import {
  deleteStory,
  findStoryPath,
  readStoryFile,
} from "../../domain/io/stories.ts";
import { titleFromBody } from "../../domain/markdown.ts";
import { emitError, emitOk, failNoProject, findProjectRoot, parseArgs } from "../util.ts";

export async function runRm(args: string[]): Promise<number> {
  const { positional, flags } = parseArgs(args);
  const json = flags.json === true;
  const force = flags.force === true || flags.f === true;

  if (positional.length < 1) {
    process.stderr.write("fulcrum rm: usage: fulcrum rm <id> [--force] [--json]\n");
    return 1;
  }

  const proj = findProjectRoot();
  if (!proj) return failNoProject();

  const path = await findStoryPath({ storiesDir: proj.storiesDir, query: positional[0]! });
  if (!path.ok) {
    emitError("fulcrum rm", path.error, json);
    return 1;
  }
  const file = await readStoryFile(path.value);
  if (!file.ok) {
    emitError("fulcrum rm", file.error, json);
    return 1;
  }

  const title = titleFromBody(file.value.story.body);
  if (!force && !json && process.stdin.isTTY) {
    process.stdout.write(`fulcrum rm: delete ${file.value.story.frontmatter.id} "${title}"? [y/N] `);
    const answer = await readLine();
    if (!/^y(es)?$/i.test(answer.trim())) {
      process.stderr.write("fulcrum rm: aborted\n");
      return 1;
    }
  }

  const result = await deleteStory({ path: file.value.path, expectedHash: file.value.hash });
  if (!result.ok) {
    emitError("fulcrum rm", result.error, json);
    return 1;
  }

  emitOk(
    json,
    { id: file.value.story.frontmatter.id, path: file.value.path, title },
    `${file.value.story.frontmatter.id}  removed  ${title}`,
  );
  return 0;
}

function readLine(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      const nl = buf.indexOf("\n");
      if (nl >= 0) {
        process.stdin.off("data", onData);
        resolve(buf.slice(0, nl));
      }
    };
    process.stdin.on("data", onData);
  });
}
