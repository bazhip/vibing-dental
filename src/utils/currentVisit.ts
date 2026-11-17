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

/** Exclude the previous animal's asynchronously loaded visits immediately. */
export function visitsForPatient<T extends { patient_number: string; patient_name: string; patient_id?: string }>(
  visits: readonly T[], number: string, name: string, patientId?: string,
): T[] {
  const normalize = (value: string) => (value ?? '').trim().toLowerCase();
  const key = (n: string, nm: string) => normalize(n) ? `n:${normalize(n)}` : `p:${normalize(nm)}`;
  return visits.filter(visit => patientId ? visit.patient_id === patientId : !visit.patient_id && key(visit.patient_number, visit.patient_name) === key(number, name));
}
