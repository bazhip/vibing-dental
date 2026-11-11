/**
 * The visit being worked on today isn't a "saved visit" to protect: the
 * patient's latest visit, dated today, opens editable. Older visits (and a
 * patient's latest one from a past day) open view-only.
 *
 * `visits` is the patient's visits newest first (by visit date, then last
 * edit). While it hasn't loaded yet (empty), the date alone decides.
 */
export function isCurrentVisit(
  chartDate: string,
  today: string,
  visits: ReadonlyArray<{ id: string }>,
  chartId: string,
): boolean {
  return chartDate === today && (visits.length === 0 || visits[0].id === chartId);
}
