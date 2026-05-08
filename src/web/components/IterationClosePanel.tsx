import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectDto, StoryDto } from "../api.ts";

const TYPE_ICONS: Record<StoryDto["type"], string> = {
  feature: "★",
  bug: "●",
  chore: "⚙",
  release: "▼",
};

/**
 * Iteration close ritual — Journey C in the design plan.
 *
 * Layout:
 *   header       "Close Iteration N"  / "X stories ready · Y will spill"
 *   accepted     scrollable list, [a] toggle per row
 *   unaccepted   scrollable list, will-spill annotation
 *   footer       live tally; press enter to commit
 *
 * Keyboard:
 *   j/k         navigate rows in focused list
 *   space       toggle current row's accept state
 *   a           bulk-accept all delivered
 *   o           expand / collapse focused row's body in place
 *   R           reject focused row with a reason (capital — intentional friction)
 *   enter       commit (writes via POST /api/iteration/close)
 *   esc         cancel (close panel)
 *
 * Modal-but-not-modal: the panel takes over the board area instead of
 * floating. DESIGN.md bans modals; this is the principled close-ritual surface,
 * not a generic dialog.
 */
export function IterationClosePanel({
  stories,
  project,
  onCommit,
  onCancel,
  onReject,
  isCommitting,
}: {
  stories: StoryDto[];
  project: ProjectDto;
  onCommit: (acceptedIds: string[]) => void;
  onCancel: () => void;
  /** Reject the focused story with a reason. Story leaves the deliverable list. */
  onReject: (id: string, reason: string) => void;
  isCommitting: boolean;
}) {
  // Stories the panel offers: in-projection, delivered (ready to accept).
  // Stories that are started/finished spill automatically without UI action,
  // and are listed read-only in the spill section.
  const { deliverable, willSpill } = useMemo(() => {
    const deliverable: StoryDto[] = [];
    const willSpill: StoryDto[] = [];
    for (const s of stories) {
      if (s.icebox) continue;
      if (s.iteration !== undefined) continue;
      if (s.state === "delivered") deliverable.push(s);
      else if (s.state === "started" || s.state === "finished") willSpill.push(s);
    }
    return { deliverable, willSpill };
  }, [stories]);

  // Default: accept all deliverable. User can toggle off any row before commit.
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(deliverable.map((s) => s.id)));
  const [focusIdx, setFocusIdx] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Recompute accepted set when deliverable list changes (e.g. another tab transitioned a story).
  useEffect(() => {
    setAccepted((prev) => {
      const next = new Set<string>();
      for (const s of deliverable) {
        if (prev.has(s.id) || prev.size === 0) next.add(s.id);
      }
      // If this is the first computation (prev empty), accept everything.
      if (prev.size === 0) {
        for (const s of deliverable) next.add(s.id);
      }
      return next;
    });
  }, [deliverable]);

  const acceptedPoints = useMemo(() => {
    let pts = 0;
    for (const s of deliverable) {
      if (accepted.has(s.id)) pts += s.points ?? 0;
    }
    return pts;
  }, [deliverable, accepted]);

  const acceptedCount = useMemo(
    () => deliverable.filter((s) => accepted.has(s.id)).length,
    [deliverable, accepted],
  );

  const toggle = useCallback((id: string) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const bulkAccept = useCallback(() => {
    setAccepted(new Set(deliverable.map((s) => s.id)));
  }, [deliverable]);

  const commit = useCallback(() => {
    if (isCommitting) return;
    onCommit(deliverable.filter((s) => accepted.has(s.id)).map((s) => s.id));
  }, [accepted, deliverable, isCommitting, onCommit]);

  // Capture key events at the panel level (App.tsx's global handler is paused
  // while panel is open).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        return;
      }
      if (e.key === "a") {
        e.preventDefault();
        bulkAccept();
        return;
      }
      if (deliverable.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, deliverable.length - 1));
        return;
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        const target = deliverable[focusIdx];
        if (target) toggle(target.id);
        return;
      }
      if (e.key === "o") {
        e.preventDefault();
        const target = deliverable[focusIdx];
        if (target) setExpandedId((prev) => (prev === target.id ? null : target.id));
        return;
      }
      // Capital-R: reject focused story with a required reason. Capital so
      // accidental keystrokes don't punt validated work.
      if (e.key === "R") {
        e.preventDefault();
        const target = deliverable[focusIdx];
        if (!target) return;
        const reason = window.prompt(
          `Reject "${target.title}"?\nProvide a reason (required):`,
        );
        if (reason && reason.trim().length > 0) {
          onReject(target.id, reason.trim());
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bulkAccept, commit, deliverable, focusIdx, onCancel, onReject, toggle]);

  // Focus the panel container so global tab-state is sane and keystrokes feel
  // anchored to the panel.
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const closingIteration = project.current_iteration;
  const noWork = deliverable.length === 0 && willSpill.length === 0;

  return (
    <div
      className="iter-close-panel"
      role="dialog"
      aria-label={`Close iteration ${closingIteration}`}
      tabIndex={-1}
      ref={containerRef}
    >
      <div className="iter-close-header">
        <span className="iter-close-title">Close Iteration {closingIteration}</span>
        <span className="iter-close-summary">
          {deliverable.length} ready
          {willSpill.length > 0 ? ` · ${willSpill.length} will spill` : ""}
        </span>
      </div>

      {noWork ? (
        <div className="iter-close-empty">
          Nothing to close — no delivered stories and no in-flight work in this iteration.
          <br />
          <span className="hint">Press enter anyway to advance to iteration {closingIteration + 1}.</span>
        </div>
      ) : (
        <>
          <div className="iter-close-section">
            <div className="iter-close-section-header">Ready to accept</div>
            {deliverable.length === 0 ? (
              <div className="iter-close-section-empty">No delivered stories.</div>
            ) : (
              <ul className="iter-close-list" role="list">
                {deliverable.map((s, idx) => (
                  <li
                    key={s.id}
                    className={`iter-close-row${idx === focusIdx ? " is-focused" : ""}${
                      accepted.has(s.id) ? " is-accepted" : ""
                    }`}
                  >
                    <div
                      className="iter-close-row-line"
                      onClick={() => {
                        setFocusIdx(idx);
                        toggle(s.id);
                      }}
                    >
                      <span className="iter-close-check" aria-hidden>
                        {accepted.has(s.id) ? "✓" : " "}
                      </span>
                      <span className={`icon icon-${s.type}`}>{TYPE_ICONS[s.type]}</span>
                      <span className="title">{s.title}</span>
                      {s.points !== undefined ? (
                        <span className="pts">[{s.points}]</span>
                      ) : (
                        <span className="pts" />
                      )}
                    </div>
                    {expandedId === s.id && (
                      <pre className="iter-close-body">{s.body}</pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {willSpill.length > 0 && (
            <div className="iter-close-section">
              <div className="iter-close-section-header">Spilling to iteration {closingIteration + 1}</div>
              <ul className="iter-close-list iter-close-spill-list" role="list">
                {willSpill.map((s) => (
                  <li key={s.id} className="iter-close-row is-spill">
                    <div className="iter-close-row-line">
                      <span className="iter-close-check" aria-hidden>
                        —
                      </span>
                      <span className={`icon icon-${s.type}`}>{TYPE_ICONS[s.type]}</span>
                      <span className="title">{s.title}</span>
                      <span className={`pill pill-${s.state}`}>{s.state}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="iter-close-footer">
        <span className="iter-close-tally">
          velocity_actual: <strong>{acceptedPoints} pts</strong>
          {" · "}
          <strong>{acceptedCount}</strong> {acceptedCount === 1 ? "story" : "stories"}
          {willSpill.length > 0 ? ` · ${willSpill.length} spilling` : ""}
        </span>
        <span className="iter-close-keys">
          <kbd>space</kbd> toggle · <kbd>a</kbd> all · <kbd>o</kbd> view · <kbd>R</kbd> reject ·
          {" "}<kbd>enter</kbd> commit · <kbd>esc</kbd> cancel
        </span>
        <button
          type="button"
          className="iter-close-commit"
          onClick={commit}
          disabled={isCommitting}
        >
          {isCommitting ? "closing…" : `Close iteration ${closingIteration}`}
        </button>
      </div>
    </div>
  );
}
