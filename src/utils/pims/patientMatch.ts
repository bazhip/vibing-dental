const normalise = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Does the patient open in the PIMS look like the chart's patient? */
export function patientsMatch(chartName: string, ezyvetName: string | null): boolean {
  if (!ezyvetName) return false;
  const a = normalise(chartName);
  const b = normalise(ezyvetName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}
