import YAML from "yaml";
import { err, ok, type FulcrumError, type Result } from "./result.ts";
import { fulcrumYamlStringify } from "./yaml.ts";

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
const CONFLICT_MARKER = /^(<<<<<<< |\|\|\|\|\|\|\| |======= |>>>>>>> )/m;

/** Extract the H1 title text from a story body. Returns "" if no H1. */
export function titleFromBody(body: string): string {
  const firstLine = body.split("\n")[0] ?? "";
  return firstLine.replace(/^#\s*/, "").trim();
}

/** Replace the H1 line with `# {title}`; if no H1 exists, prepend one. */
export function replaceTitleInBody(body: string, title: string): string {
  const lines = body.split("\n");
  if (lines.length > 0 && /^#\s/.test(lines[0]!)) {
    lines[0] = `# ${title}`;
    return lines.join("\n");
  }
  return `# ${title}\n\n${body}`;
}

export type ParsedStoryFile = {
  frontmatter: unknown; // not yet schema-validated; caller pipes through StoryFrontmatterSchema
  body: string;
};

/**
 * Parse a fulcrum story file: YAML frontmatter delimited by `---` then a
 * markdown body. Returns CONFLICT_PRESENT if the file contains git conflict
 * markers (so callers can route to conflict UX instead of crashing the YAML
 * parser).
 */
export function parseStoryFile(
  content: string,
): Result<ParsedStoryFile, FulcrumError> {
  if (CONFLICT_MARKER.test(content)) {
    return err({
      kind: "CONFLICT_PRESENT",
      message: "story file contains git conflict markers",
    });
  }

  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: "no `---` delimited frontmatter at start of file",
    });
  }

  const yamlText = match[1]!;
  const body = match[2] ?? "";

  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlText);
  } catch (cause) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: `frontmatter is not valid YAML: ${(cause as Error).message ?? String(cause)}`,
      cause,
    });
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: "frontmatter must parse to an object",
    });
  }

  return ok({
    frontmatter: parsed,
    body: body.startsWith("\n") ? body.slice(1) : body,
  });
}

/**
 * Serialize a story file: deterministic YAML frontmatter + a single blank line
 * + body + trailing newline.
 *
 * Determinism (committed in plan + eng review):
 * - alphabetical key order
 * - one field per line
 * - trailing newline normalized to single \n
 */
export function serializeStoryFile(
  frontmatter: Record<string, unknown>,
  body: string,
): string {
  const yamlText = fulcrumYamlStringify(frontmatter); // already ends with \n
  const trimmedBody = body.replace(/\n+$/, "");
  return `---\n${yamlText}---\n\n${trimmedBody}\n`;
}
