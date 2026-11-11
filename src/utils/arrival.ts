/**
 * Opening plain toothops.app (no #/ route — not a reload of a chart): the
 * last chart on this device reopens only when it's still in progress.
 * Otherwise My charts opens, so a new day doesn't start on yesterday's
 * patient.
 *
 * Reopen when the chart has unsaved changes on this device (never strand
 * them), or it's a named patient's visit dated today. A blank chart has
 * nothing to continue, so it goes to My charts too.
 */
export function shouldOpenLibraryOnArrival(c: {
  /** The page was opened without a #/ route. */
  bareArrival: boolean;
  chartDate: string;
  today: string;
  patientName: string;
  dirty: boolean;
}): boolean {
  if (!c.bareArrival || c.dirty) return false;
  const todaysVisit = c.chartDate === c.today && c.patientName.trim() !== '';
  return !todaysVisit;
}
