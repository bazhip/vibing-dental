/** Case-folded, accents removed, punctuation and runs of whitespace turned into single spaces. */
export function normaliseName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Does the patient open in the PIMS look like the chart's patient? Every word of the shorter
 *  name must be a whole word of the longer one ("Bella" ~ "Bella Smith", but not "Max" ~ "Maxine"). */
export function patientsMatch(chartName: string, ezyvetName: string | null): boolean {
  if (!ezyvetName) return false;
  const a = normaliseName(chartName).split(' ').filter(Boolean);
  const b = normaliseName(ezyvetName).split(' ').filter(Boolean);
  if (!a.length || !b.length) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const words = new Set(longer);
  return shorter.every((w) => words.has(w));
}
