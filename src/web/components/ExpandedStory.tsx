import { useEffect, useRef } from "react";
import type { StoryDto, TransitionVerb } from "../api.ts";

const ACTIONS: { verb: TransitionVerb; label: string; valid: (state: StoryDto["state"]) => boolean }[] = [
  { verb: "start", label: "Start", valid: (s) => s === "unstarted" },
  { verb: "finish", label: "Finish", valid: (s) => s !== "finished" && s !== "delivered" && s !== "accepted" && s !== "rejected" },
  { verb: "deliver", label: "Deliver", valid: (s) => s !== "delivered" && s !== "accepted" && s !== "rejected" },
  { verb: "accept", label: "Accept", valid: (s) => s === "delivered" },
  { verb: "reject", label: "Reject", valid: (s) => s === "started" || s === "finished" || s === "delivered" },
  { verb: "restart", label: "Restart", valid: (s) => s === "rejected" },
];

export function ExpandedStory({
  story,
  onTransition,
}: {
  story: StoryDto;
  onTransition: (verb: TransitionVerb, reason?: string) => void;
}) {
  // Focus management rule #5: after `space` (expand), focus the first action
  // button in the expanded body. This means subsequent Tab navigation flows
  // through the action set instead of jumping out of the story.
  const firstActionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstActionRef.current?.focus();
  }, [story.id]);

  const validActions = ACTIONS.filter((a) => a.valid(story.state));

  return (
    <div className="expanded">
      <div className="expanded-meta">
        <span className="meta-key">id</span>
        <span className="meta-val">{story.id}</span>
        {story.points !== undefined && (
          <>
            <span className="meta-key">points</span>
            <span className="meta-val">{story.points}</span>
          </>
        )}
        {story.epic && (
          <>
            <span className="meta-key">epic</span>
            <span className="meta-val">{story.epic}</span>
          </>
        )}
        {story.accepted_at !== undefined && (
          <>
            <span className="meta-key">accepted</span>
            <span className="meta-val">{story.accepted_at}</span>
          </>
        )}
        {story.iteration !== undefined && (
          <>
            <span className="meta-key">iteration</span>
            <span className="meta-val">{story.iteration}</span>
          </>
        )}
        <span className="meta-key">position</span>
        <span className="meta-val">{story.position}</span>
        <span className="meta-key">created</span>
        <span className="meta-val">{story.created}</span>
        {story.reject_reason && (
          <>
            <span className="meta-key">rejected</span>
            <span className="meta-val">{story.reject_reason}</span>
          </>
        )}
      </div>
      <pre className="expanded-body">{story.body}</pre>
      <div className="expanded-actions">
        {validActions.map((a, idx) => (
          <button
            key={a.verb}
            ref={idx === 0 ? firstActionRef : undefined}
            className="action-btn"
            onClick={() => {
              if (a.verb === "reject") {
                const reason = window.prompt("Reject reason:");
                if (reason && reason.trim().length > 0) onTransition("reject", reason.trim());
              } else {
                onTransition(a.verb);
              }
            }}
          >
            {a.label}
          </button>
        ))}
        <span className="expanded-hint">esc to collapse · s/f/d/a/r keys also work</span>
      </div>
    </div>
  );
}
