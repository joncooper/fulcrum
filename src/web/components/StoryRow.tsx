import { useEffect, useRef } from "react";
import type { StoryDto } from "../api.ts";

const TYPE_ICONS: Record<StoryDto["type"], string> = {
  feature: "★",
  bug: "●",
  chore: "⚙",
  release: "▼",
};

export function StoryRow({
  story,
  isFocused,
  onClick,
}: {
  story: StoryDto;
  isFocused: boolean;
  onClick: () => void;
}) {
  const icon = TYPE_ICONS[story.type];
  const ref = useRef<HTMLDivElement>(null);

  // Scroll focused row into view when it changes (keyboard-driven nav stays visible).
  useEffect(() => {
    if (isFocused && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [isFocused]);

  return (
    <div
      ref={ref}
      className={`story${isFocused ? " is-focused" : ""}`}
      title={story.id}
      onClick={onClick}
    >
      <span className={`icon icon-${story.type}`}>{icon}</span>
      <span className="title">{story.title}</span>
      {story.points !== undefined ? (
        <span className="pts">[{story.points}]</span>
      ) : (
        <span className="pts" />
      )}
      <StatePill state={story.state} />
    </div>
  );
}

function StatePill({ state }: { state: StoryDto["state"] }) {
  if (state === "unstarted") {
    return <span className="pill pill-unstarted">unstarted</span>;
  }
  return <span className={`pill pill-${state}`}>{state}</span>;
}
