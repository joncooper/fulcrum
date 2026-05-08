import { createStory, listStories } from "../../domain/io/stories.ts";
import { between } from "../../domain/position.ts";
import type { StoryType } from "../../domain/schemas/story.ts";
import { emitError, emitOk, failNoProject, findProjectRoot, parseArgs } from "../util.ts";

const VALID_TYPES: readonly StoryType[] = ["feature", "bug", "chore", "release"];

export async function runNew(args: string[]): Promise<number> {
  const { positional, flags } = parseArgs(args);
  const json = flags.json === true;

  if (positional.length < 2) {
    process.stderr.write(
      'fulcrum new: usage: fulcrum new <type> "<title>" [--points N] [--epic SLUG] [--labels a,b,c] [--json]\n' +
        `             type must be one of: ${VALID_TYPES.join(", ")}\n`,
    );
    return 1;
  }
  const [type, ...titleParts] = positional;
  if (!VALID_TYPES.includes(type as StoryType)) {
    process.stderr.write(
      `fulcrum new: invalid type ${JSON.stringify(type)}; expected one of ${VALID_TYPES.join(", ")}\n`,
    );
    return 1;
  }
  const title = titleParts.join(" ").trim();
  if (title.length === 0) {
    process.stderr.write("fulcrum new: title cannot be empty\n");
    return 1;
  }

  const proj = findProjectRoot();
  if (!proj) return failNoProject();

  let points: number | undefined;
  if (flags.points !== undefined) {
    const n = parseInt(String(flags.points), 10);
    if (!Number.isFinite(n)) {
      process.stderr.write("fulcrum new: --points must be a number\n");
      return 1;
    }
    points = n;
  }
  const labels =
    typeof flags.labels === "string"
      ? flags.labels.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;
  const epic = typeof flags.epic === "string" ? flags.epic : undefined;

  // Position: insert at end of position-sorted list (between last and null).
  const list = await listStories(proj.storiesDir);
  if (!list.ok) {
    emitError("fulcrum new", list.error, json);
    return 1;
  }
  const lastPos =
    list.value.stories.length === 0
      ? null
      : list.value.stories[list.value.stories.length - 1]!.story.frontmatter.position;
  let position: string;
  try {
    position = between(lastPos, null);
  } catch (cause) {
    emitError(
      "fulcrum new",
      { kind: "IO_ERROR", message: `failed to compute position`, cause },
      json,
    );
    return 1;
  }

  const result = await createStory({
    storiesDir: proj.storiesDir,
    type: type as StoryType,
    title,
    points,
    position,
    labels,
  });

  if (!result.ok) {
    emitError("fulcrum new", result.error, json);
    return 1;
  }

  // If user passed --epic, write it via a follow-up edit (createStory doesn't
  // currently take epic; keep that in scope). Defer to `fulcrum edit` for now.
  if (epic !== undefined) {
    process.stderr.write(
      "fulcrum new: --epic ignored in this build; edit the file or use `fulcrum edit` (M1.x)\n",
    );
  }

  emitOk(
    json,
    {
      id: result.value.story.frontmatter.id,
      type: result.value.story.frontmatter.type,
      state: result.value.story.frontmatter.state,
      points: result.value.story.frontmatter.points ?? null,
      title,
      path: result.value.path,
    },
    `${result.value.story.frontmatter.id}  ${type}  ${title}`,
  );
  return 0;
}
