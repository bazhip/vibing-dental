import { Species } from '../types';

/**
 * Pocket depths per root.
 *
 * The grid's `pocket` value stays a plain string so every existing reader
 * (PDF table, diagram notes, dictation, old charts) keeps working. Per-root
 * depths are stored in that string as labelled tokens in root order:
 * "M4 D6", "MB4 MP5 D6". A plain value ("5", "4 5 4") is the one-per-tooth
 * form and is left exactly as typed.
 *
 * Root labels (AVDC-style): two roots M / D; maxillary P4 MB / MP / D;
 * maxillary M1–M2 MB / DB / P.
 *
 * Six-site probing ("MB2 B1 DB3 ML2 L1 DL2") uses the same labelled form:
 * three buccal sites, then three lingual, on every tooth.
 */

export type PocketMode = 'tooth' | 'root' | 'site';

/** The six probing sites, buccal row then lingual row. */
export const POCKET_SITES: readonly string[] = ['MB', 'B', 'DB', 'ML', 'L', 'DL'];

const TWO = ['M', 'D'];
const UPPER_P4 = ['MB', 'MP', 'D'];
const UPPER_MOLAR = ['MB', 'DB', 'P'];

/**
 * Roots of a tooth by species and Triadan number. An empty list means one
 * root — the tooth keeps a single pocket box.
 *
 * Triadan positions: 01–03 incisors, 04 canine, 05–08 premolars P1–P4,
 * 09–11 molars M1–M3. Deciduous quadrants (5–8) use the same positions.
 */
export function rootLabels(species: Species, triadan: number): string[] {
  const quadrant = Math.floor(triadan / 100);
  const q = quadrant >= 5 ? quadrant - 4 : quadrant;
  const pos = triadan % 100;
  const upper = q === 1 || q === 2;
  const feline = species.startsWith('feline');
  // Horse cheek teeth are hypsodont (no furcation to probe per root):
  // one pocket box per tooth.
  // Rabbit teeth are aradicular: no divided-root probing fields.
  if (species === 'equine' || species === 'rabbit') return [];

  if (pos <= 5) return []; // incisors, canine, P1
  if (feline) {
    if (upper) {
      if (pos === 6) return []; // P2 (single-rooted)
      if (pos === 7) return TWO; // P3
      if (pos === 8) return UPPER_P4; // P4
      if (pos === 9) return TWO; // M1
      return [];
    }
    if (pos >= 7 && pos <= 9) return TWO; // P3, P4, M1
    return [];
  }
  // Canine dentition.
  if (upper) {
    if (pos === 6 || pos === 7) return TWO; // P2, P3
    if (pos === 8) return UPPER_P4; // P4
    if (pos === 9 || pos === 10) return UPPER_MOLAR; // M1, M2
    return [];
  }
  if (pos >= 6 && pos <= 10) return TWO; // P2–P4, M1, M2
  return []; // M3
}

/**
 * The labelled boxes a tooth's pocket gets in a chart-settings mode: none
 * (one plain value) per tooth, its roots per root, the six sites per site.
 */
export function pocketLabels(mode: PocketMode, species: Species, triadan: number, value?: string): string[] {
  const layout = inferPocketMode(value, species, triadan) ?? mode;
  if (layout === 'site') return [...POCKET_SITES];
  if (layout === 'root') return rootLabels(species, triadan);
  return [];
}

const TOKEN = /^(MB|MP|DB|ML|DL|M|D|P|B|L)(\d+(?:\.\d+)?)$/i;

/** Per-root depths in a stored value, or null when it's the plain
 *  one-per-tooth form (or empty). */
export function parseRootPockets(value: string | undefined): Record<string, string> | null {
  const tokens = (value ?? '').trim().split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const out: Record<string, string> = {};
  for (const t of tokens) {
    const m = TOKEN.exec(t);
    if (!m) return null;
    out[m[1].toUpperCase()] = m[2];
  }
  return out;
}

/** Store per-root depths: labelled tokens in root order, blanks left out. */
export function formatRootPockets(labels: string[], depths: Record<string, string>): string {
  return labels
    .map((l) => [l, (depths[l] ?? '').trim()] as const)
    .filter(([, d]) => d !== '')
    .map(([l, d]) => `${l}${d}`)
    .join(' ');
}

/**
 * The per-root boxes for a stored value. Labelled values fill their roots;
 * a plain value with exactly one number per box ("4 5" on a two-rooted
 * tooth) is split in order. Anything else can't be placed on roots
 * without guessing — `unplaced` carries it so the UI can keep it visible
 * instead of dropping it.
 */
export function rootBoxes(labels: string[], value: string | undefined): { depths: Record<string, string>; unplaced: string } {
  const v = (value ?? '').trim();
  if (!v) return { depths: {}, unplaced: '' };
  const parsed = parseRootPockets(v);
  // Labels from another mode (roots shown as sites or the other way round)
  // stay visible as typed rather than vanishing from the boxes.
  if (parsed) return Object.keys(parsed).every((k) => labels.includes(k)) ? { depths: parsed, unplaced: '' } : { depths: {}, unplaced: v };
  const nums = v.split(/[\s,]+/).filter(Boolean);
  if (labels.length > 0 && nums.length === labels.length && nums.every((n) => /^\d+(\.\d+)?$/.test(n))) {
    return { depths: Object.fromEntries(labels.map((l, i) => [l, nums[i]])), unplaced: '' };
  }
  return { depths: {}, unplaced: v };
}

