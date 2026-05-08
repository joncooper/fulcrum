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
 * Subscribe to /api/events and invalidate react-query caches on any event.
 * Per plan: full cache invalidation on every event keeps server stateless and
 * client correctness total. EventSource handles auto-reconnect natively.
 */
export function useSseInvalidator() {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource("/api/events");
    const handleAny = () => {
      qc.invalidateQueries({ queryKey: ["stories"] });
      qc.invalidateQueries({ queryKey: ["project"] });
    };
    es.addEventListener("stories-changed", handleAny);
    es.addEventListener("story-transitioned", handleAny);
    es.addEventListener("story-removed", handleAny);
    return () => {
      es.close();
    };
  }, [qc]);
}
