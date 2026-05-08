import { useEffect } from "react";
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
  iteration?: number;
  created: string;
  reject_reason?: string;
  title: string;
  body: string;
  path: string;
  hash: string;
};

export type ProjectDto = {
  version: number;
  name: string;
  velocity: number;
  current_iteration: number;
  settings: { estimate_scale: number[] };
};

export function useStories() {
  return useQuery({
    queryKey: ["stories"],
    queryFn: async (): Promise<StoryDto[]> => {
      const res = await fetch("/api/stories");
      if (!res.ok) throw new Error(`stories fetch failed: ${res.status}`);
      const body = (await res.json()) as { ok: boolean; stories: StoryDto[] };
      return body.stories;
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
    mutationFn: async (vars: { id: string; verb: TransitionVerb; reason?: string }) => {
      const res = await fetch(`/api/stories/${vars.id}/transitions/${vars.verb}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(vars.reason !== undefined ? { reason: vars.reason } : {}),
      });
      const body = (await res.json()) as { ok?: boolean; error?: { kind: string; message: string }; story?: StoryDto };
      if (!res.ok || !body.ok) {
        throw new Error(body.error?.message ?? `transition failed: ${res.status}`);
      }
      return body.story!;
    },
    onMutate: async (vars) => {
      // Optimistic: apply state change locally so UI is instant; revert on error.
      await qc.cancelQueries({ queryKey: ["stories"] });
      const prev = qc.getQueryData<StoryDto[]>(["stories"]);
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
          qc.setQueryData<StoryDto[]>(
            ["stories"],
            prev.map((s) => (s.id === vars.id ? { ...s, state: optimistic } : s)),
          );
        }
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["stories"], ctx.prev);
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
export type StoryPatch = {
  title?: string;
  body?: string;
  points?: number | null;
  type?: StoryDto["type"];
  labels?: string[];
  epic?: string | null;
  icebox?: boolean;
};

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
        const e = "error" in body ? body.error : null;
        throw new Error(e?.message ?? `update failed: ${res.status}`);
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
        const e = "error" in body ? body.error : null;
        throw new Error(e?.message ?? `position update failed: ${res.status}`);
      }
      return body;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["stories"] });
      const prev = qc.getQueryData<StoryDto[]>(["stories"]);
      if (prev) {
        const next = prev
          .map((s) => (s.id === vars.id ? { ...s, position: vars.position } : s))
          .sort((a, b) => (a.position < b.position ? -1 : 1));
        qc.setQueryData<StoryDto[]>(["stories"], next);
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["stories"], ctx.prev);
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

/**
 * Subscribe to /api/events and invalidate react-query caches on any event.
 * Per plan: full cache invalidation on every event keeps server stateless and
 * client correctness total. EventSource handles auto-reconnect natively.
 *
 * `onIterationClosed` fires for the named 400ms iteration-close motion
 * exception — App.tsx uses it to flip a data attribute so the board animates
 * the close ritual. The cache is invalidated as part of this same event.
 */
export function useSseInvalidator(opts: {
  onIterationClosed?: (event: IterationClosedEvent) => void;
} = {}) {
  const qc = useQueryClient();
  const { onIterationClosed } = opts;
  useEffect(() => {
    const es = new EventSource("/api/events");
    const handleAny = () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
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
    es.addEventListener("stories-changed", handleAny);
    es.addEventListener("story-transitioned", handleAny);
    es.addEventListener("story-removed", handleAny);
    es.addEventListener("iteration-closed", handleIterationClosed);
    return () => {
      es.close();
    };
  }, [qc, onIterationClosed]);
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
        const err = "error" in body ? body.error : null;
        throw new Error(err?.message ?? `close iteration failed: ${res.status}`);
      }
      return body;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}
