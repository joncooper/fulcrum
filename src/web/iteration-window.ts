/**
 * Compute the iteration date window from project metadata.
 *
 *   start = iteration_start_date
 *   end   = start + iteration_length_days - 1
 *
 * Returns ISO YYYY-MM-DD strings. Done in UTC so the same project.yml renders
 * the same window everywhere (no DST or timezone drift).
 */
export function iterationWindow(project: {
  iteration_start_date: string;
  iteration_length_days: number;
}): { start: string; end: string } {
  const start = project.iteration_start_date;
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + project.iteration_length_days - 1);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format an ISO date as "MMM D" (e.g. "May 8"). */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return `${MONTHS[month - 1]} ${day}`;
}
