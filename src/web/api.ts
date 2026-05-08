import { useQuery } from "@tanstack/react-query";

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
