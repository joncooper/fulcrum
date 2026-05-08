import { findStoryPath, readStoryFile } from "../../domain/io/stories.ts";
import { emitError, failNoProject, findProjectRoot, parseArgs } from "../util.ts";

export async function runShow(args: string[]): Promise<number> {
  const { positional, flags } = parseArgs(args);
  const json = flags.json === true;

  if (positional.length < 1) {
    process.stderr.write("fulcrum show: usage: fulcrum show <id> [--json]\n");
    return 1;
  }
  const proj = findProjectRoot();
  if (!proj) return failNoProject();

  const path = await findStoryPath({ storiesDir: proj.storiesDir, query: positional[0]! });
  if (!path.ok) {
    emitError("fulcrum show", path.error, json);
    return 1;
  }
  const file = await readStoryFile(path.value);
  if (!file.ok) {
    emitError("fulcrum show", file.error, json);
    return 1;
  }

  if (json) {
    process.stdout.write(
      JSON.stringify({
        ok: true,
        story: file.value.story,
        path: file.value.path,
        hash: file.value.hash,
      }) + "\n",
    );
    return 0;
  }

  const fm = file.value.story.frontmatter;
  const out = process.stdout;
  out.write(`${fm.id}\n`);
  out.write(`  type:      ${fm.type}\n`);
  out.write(`  state:     ${fm.state}\n`);
  if (fm.points !== undefined) out.write(`  points:    ${fm.points}\n`);
  if (fm.epic) out.write(`  epic:      ${fm.epic}\n`);
  if (fm.labels.length > 0) out.write(`  labels:    ${fm.labels.join(", ")}\n`);
  if (fm.icebox) out.write(`  icebox:    true\n`);
  if (fm.accepted_at !== undefined) out.write(`  accepted:  ${fm.accepted_at}\n`);
  if (fm.reject_reason) out.write(`  rejected:  ${fm.reject_reason}\n`);
  out.write(`  position:  ${fm.position}\n`);
  out.write(`  created:   ${fm.created}\n`);
  out.write(`\n${file.value.story.body}`);
  if (!file.value.story.body.endsWith("\n")) out.write("\n");
  return 0;
}
