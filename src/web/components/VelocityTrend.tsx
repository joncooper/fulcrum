import type { IterationRecordDto } from "../api.ts";

/**
 * Compact velocity sparkline. PT's load-bearing CD2 (Accomplishment) signal
 * per the gamification analysis: users want to see their trend over time,
 * not just the current rolling number.
 *
 * Renders the last N iteration_history entries as vertical bars sized
 * proportionally to the max velocity in the window. Each bar is annotated
 * with its iteration number on hover. The current rolling velocity (the
 * scalar number) renders to the right via the existing header markup.
 *
 * Empty history → renders nothing (the header's "velocity N pts" stat
 * still tells the user where they stand).
 */
export function VelocityTrend({
  history,
  maxBars = 8,
}: {
  history: readonly IterationRecordDto[];
  maxBars?: number;
}) {
  if (history.length === 0) return null;
  const recent = history.slice(-maxBars);
  const max = Math.max(1, ...recent.map((r) => r.velocity));
  return (
    <span
      className="velocity-trend"
      role="img"
      aria-label={`Velocity over last ${recent.length} iterations: ${recent
        .map((r) => `${r.velocity} pts`)
        .join(", ")}`}
      title={recent.map((r) => `iter ${r.number}: ${r.velocity} pts`).join("\n")}
    >
      {recent.map((r) => {
        const heightPct = Math.round((r.velocity / max) * 100);
        return (
          <span
            key={r.number}
            className="velocity-trend-bar"
            style={{ height: `${Math.max(4, heightPct)}%` }}
            aria-hidden
          />
        );
      })}
    </span>
  );
}
