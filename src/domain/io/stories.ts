import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ID_ALLOCATOR_MAX_RETRIES,
  allocateId,
  regenerateSuffix,
} from "../id-allocator.ts";
import { parseStoryFile, serializeStoryFile } from "../markdown.ts";
import { err, ok, type FulcrumError, type Result } from "../result.ts";
import {
  StoryFrontmatterSchema,
  idMatches,
  type Story,
  type StoryFrontmatter,
} from "../schemas/story.ts";
import { slugify } from "../slug.ts";

const STORY_FILENAME_RE = /^(T-\d+-[0-9a-f]{4})(?:-.*)?\.md$/;

export type LoadedStory = {
  story: Story;
  /** Absolute path on disk. */
  path: string;
  /** SHA-256 of file content; pass back to writeStoryAtomic for CAS. */
  hash: string;
};

export type CreateStoryInput = {
  storiesDir: string;
  type: StoryFrontmatter["type"];
  title: string;
  body?: string;
  points?: number;
  /** Pre-computed Lexorank rank for this story. */
  position: string;
  labels?: string[];
};

/**
 * Create a new story. Allocates an id, writes the file with `wx` flag (atomic
 * create-if-not-exists), retries with a fresh random suffix on EEXIST.
 */
export async function createStory(
  input: CreateStoryInput,
): Promise<Result<LoadedStory, FulcrumError>> {
  const allocResult = await allocateId(input.storiesDir);
  if (!allocResult.ok) return allocResult;
  let allocated = allocResult.value;

  const slug = slugify(input.title);
  const now = new Date().toISOString().slice(0, 10);

  await mkdir(input.storiesDir, { recursive: true });

  let lastError: FulcrumError | null = null;
  for (let attempt = 0; attempt <= ID_ALLOCATOR_MAX_RETRIES; attempt++) {
    const fmCandidate = {
      id: allocated.fullId,
      type: input.type,
      state: "unstarted" as const,
      points: input.points,
      position: input.position,
      labels: input.labels ?? [],
      icebox: false,
      created: now,
    };
    const validated = StoryFrontmatterSchema.safeParse(fmCandidate);
    if (!validated.success) {
      return err({
        kind: "INVALID_FRONTMATTER",
        message: `new story failed schema: ${validated.error.message}`,
        cause: validated.error,
      });
    }

    const filename = `${allocated.fullId}-${slug}.md`;
    const path = join(input.storiesDir, filename);
    const body = input.body ?? `# ${input.title}\n`;
    const content = serializeStoryFile(validated.data, body);

    try {
      await writeFile(path, content, { flag: "wx", encoding: "utf-8" });
      const hash = createHash("sha256").update(content).digest("hex");
      return ok({
        story: { frontmatter: validated.data, body },
        path,
        hash,
      });
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code === "EEXIST") {
        allocated = regenerateSuffix(allocated);
        lastError = {
          kind: "ID_COLLISION",
          message: `EEXIST on ${path}; retrying with fresh suffix (attempt ${attempt + 1})`,
        };
        continue;
      }
      return err({
        kind: "IO_ERROR",
        message: `failed to write ${path}`,
        cause,
      });
    }
  }
  return err(
    lastError ?? {
      kind: "ID_COLLISION",
      message: `exhausted ${ID_ALLOCATOR_MAX_RETRIES + 1} retries`,
    },
  );
}

/**
 * Find the on-disk path for a story by full ID, T-prefixed short ID, or numeric
 * sequence. Returns NOT_FOUND if no match, AMBIGUOUS_ID if multiple matches.
 */
export async function findStoryPath(opts: {
  storiesDir: string;
  query: string;
}): Promise<Result<string, FulcrumError>> {
  if (!existsSync(opts.storiesDir)) {
    return err({
      kind: "NOT_FOUND",
      message: `stories dir does not exist: ${opts.storiesDir}`,
    });
  }
  let entries: string[];
  try {
    entries = await readdir(opts.storiesDir);
  } catch (cause) {
    return err({
      kind: "IO_ERROR",
      message: `cannot read stories dir ${opts.storiesDir}`,
      cause,
    });
  }
  const matches: string[] = [];
  for (const name of entries) {
    const m = STORY_FILENAME_RE.exec(name);
    if (!m) continue;
    if (idMatches(opts.query, m[1]!)) matches.push(name);
  }
  if (matches.length === 0) {
    return err({
      kind: "NOT_FOUND",
      message: `no story matches ${JSON.stringify(opts.query)}`,
    });
  }
  if (matches.length > 1) {
    return err({
      kind: "AMBIGUOUS_ID",
      message: `${matches.length} stories match ${JSON.stringify(opts.query)}: ${matches.join(", ")}`,
    });
  }
  return ok(join(opts.storiesDir, matches[0]!));
}

