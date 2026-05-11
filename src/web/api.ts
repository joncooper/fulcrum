import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type StoryDto = {
  id: string;
  type: "feature" | "bug" | "chore" | "release";
  state: "unstarted" | "started" | "finished" | "delivered" | "accepted" | "rejected";
  points?: number;
  position: string;
  epic?: string;
  labels: string[];
  icebox: boolean;
  /** ISO 8601 timestamp set by the accept transition. Informational; used by the close ritual to decide which iteration to stamp. */
  accepted_at?: string;
  /** Iteration number stamped by the close ritual (immutable). Stories with this field are in the Done column. */
  iteration?: number;
  created: string;
  reject_reason?: string;
  title: string;
  body: string;
  path: string;
  hash: string;
};

export type IterationRecordDto = {
  number: number;
  start_date: string;
  end_date: string;
  velocity: number;
};

export type ProjectDto = {
  version: number;
  name: string;
  velocity: number;
  current_iteration: number;
  iteration_start_date: string;
  iteration_length_days: number;
  iteration_history: IterationRecordDto[];
  settings: { estimate_scale: number[] };
};

/**
 * One malformed story file — frontmatter or YAML failed to parse / validate.
 * The server still lists these so the UI can surface "needs attention."
 */
export type MalformedStory = {
  path: string;
  error: { kind: string; message: string };
};

/**
 * Server error envelope returned by API endpoints. Server sends this as
 * `{ ok: false, error: { kind, message } }`. We re-throw it as an Error
 * with the kind tucked onto a custom property so consumers can branch on
 * STALE_WRITE / IO_ERROR (ENOSPC) without parsing the message.
 */
export class FulcrumApiError extends Error {
  kind: string;
  status: number;
  constructor(kind: string, message: string, status: number) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.name = "FulcrumApiError";
  }
  /** Disk-full is reported by the server as IO_ERROR with ENOSPC in the cause/message. */
  get isDiskFull(): boolean {
    return this.kind === "IO_ERROR" && /ENOSPC/i.test(this.message);
  }
  get isStaleWrite(): boolean {
    return this.kind === "STALE_WRITE";
  }
}

function throwApiError(
  body: { error?: { kind?: string; message?: string } } | undefined,
  status: number,
  fallback: string,
): never {
  const kind = body?.error?.kind ?? "UNKNOWN";
  const message = body?.error?.message ?? fallback;
  throw new FulcrumApiError(kind, message, status);
}

export type StoriesResponse = {
  stories: StoryDto[];
  malformed: MalformedStory[];
};

export function useStories() {
  return useQuery({
    queryKey: ["stories"],
    queryFn: async (): Promise<StoriesResponse> => {
      const res = await fetch("/api/stories");
      if (!res.ok) throw new Error(`stories fetch failed: ${res.status}`);
      const body = (await res.json()) as {
        ok: boolean;
        stories: StoryDto[];
        malformed?: MalformedStory[];
      };
      return { stories: body.stories, malformed: body.malformed ?? [] };
    },
    staleTime: 1000,
  });
}

export function useProject() {
  return useQuery({
    queryKey: ["project"],
    queryFn: async (): Promise<ProjectDto> => {
      const res = await fetch("/api/project");
      if (!res.ok) throw new Error(`project fetch failed: ${res.status}`);
      const body = (await res.json()) as { ok: boolean; project: ProjectDto };
      return body.project;
    },
    staleTime: 5000,
  });
}

export type TransitionVerb = "start" | "finish" | "deliver" | "accept" | "reject" | "restart";

