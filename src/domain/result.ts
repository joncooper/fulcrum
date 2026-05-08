export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type FulcrumError =
  | { kind: "NOT_FOUND"; message: string; cause?: unknown }
  | { kind: "INVALID_TRANSITION"; message: string; cause?: unknown }
  | { kind: "INVALID_FRONTMATTER"; message: string; cause?: unknown }
  | { kind: "ID_COLLISION"; message: string; cause?: unknown }
  | { kind: "IO_ERROR"; message: string; cause?: unknown }
  | { kind: "GIT_ERROR"; message: string; cause?: unknown }
  | { kind: "CONFLICT_PRESENT"; message: string; cause?: unknown }
  | { kind: "INVALID_ICEBOX_TERMINAL"; message: string; cause?: unknown }
  | { kind: "STALE_WRITE"; message: string; currentHash?: string; cause?: unknown }
  | { kind: "AMBIGUOUS_ID"; message: string; cause?: unknown }
  | { kind: "NOT_GIT_REPO"; message: string; cause?: unknown }
  | { kind: "ALREADY_INITIALIZED"; message: string; cause?: unknown };
