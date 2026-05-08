import { findStoryPath, readStoryFile, writeStoryAtomic } from "../../domain/io/stories.ts";
import { replaceTitleInBody, titleFromBody } from "../../domain/markdown.ts";
import {
  StoryFrontmatterSchema,
  type StoryFrontmatter,
  type StoryType,
} from "../../domain/schemas/story.ts";
import { emitError, emitOk, failNoProject, findProjectRoot, parseArgs } from "../util.ts";

const VALID_TYPES: readonly StoryType[] = ["feature", "bug", "chore", "release"];

const USAGE = `fulcrum edit: usage:
  fulcrum edit <id> [--title "..."] [--description "..."]
                    [--type feature|bug|chore|release]
                    [--points N | --points -]
                    [--labels a,b,c]
                    [--epic SLUG | --epic -]
                    [--icebox true|false]
                    [--body @-]   # read full body from stdin
                    [--json]
`;

export async function runEdit(args: string[]): Promise<number> {
  const { positional, flags } = parseArgs(args);
  const json = flags.json === true;

  if (positional.length < 1) {
    process.stderr.write(USAGE);
    return 1;
  }

  const proj = findProjectRoot();
  if (!proj) return failNoProject();

  const path = await findStoryPath({ storiesDir: proj.storiesDir, query: positional[0]! });
  if (!path.ok) {
    emitError("fulcrum edit", path.error, json);
    return 1;
  }
  const file = await readStoryFile(path.value);
  if (!file.ok) {
    emitError("fulcrum edit", file.error, json);
    return 1;
  }
  const cur = file.value.story.frontmatter;
  const nextFm: Record<string, unknown> = { ...cur };
  let bodyOverride: string | undefined;
  let titleOverride: string | undefined;
  let descriptionOverride: string | undefined;
  let touched = false;

  if (flags.type !== undefined) {
    const t = String(flags.type);
    if (!VALID_TYPES.includes(t as StoryType)) {
      process.stderr.write(`fulcrum edit: --type must be one of ${VALID_TYPES.join(", ")}\n`);
      return 1;
    }
    nextFm.type = t;
    touched = true;
  }
  if (flags.points !== undefined) {
    if (flags.points === "-") {
      delete nextFm.points;
    } else {
      const n = parseInt(String(flags.points), 10);
      if (!Number.isFinite(n)) {
        process.stderr.write("fulcrum edit: --points must be a number or '-' to clear\n");
        return 1;
      }
      nextFm.points = n;
    }
    touched = true;
  }
  if (flags.labels !== undefined) {
    nextFm.labels = String(flags.labels)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    touched = true;
  }
  if (flags.epic !== undefined) {
    if (flags.epic === "-") delete nextFm.epic;
    else nextFm.epic = String(flags.epic);
    touched = true;
  }
  if (flags.icebox !== undefined) {
    if (flags.icebox === true || flags.icebox === "true") nextFm.icebox = true;
    else if (flags.icebox === "false") nextFm.icebox = false;
    else {
      process.stderr.write("fulcrum edit: --icebox must be true or false\n");
      return 1;
    }
    touched = true;
  }
  if (flags.title !== undefined) {
    const t = String(flags.title).trim();
    if (t.length === 0) {
      process.stderr.write("fulcrum edit: --title cannot be empty\n");
      return 1;
    }
    titleOverride = t;
    touched = true;
  }
  if (flags.description !== undefined) {
    descriptionOverride = String(flags.description);
    touched = true;
  }
  if (flags.body !== undefined) {
    if (flags.body === "@-") {
      bodyOverride = await readStdin();
    } else {
      bodyOverride = String(flags.body);
    }
    touched = true;
  }

  if (!touched) {
    process.stderr.write(USAGE);
    return 1;
  }

  const validated = StoryFrontmatterSchema.safeParse(nextFm);
  if (!validated.success) {
    emitError(
      "fulcrum edit",
      {
        kind: "INVALID_FRONTMATTER",
        message: validated.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      json,
    );
    return 1;
  }

  let nextBody = file.value.story.body;
  if (bodyOverride !== undefined) {
    nextBody = bodyOverride;
  } else {
    const newTitle = titleOverride ?? titleFromBody(nextBody);
    if (descriptionOverride !== undefined) {
      nextBody =
        descriptionOverride.length > 0
          ? `# ${newTitle}\n\n${descriptionOverride}`
          : `# ${newTitle}\n`;
    } else if (titleOverride !== undefined) {
      nextBody = replaceTitleInBody(nextBody, titleOverride);
    }
  }

  const written = await writeStoryAtomic({
    path: file.value.path,
    story: { frontmatter: validated.data as StoryFrontmatter, body: nextBody },
    expectedHash: file.value.hash,
  });
  if (!written.ok) {
    emitError("fulcrum edit", written.error, json);
    return 1;
  }

  emitOk(
    json,
    {
      id: validated.data.id,
      type: validated.data.type,
      state: validated.data.state,
      points: validated.data.points ?? null,
      title: titleFromBody(nextBody),
      path: file.value.path,
    },
    `${validated.data.id}  edited  ${titleFromBody(nextBody)}`,
  );
  return 0;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
