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
  isExpanded = false,
  onClick,
}: {
  story: StoryDto;
  isFocused: boolean;
  /** True when this row is currently expanded (its body is showing below). */
  isExpanded?: boolean;
  onClick: () => void;
}) {
  const icon = TYPE_ICONS[story.type];
  const ref = useRef<HTMLDivElement | null>(null);
  const wasExpandedRef = useRef(isExpanded);
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

  // Focus management rule #6: after `esc` (collapse), focus returns to the
  // row that was just collapsed. Detect the expanded → not-expanded transition
  // and call focus() on the row's DOM node. tabIndex=-1 on the div makes the
  // row programmatically focusable without changing tab order.
  useEffect(() => {
    if (wasExpandedRef.current && !isExpanded && isFocused && ref.current) {
      ref.current.focus({ preventScroll: true });
    }
    wasExpandedRef.current = isExpanded;
  }, [isExpanded, isFocused]);

  // 0ms drag motion per DESIGN.md — apply transform without easing.
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.55 : undefined,
  };

  // Screen-reader label (per DESIGN.md L297):
  //   "Feature, <title>, 3 points, started"
  // Order matches the row's visual scan: type → title → points → state.
  const ariaLabel = [
    capitalize(story.type),
    story.title,
    story.points !== undefined ? `${story.points} point${story.points === 1 ? "" : "s"}` : null,
    story.state,
  ]
    .filter(Boolean)
    .join(", ");

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
      role="button"
      aria-label={ariaLabel}
      aria-pressed={isExpanded}
      tabIndex={-1}
    >
      <span className={`icon icon-${story.type}`} aria-hidden="true">
        {icon}
      </span>
      <span className="title">{story.title}</span>
      {story.points !== undefined ? (
        <span className="pts" aria-hidden="true">
          [{story.points}]
        </span>
      ) : (
        <span className="pts" aria-hidden="true" />
      )}
      <StatePill state={story.state} />
    </div>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function StatePill({ state }: { state: StoryDto["state"] }) {
  // State is also part of the row's aria-label; mark the pill aria-hidden so
  // screen-readers don't double-announce it.
  if (state === "unstarted") {
    return (
      <span className="pill pill-unstarted" aria-hidden="true">
        unstarted
      </span>
    );
  }
  return (
    <span className={`pill pill-${state}`} aria-hidden="true">
      {state}
    </span>
  );
}
