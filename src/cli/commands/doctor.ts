import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { listStories } from "../../domain/io/stories.ts";
import { emitOk, failNoProject, findProjectRoot, parseArgs } from "../util.ts";

/**
 * `fulcrum doctor` — surface filesystem anomalies in `.fulcrum/stories/`.
 *
 * Checks (per design doc Failure Modes):
 *   1. Malformed YAML frontmatter / failed schema — listed by listStories.
 *   2. Orphan temp files (`.{seq}-tmp-{uuid}`) — leftovers from crashed writes.
 *   3. Story ID collisions across worktrees — multiple files claiming the
 *      same id with different content (post-merge).
 *   4. Position-field rank length > 12 — suggests running `fulcrum repack`.
 *
 * With `--fix`, deletes orphan temp files (other findings are reported only;
 * collisions and malformed frontmatter need human review).
 *
 * With `--json`, outputs a structured report; otherwise pretty-printed lines.
 */

const RANK_TOO_LONG_THRESHOLD = 12;
const TEMP_FILE_RE = /^\.\d+-tmp-[0-9a-f]+$/;

type DoctorReport = {
  malformed: { path: string; kind: string; message: string }[];
  orphan_temps: string[];
  id_collisions: { id: string; paths: string[] }[];
  long_ranks: { id: string; position: string }[];
  fixed_temps: string[];
};

export async function runDoctor(args: string[]): Promise<number> {
  const { flags } = parseArgs(args);
  const json = flags.json === true;
  const fix = flags.fix === true;

  const proj = findProjectRoot();
  if (!proj) return failNoProject(json);

  const report: DoctorReport = {
    malformed: [],
    orphan_temps: [],
    id_collisions: [],
    long_ranks: [],
    fixed_temps: [],
  };

  // 1 + 4: malformed frontmatter + long ranks come from a full listStories pass.
  const list = await listStories(proj.storiesDir);
  if (!list.ok) {
    if (json) {
      process.stderr.write(
        JSON.stringify({ ok: false, error: list.error }) + "\n",
      );
    } else {
      process.stderr.write(`fulcrum doctor: ${list.error.kind}: ${list.error.message}\n`);
    }
    return 1;
  }
  for (const m of list.value.malformed) {
    report.malformed.push({
      path: m.path,
      kind: m.error.kind,
      message: m.error.message,
    });
  }
  // ID collisions — same id appearing on multiple files (random suffix would
  // normally make this impossible; happens after a merge from another branch).
  const idMap = new Map<string, string[]>();
  for (const s of list.value.stories) {
    const id = s.story.frontmatter.id;
    const paths = idMap.get(id) ?? [];
    paths.push(s.path);
    idMap.set(id, paths);
    if (s.story.frontmatter.position.length > RANK_TOO_LONG_THRESHOLD) {
      report.long_ranks.push({ id, position: s.story.frontmatter.position });
    }
  }
  for (const [id, paths] of idMap) {
    if (paths.length > 1) {
      report.id_collisions.push({ id, paths });
    }
  }

  // 2: orphan temp files — list raw dir and pick out anything matching the
  // hidden temp filename pattern.
  try {
    const entries = await readdir(proj.storiesDir);
    for (const name of entries) {
      if (TEMP_FILE_RE.test(name)) {
        const path = join(proj.storiesDir, name);
        if (fix) {
          try {
            await unlink(path);
            report.fixed_temps.push(path);
          } catch {
            report.orphan_temps.push(path);
          }
        } else {
          report.orphan_temps.push(path);
        }
      }
    }
  } catch {
    /* stories dir may not exist on a fresh init; treat as zero temps */
  }

  const allClear =
    report.malformed.length === 0 &&
    report.orphan_temps.length === 0 &&
    report.id_collisions.length === 0 &&
    report.long_ranks.length === 0;

  if (json) {
    emitOk(json, { ok: true, ...report, all_clear: allClear }, "");
    return 0;
  }

  // Pretty output
  const out = process.stdout;
  if (allClear && report.fixed_temps.length === 0) {
    out.write("fulcrum doctor: all clear\n");
    return 0;
  }
  if (report.malformed.length > 0) {
    out.write(`malformed frontmatter (${report.malformed.length}):\n`);
    for (const m of report.malformed) {
      out.write(`  ${m.path}\n    ${m.kind}: ${m.message}\n`);
    }
  }
  if (report.id_collisions.length > 0) {
    out.write(`id collisions (${report.id_collisions.length}):\n`);
    for (const c of report.id_collisions) {
      out.write(`  ${c.id}:\n`);
      for (const p of c.paths) out.write(`    ${p}\n`);
    }
    out.write(`  fix: rename one file to a fresh suffix and re-validate\n`);
  }
  if (report.long_ranks.length > 0) {
    out.write(`long Lexorank ranks (>${RANK_TOO_LONG_THRESHOLD} chars, ${report.long_ranks.length}):\n`);
    for (const r of report.long_ranks) {
      out.write(`  ${r.id}  position=${r.position} (${r.position.length} chars)\n`);
    }
    out.write(`  fix: run \`fulcrum repack\` to rebalance ranks (deferred to M1.x)\n`);
  }
  if (report.orphan_temps.length > 0) {
    out.write(`orphan temp files (${report.orphan_temps.length}):\n`);
    for (const p of report.orphan_temps) out.write(`  ${p}\n`);
    out.write(`  fix: re-run \`fulcrum doctor --fix\` to delete them\n`);
  }
  if (report.fixed_temps.length > 0) {
    out.write(`deleted ${report.fixed_temps.length} orphan temp file(s):\n`);
    for (const p of report.fixed_temps) out.write(`  ${p}\n`);
  }
  return 0;
}
