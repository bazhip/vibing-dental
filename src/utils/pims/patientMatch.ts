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

const words = (s: string): string[] => normaliseName(s).split(' ').filter(Boolean);

/** Titles dropped from the front of an owner name before its surname is taken. */
const OWNER_TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'sir', 'dame', 'mme', 'mlle', 'm', 'herr', 'frau', 'sig', 'sra', 'sr', 'srta']);

/** The owner's surname as words: the part before the comma in "Smith, Jane", else the last word
 *  ("Mrs Jane Smith" gives "smith"). Empty when there is no owner name. */
export function ownerSurname(ownerName: string | null | undefined): string[] {
  if (!ownerName) return [];
  const comma = ownerName.indexOf(',');
  const part = withoutTitles(words(comma >= 0 ? ownerName.slice(0, comma) : ownerName));
  if (comma >= 0) return part;
  return part.length ? [part[part.length - 1]] : [];
}

function withoutTitles(w: string[]): string[] {
  const out = [...w];
  while (out.length > 1 && OWNER_TITLES.has(out[0])) out.shift();
  return out;
}

const sameWords = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

/**
 * The side panel's stricter check (it proposes a chart itself, so a loose match could suggest the
 * wrong patient): the names are equal once normalised, or the chart's patient name plus the owner's
 * surname has exactly the ezyVet name's words ("Bella" + owner "Jane Smith" = "Bella Smith" or
 * "Smith, Bella"). "Bella" alone does not match "Bella Jones".
 */
export function patientsMatchStrict(chartName: string, ownerName: string | null | undefined, ezyvetName: string | null): boolean {
  if (!ezyvetName) return false;
  const chart = words(chartName);
  const ezyvet = words(ezyvetName);
  if (!chart.length || !ezyvet.length) return false;
  if (chart.join(' ') === ezyvet.join(' ')) return true;
  const surname = ownerSurname(ownerName);
  return surname.length > 0 && sameWords([...chart, ...surname], ezyvet);
}

/** A patient number as compared: trimmed, case-folded, and leading zeros dropped from an all-digit
 *  value ("00123" is "123"; "000" is "0"). Empty when there is no number. */
function normaliseNumber(n: string | null | undefined): string {
  const s = (n ?? '').trim().toLowerCase();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, '') : s;
}

/** Are these the same patient number? `null` when either is empty: an empty number never matches,
 *  and never rules a patient out either. */
export function samePatientNumber(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const x = normaliseNumber(a);
  const y = normaliseNumber(b);
  if (!x || !y) return null;
  return x === y;
}

/**
 * Patient numbers are not provider-scoped in stored charts. Different numbers reject a match;
 * equal or missing numbers still require the supplied name rule.
 */
export function pimsPatientMatch(
  chart: { name: string; number: string },
  ezyvet: { name: string | null; number: string | null },
  nameRule: (chartName: string, ezyvetName: string | null) => boolean,
): 'same' | 'different' {
  const byNumber = samePatientNumber(chart.number, ezyvet.number);
  if (byNumber === false) return 'different';
  return nameRule(chart.name, ezyvet.name) ? 'same' : 'different';
}
