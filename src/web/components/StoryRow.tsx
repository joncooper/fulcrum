import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  const ref = useRef<HTMLDivElement | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({ id: story.id });

  // Scroll focused row into view when it changes (keyboard-driven nav stays visible).
  useEffect(() => {
    if (isFocused && ref.current && !isDragging) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [isFocused, isDragging]);

  // 0ms drag motion per DESIGN.md — apply transform without easing.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.55 : undefined,
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        ref.current = node;
      }}
      style={style}
      className={`story${isFocused ? " is-focused" : ""}${isDragging ? " is-dragging" : ""}${
        story.state === "accepted" ? " is-accepted" : ""
      }`}
      title={story.id}
      onClick={onClick}
      {...attributes}
      {...listeners}
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
