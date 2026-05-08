import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { err, ok, type FulcrumError, type Result } from "./result.ts";

const FIRST_SEQUENCE = 1001;
const MAX_RETRIES = 5;

const FILENAME_RE = /^T-(\d+)-([0-9a-f]{4})(?:-.*)?\.md$/;

/** 4 hex chars. Cryptographically random. ~65k space. */
export function generateRandomSuffix(): string {
  return randomBytes(2).toString("hex");
}

/**
 * Read all story filenames from `storiesDir` and return the highest sequence
 * number found, or `FIRST_SEQUENCE - 1` if none exist (so the next sequence
 * is FIRST_SEQUENCE itself).
 *
 * Returns 0 / IO_ERROR for missing dir or read failure; caller handles.
 */
export async function highestSequence(
  storiesDir: string,
): Promise<Result<number, FulcrumError>> {
  if (!existsSync(storiesDir)) {
    return ok(FIRST_SEQUENCE - 1);
  }
  let entries: string[];
  try {
    entries = await readdir(storiesDir);
  } catch (cause) {
    return err({
      kind: "IO_ERROR",
      message: `failed to read stories dir ${storiesDir}`,
      cause,
    });
  }
  let max = FIRST_SEQUENCE - 1;
  for (const name of entries) {
    const m = FILENAME_RE.exec(name);
    if (!m) continue;
    const seq = parseInt(m[1]!, 10);
    if (seq > max) max = seq;
  }
  return ok(max);
}

export type AllocatedId = {
  /** Full id form: T-{seq}-{hex}. */
  fullId: string;
  /** Sequence component. */
  sequence: number;
  /** 4-hex random component. */
  suffix: string;
};

/**
 * Allocate the next story id for a given stories dir. Computes
 * `highestSequence + 1` and pairs it with a fresh random suffix.
 *
 * NOTE: This does NOT claim the filename on disk; it just computes the id.
 * The actual atomic claim happens at write time — `writeStoryAtomic` (in
 * io/stories.ts) opens the file with `wx` and retries with a new suffix on
 * EEXIST.
 */
export async function allocateId(
  storiesDir: string,
): Promise<Result<AllocatedId, FulcrumError>> {
  const seqResult = await highestSequence(storiesDir);
  if (!seqResult.ok) return seqResult;
  const sequence = seqResult.value + 1;
  const suffix = generateRandomSuffix();
  return ok({ fullId: `T-${sequence}-${suffix}`, sequence, suffix });
}

/** Build a regenerated id (same sequence, fresh suffix) for retry on EEXIST. */
export function regenerateSuffix(prev: AllocatedId): AllocatedId {
  return {
    fullId: `T-${prev.sequence}-${generateRandomSuffix()}`,
    sequence: prev.sequence,
    suffix: generateRandomSuffix(),
  };
}

export const ID_ALLOCATOR_MAX_RETRIES = MAX_RETRIES;