export function useTransitionStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      verb: TransitionVerb;
      reason?: string;
      expectedHash?: string;
    }) => {
      const reqBody: Record<string, unknown> = {};
      if (vars.reason !== undefined) reqBody.reason = vars.reason;
      if (vars.expectedHash !== undefined) reqBody.expectedHash = vars.expectedHash;
      const res = await fetch(`/api/stories/${vars.id}/transitions/${vars.verb}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { kind: string; message: string }; story?: StoryDto };
      if (!res.ok || !body.ok) {
        throwApiError(body, res.status, `transition failed: ${res.status}`);
      }
      return body.story!;
    },
    onMutate: async (vars) => {
      // Optimistic: apply state change locally so UI is instant; revert on error.
      // The cache shape is `StoriesResponse` ({stories, malformed}), not bare
      // `StoryDto[]`; map inside the wrapper.
      await qc.cancelQueries({ queryKey: ["stories"] });
      const prev = qc.getQueryData<StoriesResponse>(["stories"]);
      if (prev) {
        const optimistic: StoryDto["state"] | null =
          vars.verb === "start" ? "started"
          : vars.verb === "finish" ? "finished"
          : vars.verb === "deliver" ? "delivered"
          : vars.verb === "accept" ? "accepted"
          : vars.verb === "reject" ? "rejected"
          : vars.verb === "restart" ? "started"
          : null;
        if (optimistic) {
          qc.setQueryData<StoriesResponse>(["stories"], {
            ...prev,
            stories: prev.stories.map((s) =>
              s.id === vars.id ? { ...s, state: optimistic } : s,
            ),
          });
        }
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData<StoriesResponse>(["stories"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
    },
  });
}

/**
 * Edit a story's frontmatter and/or body via PATCH. Pass only the fields
 * being changed. `points: null` and `epic: null` clear those fields.
 */
/**
 * Create a new story via POST /api/stories. Server allocates id + position
 * (appended at end of position-sorted list). On success, invalidates the
 * stories cache so the new story appears in its column.
 */
export type CreateStoryInput = {
  type: StoryDto["type"];
  title: string;
  points?: number;
  body?: string;
};

export function useCreateStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: CreateStoryInput) => {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(vars),
      });
      const body = (await res.json()) as
        | { ok: true; story: StoryDto; path: string; hash: string }
        | { ok?: false; error: { kind: string; message: string } };
      if (!res.ok || !("ok" in body) || body.ok !== true) {
        const errBody = "error" in body ? { error: body.error } : undefined;
        throwApiError(errBody, res.status, `create failed: ${res.status}`);
      }
      return body;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
    },
  });
}

export type StoryPatch = {
  title?: string;
  body?: string;
  points?: number | null;
  type?: StoryDto["type"];
  labels?: string[];
  epic?: string | null;
  icebox?: boolean;
  position?: string;
};

/**
 * Delete a story via DELETE /api/stories/:id with CAS-on-hash. The server
 * broadcasts story-removed, which the SSE invalidator picks up.
 */
export function useDeleteStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; expectedHash?: string }) => {
      const params = vars.expectedHash ? `?expectedHash=${vars.expectedHash}` : "";
      const res = await fetch(`/api/stories/${vars.id}${params}`, { method: "DELETE" });
      if (res.status === 204) return { id: vars.id };
      const body = (await res.json().catch(() => ({}))) as {
        error?: { kind?: string; message?: string };
      };
      throwApiError(body, res.status, `delete failed: ${res.status}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
    },
  });
}

