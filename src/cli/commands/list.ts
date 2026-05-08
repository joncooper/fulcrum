import { listStories } from "../../domain/io/stories.ts";
import type { StoryType } from "../../domain/schemas/story.ts";
import { failNoProject, findProjectRoot, parseArgs } from "../util.ts";

const TYPE_ICONS: Record<StoryType, string> = {
  feature: "★",
  bug: "●",
  chore: "⚙",
  release: "▼",
};

function titleFromBody(body: string): string {
  const firstLine = body.split("\n")[0] ?? "";
  return firstLine.replace(/^#\s*/, "").trim();
}

export async function runList(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const json = flags.json === true;
  const proj = findProjectRoot();
  if (!proj) return failNoProject();

  const list = await listStories(proj.storiesDir);
  if (!list.ok) {
    process.stderr.write(`fulcrum list: ${list.error.kind}: ${list.error.message}\n`);
    return 1;
  }

  const stateFilter = typeof flags.state === "string" ? flags.state : undefined;
  const typeFilter = typeof flags.type === "string" ? flags.type : undefined;
  const filtered = list.value.stories.filter(
    (s) =>
      (!stateFilter || s.story.frontmatter.state === stateFilter) &&
      (!typeFilter || s.story.frontmatter.type === typeFilter),
  );

  if (json) {
    const out = {
      ok: true,
      stories: filtered.map((s) => ({
        id: s.story.frontmatter.id,
        type: s.story.frontmatter.type,
        state: s.story.frontmatter.state,
        title: titleFromBody(s.story.body),
        points: s.story.frontmatter.points ?? null,
        position: s.story.frontmatter.position,
        icebox: s.story.frontmatter.icebox,
        iteration: s.story.frontmatter.iteration ?? null,
        labels: s.story.frontmatter.labels,
        path: s.path,
      })),
      malformed: list.value.malformed.map((m) => ({
        path: m.path,
        kind: m.error.kind,
        message: m.error.message,
      })),
    };
    process.stdout.write(JSON.stringify(out) + "\n");
    return 0;
  }

  if (filtered.length === 0) {
    process.stdout.write("(no stories" + (stateFilter || typeFilter ? " matching filters" : "") + ")\n");
    return 0;
  }

  for (const s of filtered) {
    const fm = s.story.frontmatter;
    const title = titleFromBody(s.story.body);
    const icon = TYPE_ICONS[fm.type];
    const pts = fm.points !== undefined ? `[${fm.points}]` : "[ ]";
    const state = fm.state.padEnd(9);
    const iceboxFlag = fm.icebox ? " (icebox)" : "";
    process.stdout.write(`${icon} ${fm.id}  ${pts}  ${state}  ${title}${iceboxFlag}\n`);
  }
  if (list.value.malformed.length > 0) {
    process.stderr.write(`\n${list.value.malformed.length} malformed file(s):\n`);
    for (const m of list.value.malformed) {
      process.stderr.write(`  ${m.path}: ${m.error.kind} — ${m.error.message}\n`);
    }
  }
  return 0;
}
