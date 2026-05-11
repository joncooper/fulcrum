import { useEffect, useRef } from "react";

/**
 * Keyboard cheatsheet. Opens via `?`, closes via Esc or any click outside.
 * Renders inline over the board (not a centered floating modal — DESIGN.md
 * forbids modal/toast chrome in M1; this is a full-pane overlay like the
 * iteration-close panel).
 */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?" || e.key === "/") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="help-overlay"
      tabIndex={-1}
      role="dialog"
      aria-label="Keyboard shortcuts"
    >
      <div className="help-header">
        <span className="help-title">Keyboard shortcuts</span>
        <span className="help-hint">esc / ? to close</span>
      </div>
      <div className="help-body">
        <Section title="Navigate">
          <Row k="j / k" v="focus next / previous story" />
          <Row k="↑ / ↓" v="same as k / j" />
          <Row k="h / l" v="move focus between columns" />
          <Row k="g g" v="jump to top of focused column" />
          <Row k="G" v="jump to bottom of focused column" />
          <Row k="space" v="expand / collapse focused story" />
          <Row k="esc" v="collapse / cancel" />
          <Row k="/" v="search the board" />
        </Section>
        <Section title="Create + edit">
          <Row k="c" v="new story (form opens at top of Current)" />
          <Row k="e" v="edit focused story inline" />
          <Row k="⌘↵" v="save edit / create" />
          <Row k="J / K" v="move focused story down / up within its column" />
          <Row k="I" v="toggle icebox on focused story (capital)" />
          <Row k="D" v="delete focused story (capital — intentional friction)" />
        </Section>
        <Section title="State transitions">
          <Row k="s" v="start (unstarted → started)" />
          <Row k="f" v="finish (auto-chains forward)" />
          <Row k="d" v="deliver (auto-chains forward)" />
          <Row k="a" v="accept (delivered → accepted)" />
          <Row k="r" v="reject (prompts for reason)" />
        </Section>
        <Section title="Iteration">
          <Row k="i" v="open iteration close panel" />
        </Section>
        <Section title="Help">
          <Row k="?" v="this overlay" />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="help-section">
      <div className="help-section-header">{title}</div>
      <div className="help-rows">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="help-row">
      <kbd className="help-key">{k}</kbd>
      <span className="help-desc">{v}</span>
    </div>
  );
}