/** Every depth in a stored value (plain or per-root), for range checks
 *  and the deepest-pocket summary. Non-numeric parts are NaN. */
export function pocketDepths(value: string | undefined): number[] {
  const parsed = parseRootPockets(value);
  if (parsed) return Object.values(parsed).map(Number);
  return (value ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
}

/** Deepest pocket in mm, or null when there's no number. */
export function deepestPocket(value: string | undefined): number | null {
  const ds = pocketDepths(value).filter((n) => Number.isFinite(n));
  return ds.length ? Math.max(...ds) : null;
}

type StructuredPocketMode = Exclude<PocketMode, 'tooth'>;

function namedPocketLayout(labels: string[], species: Species, triadan: number) {
  const roots = rootLabels(species, triadan);
  return {
    roots,
    isRoot: labels.every(label => roots.includes(label)),
    isSite: labels.every(label => POCKET_SITES.includes(label)),
  };
}

function sixPocketReadings(value: string | undefined): Record<string, string> | null {
  const depths = rootBoxes([...POCKET_SITES], value).depths;
  return Object.keys(depths).length === POCKET_SITES.length ? depths : null;
}

/** Infer a layout only when the readings identify it unambiguously. */
export function inferPocketMode(value: string | undefined, species: Species, triadan: number): StructuredPocketMode | undefined {
  const named = parseRootPockets(value);
  if (!named) return sixPocketReadings(value) ? 'site' : undefined;
  const { isRoot, isSite } = namedPocketLayout(Object.keys(named), species, triadan);
  if (isRoot !== isSite) return isRoot ? 'root' : 'site';
}

/** An explicit single reading also changes the dictation layout. */
export function inferDictatedPocketMode(value: string, species: Species, triadan: number): PocketMode | undefined {
  return /^\d+(?:\.\d+)?$/u.test(value.trim()) ? 'tooth' : inferPocketMode(value, species, triadan);
}

/** A visit with mixed readings shows the most detailed layout in Settings. */
export function chartPocketMode(rows: readonly { triadan: number; pocket?: string }[], species: Species, fallback: PocketMode): PocketMode {
  let inferred: PocketMode = fallback;
  for (const row of rows) {
    const mode = inferPocketMode(row.pocket, species, row.triadan);
    if (mode === 'site') return 'site';
    if (mode === 'root') inferred = 'root';
  }
  return inferred;
}

/** A positional value is assigned to roots only when the active layout already shows it that way. */
export function displayedPocketReadings(value: string, species: Species, triadan: number, mode?: PocketMode) {
  const known = parseRootPockets(value) ?? sixPocketReadings(value);
  if (known || mode !== 'root') return known;
  const labels = rootLabels(species, triadan);
  if (labels.length === 0) return null;
  const { depths, unplaced } = rootBoxes(labels, value);
  return unplaced || !Object.keys(depths).length ? null : depths;
}

function comparePockets(current: string, incoming: string, species: Species, triadan: number, mode?: PocketMode) {
  const previous = displayedPocketReadings(current, species, triadan, mode);
  const next = parseRootPockets(incoming) ?? sixPocketReadings(incoming);
  if (!previous || !next) return;
  const { roots, isRoot, isSite } = namedPocketLayout([...Object.keys(previous), ...Object.keys(next)], species, triadan);
  if (!isRoot && !isSite) return;
  return { previous, next, labels: isRoot ? roots : [...POCKET_SITES] };
}

export function mergeDictatedPockets(current: string, incoming: string, species: Species, triadan: number, mode?: PocketMode): string {
  const named = comparePockets(current, incoming, species, triadan, mode);
  return named ? formatRootPockets(named.labels, { ...named.previous, ...named.next }) : incoming;
}

export function dictatedPocketIsPresent(current: string, incoming: string, species: Species, triadan: number, mode?: PocketMode): boolean {
  if (current.trim() === incoming.trim()) return true;
  const named = comparePockets(current, incoming, species, triadan, mode);
  return !!named && Object.entries(named.next).every(([label, depth]) =>
    named.previous[label] !== undefined && Number(named.previous[label]) === Number(depth));
}

/** Changing a depth or substituting an incompatible layout needs review. */
export function dictatedPocketsReplace(current: string, incoming: string, species: Species, triadan: number, mode?: PocketMode): boolean {
  if (!current.trim() || current.trim() === incoming.trim()) return false;
  const named = comparePockets(current, incoming, species, triadan, mode);
  return !named || Object.entries(named.next).some(([label, depth]) =>
    named.previous[label] !== undefined && Number(named.previous[label]) !== Number(depth));
}

export function revertDictatedPockets(current: string, previous: string, guess: string, species: Species, triadan: number, mode?: PocketMode): string {
  const named = comparePockets(current, guess, species, triadan);
  if (!named) return current.trim() === guess.trim() ? previous : current;
  const old = displayedPocketReadings(previous, species, triadan, mode);
  if (previous.trim() && (!old || !comparePockets(previous, guess, species, triadan, mode))) {
    return dictatedPocketIsPresent(current, guess, species, triadan) &&
      Object.keys(named.previous).length === Object.keys(named.next).length ? previous : current;
  }
  const remaining = { ...named.previous };
  for (const [label, depth] of Object.entries(named.next)) {
    if (Number(remaining[label]) !== Number(depth)) continue;
    if (old?.[label] !== undefined) remaining[label] = old[label];
    else delete remaining[label];
  }
  return formatRootPockets(named.labels, remaining);
}