export function useUpdateStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: StoryPatch; expectedHash?: string }) => {
      const res = await fetch(`/api/stories/${vars.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...vars.patch,
          ...(vars.expectedHash !== undefined ? { expectedHash: vars.expectedHash } : {}),
        }),
      });
      const body = (await res.json()) as
        | { ok: true; story: StoryDto; path: string; hash: string }
        | { ok?: false; error: { kind: string; message: string } };
      if (!res.ok || !("ok" in body) || body.ok !== true) {
        const errBody = "error" in body ? { error: body.error } : undefined;
        throwApiError(errBody, res.status, `update failed: ${res.status}`);
      }
      return body;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
    },
  });
}

/**
 * Update a story's Lexorank `position` field. Thin wrapper around the
 * generic PATCH that does an optimistic local re-sort (drag/drop and J/K
 * keyboard reorder both want the immediate visual reflow).
 */
export function useUpdateStoryPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; position: string; expectedHash?: string }) => {
      const res = await fetch(`/api/stories/${vars.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          position: vars.position,
          ...(vars.expectedHash !== undefined ? { expectedHash: vars.expectedHash } : {}),
        }),
      });
      const body = (await res.json()) as
        | { ok: true; story: StoryDto; path: string; hash: string }
        | { ok?: false; error: { kind: string; message: string } };
      if (!res.ok || !("ok" in body) || body.ok !== true) {
        const errBody = "error" in body ? { error: body.error } : undefined;
        throwApiError(errBody, res.status, `position update failed: ${res.status}`);
      }
      return body;
    },
    onMutate: async (vars) => {
      // Cache shape is `StoriesResponse` ({stories, malformed}); update inside
      // the wrapper.
      await qc.cancelQueries({ queryKey: ["stories"] });
      const prev = qc.getQueryData<StoriesResponse>(["stories"]);
      if (prev) {
        const nextStories = prev.stories
          .map((s) => (s.id === vars.id ? { ...s, position: vars.position } : s))
          .sort((a, b) => (a.position < b.position ? -1 : 1));
        qc.setQueryData<StoriesResponse>(["stories"], {
          ...prev,
          stories: nextStories,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData<StoriesResponse>(["stories"], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
    },
  });
}

export type IterationClosedEvent = {
  closed_iteration: number;
  next_iteration: number;
  velocity_actual: number;
  velocity_next: number;
  accepted_ids: string[];
  spilled_count: number;
};

/** Connection state for the SSE stream. */
export type SseStatus = "connecting" | "connected" | "reconnecting" | "watcher-restarted";

/**
 * Subscribe to /api/events and invalidate react-query caches on any event.
 * Per plan: full cache invalidation on every event keeps server stateless and
 * client correctness total. EventSource handles auto-reconnect natively.
 *
 * Status reporting (per DESIGN.md state matrix):
 *   - "connecting" until first open
 *   - "connected" while the stream is healthy
 *   - "reconnecting" the moment we detect an error / drop; cleared when the
 *     stream reopens (which auto-fires `open` again). The status bar uses
 *     this to render the yellow/red "watcher disconnected" indicator.
 *
 * `onIterationClosed` fires for the named 400ms iteration-close motion
 * exception — App.tsx uses it to flip a data attribute so the board animates
 * the close ritual. The cache is invalidated as part of this same event.
 */
export function useSseInvalidator(opts: {
  onIterationClosed?: (event: IterationClosedEvent) => void;
} = {}): SseStatus {
  const qc = useQueryClient();
  const { onIterationClosed } = opts;
  const [status, setStatus] = useState<SseStatus>("connecting");
  useEffect(() => {
    const es = new EventSource("/api/events");
    const handleAny = () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
      qc.invalidateQueries({ queryKey: ["project"] });
    };
    const handleProjectChanged = () => {
      qc.invalidateQueries({ queryKey: ["project"] });
    };
    const handleIterationClosed = (e: MessageEvent) => {
      handleAny();
      try {
        const parsed = JSON.parse(e.data) as IterationClosedEvent;
        onIterationClosed?.(parsed);
      } catch {
        /* malformed event payload — invalidation already happened */
      }
    };
    const handleOpen = () => {
      setStatus("connected");
      // Re-invalidate on every (re)connect so the client picks up anything
      // it missed during the disconnect window. Per plan's reconnect rule.
      handleAny();
    };
    const handleError = () => {
      // EventSource auto-reconnects natively (default 3s backoff). We only
      // signal status; the browser handles the reconnect itself.
      setStatus((prev) => (prev === "connected" ? "reconnecting" : prev));
    };
    const handleWatcherRestarted = () => {
      // Watcher died and was restarted by the server. Refetch everything;
      // events fired during the dead window may have been missed.
      setStatus("watcher-restarted");
      handleAny();
      // Clear the indicator after a short visible window so the user sees the
      // restart happened, then return to "connected" steady state.
      setTimeout(() => setStatus("connected"), 2_000);
    };
    es.addEventListener("open", handleOpen);
    es.addEventListener("error", handleError);
    es.addEventListener("stories-changed", handleAny);
    es.addEventListener("story-transitioned", handleAny);
    es.addEventListener("story-removed", handleAny);
    es.addEventListener("project-changed", handleProjectChanged);
    es.addEventListener("iteration-closed", handleIterationClosed);
    es.addEventListener("watcher-restarted", handleWatcherRestarted);
    return () => {
      es.close();
    };
  }, [qc, onIterationClosed]);
  return status;
}

export function useCloseIteration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { acceptedIds: string[] }): Promise<IterationClosedEvent> => {
      const res = await fetch("/api/iteration/close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acceptedIds: vars.acceptedIds }),
      });
      const body = (await res.json()) as
        | (IterationClosedEvent & { ok: true })
        | { ok?: false; error: { kind: string; message: string } };
      if (!res.ok || !("ok" in body) || body.ok !== true) {
        const errBody = "error" in body ? { error: body.error } : undefined;
        throwApiError(errBody, res.status, `close iteration failed: ${res.status}`);
      }
      return body;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}