/** Read a story by path; parse, schema-validate, return frontmatter + body + hash. */
export async function readStoryFile(
  path: string,
): Promise<Result<LoadedStory, FulcrumError>> {
  let content: string;
  try {
    content = await readFile(path, "utf-8");
  } catch (cause) {
    return err({ kind: "IO_ERROR", message: `failed to read ${path}`, cause });
  }
  const parsed = parseStoryFile(content);
  if (!parsed.ok) return parsed;
  const validated = StoryFrontmatterSchema.safeParse(parsed.value.frontmatter);
  if (!validated.success) {
    return err({
      kind: "INVALID_FRONTMATTER",
      message: `story ${path}: schema invalid — ${validated.error.message}`,
      cause: validated.error,
    });
  }
  const hash = createHash("sha256").update(content).digest("hex");
  return ok({
    story: { frontmatter: validated.data, body: parsed.value.body },
    path,
    hash,
  });
}

export type ListStoriesResult = {
  stories: LoadedStory[];
  /** Files that failed schema or YAML parse — surface in the UI's "needs attention" lane. */
  malformed: { path: string; error: FulcrumError }[];
};

/** List every story file in `storiesDir`. Malformed files are returned separately, not silently dropped. */
export async function listStories(
  storiesDir: string,
): Promise<Result<ListStoriesResult, FulcrumError>> {
  if (!existsSync(storiesDir)) {
    return ok({ stories: [], malformed: [] });
  }
  let entries: string[];
  try {
    entries = await readdir(storiesDir);
  } catch (cause) {
    return err({
      kind: "IO_ERROR",
      message: `cannot read ${storiesDir}`,
      cause,
    });
  }
  const stories: LoadedStory[] = [];
  const malformed: { path: string; error: FulcrumError }[] = [];
  for (const name of entries) {
    if (!STORY_FILENAME_RE.test(name)) continue;
    const path = join(storiesDir, name);
    const result = await readStoryFile(path);
    if (result.ok) {
      stories.push(result.value);
    } else {
      malformed.push({ path, error: result.error });
    }
  }
  // Sort by position field for deterministic order
  stories.sort((a, b) =>
    a.story.frontmatter.position < b.story.frontmatter.position ? -1 : 1,
  );
  return ok({ stories, malformed });
}

/**
 * Atomic write with optional CAS-on-hash. If `expectedHash` is provided and the
 * on-disk content's hash doesn't match, returns STALE_WRITE.
 *
 * Atomicity: writes content to a temp sibling file, then renames into place.
 * `rename` is atomic on POSIX within the same filesystem. A partial write or
 * crash leaves the tmp file behind; `fulcrum doctor` cleans those up.
 */
export async function writeStoryAtomic(opts: {
  path: string;
  story: Story;
  expectedHash?: string;
}): Promise<Result<{ hash: string }, FulcrumError>> {
  if (opts.expectedHash !== undefined && existsSync(opts.path)) {
    const current = await readStoryFile(opts.path);
    if (current.ok && current.value.hash !== opts.expectedHash) {
      return err({
        kind: "STALE_WRITE",
        message: `story changed underneath: expected ${opts.expectedHash.slice(0, 8)}, got ${current.value.hash.slice(0, 8)}`,
        currentHash: current.value.hash,
      });
    }
  }

  const content = serializeStoryFile(
    opts.story.frontmatter as unknown as Record<string, unknown>,
    opts.story.body,
  );
  const tmpPath = `${opts.path}.tmp.${randomBytes(4).toString("hex")}`;
  try {
    await writeFile(tmpPath, content, { encoding: "utf-8" });
    await rename(tmpPath, opts.path);
    const hash = createHash("sha256").update(content).digest("hex");
    return ok({ hash });
  } catch (cause) {
    try {
      await unlink(tmpPath);
    } catch {
      // best-effort cleanup; doctor will collect leftovers
    }
    return err({
      kind: "IO_ERROR",
      message: `failed to write ${opts.path}`,
      cause,
    });
  }
}
