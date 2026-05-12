import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { StoryDto, TransitionVerb } from "../api.ts";

const TYPE_ICONS: Record<StoryDto["type"], string> = {
  feature: "★",
  bug: "●",
  chore: "⚙",
  release: "▼",
};

/**
 * PT-style inline action buttons. For each state, the row exposes the next
 * forward action (Start / Finish / Deliver / Accept) and, where applicable,
 * a Reject. This is what makes the board feel like classic PT — verb is on
 * the row, click commits, no popovers.
 */
const STATE_ACTIONS: Record<
  StoryDto["state"],
  { verb: TransitionVerb; label: string; kind: string }[]
> = {
  unstarted: [{ verb: "start", label: "Start", kind: "start" }],
  started: [{ verb: "finish", label: "Finish", kind: "finish" }],
  finished: [
    { verb: "deliver", label: "Deliver", kind: "deliver" },
  ],
  delivered: [
    { verb: "accept", label: "Accept", kind: "accept" },
    { verb: "reject", label: "Reject", kind: "reject" },
  ],
  accepted: [],
  rejected: [{ verb: "restart", label: "Restart", kind: "restart" }],
};

export function StoryRow({
  story,
  isFocused,
  isExpanded = false,
  onClick,
  onTransition,
  readOnly = false,
}: {
  story: StoryDto;
  isFocused: boolean;
  /** True when this row is currently expanded (its body is showing below). */
  isExpanded?: boolean;
  onClick: () => void;
  /**
   * Fire a state transition. Optional — when absent, the row hides its
   * inline action buttons (used by the empty-state preview).
   */
  onTransition?: (verb: TransitionVerb, reason?: string) => void;
  readOnly?: boolean;
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

  useEffect(() => {
    if (isFocused && ref.current && !isDragging) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [isFocused, isDragging]);

  useEffect(() => {
    if (wasExpandedRef.current && !isExpanded && isFocused && ref.current) {
      ref.current.focus({ preventScroll: true });
    }
    wasExpandedRef.current = isExpanded;
  }, [isExpanded, isFocused]);

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.55 : undefined,
  };

  const ariaLabel = [
    capitalize(story.type),
    story.title,
    story.points !== undefined ? `${story.points} point${story.points === 1 ? "" : "s"}` : null,
    story.state,
  ]
    .filter(Boolean)
    .join(", ");

  const actions = STATE_ACTIONS[story.state] ?? [];

  const handleAction = (verb: TransitionVerb, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onTransition) return;
    if (verb === "reject") {
      const reason = window.prompt("Reject reason:");
      if (reason && reason.trim().length > 0) onTransition("reject", reason.trim());
      return;
    }
    onTransition(verb);
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
      role="button"
      aria-label={ariaLabel}
      aria-pressed={isExpanded}
      tabIndex={-1}
    >
      <div className="story-top">
        <span className={`icon icon-${story.type}`} aria-hidden="true">
          {icon}
        </span>
        <span className="title">{story.title}</span>
        {story.points !== undefined ? (
          <span className="pts" aria-hidden="true">
            [{story.points}]
          </span>
        ) : null}
        {!readOnly && actions.length > 0 && onTransition ? (
          <div className="story-actions" onClick={(e) => e.stopPropagation()}>
            {actions.map((a) => (
              <button
                key={a.verb}
                type="button"
                className={`row-btn row-btn-${a.kind}`}
                onClick={(e) => handleAction(a.verb, e)}
                aria-label={`${a.label} story`}
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : (
          <StatePill state={story.state} />
        )}
      </div>
      {story.labels.length > 0 && (
        <div className="story-tags" aria-hidden="true">
          {story.labels.map((label) => (
            <span key={label} className="story-tag">
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function StatePill({ state }: { state: StoryDto["state"] }) {
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
