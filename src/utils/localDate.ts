/**
 * Calendar date (YYYY-MM-DD) in the user's own timezone.
 *
 * `toISOString()` is UTC: a clinic on the US West Coast charting after
 * ~4–5 pm would get tomorrow's date. Charts, recheck due dates and
 * "today" comparisons must use the local calendar day.
 */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as a LOCAL date (new Date('2026-11-11') is UTC midnight,
 *  which is the previous evening west of Greenwich). */
export function parseLocalDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
