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
 */

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

const TOKEN = /^(MB|MP|DB|M|D|P)(\d+(?:\.\d+)?)$/i;

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
 * a plain value with exactly one number per root ("4 5" on a two-rooted
 * tooth) is split in order. Anything else can't be placed on roots
 * without guessing — `unplaced` carries it so the UI can keep it visible
 * instead of dropping it.
 */
export function rootBoxes(labels: string[], value: string | undefined): { depths: Record<string, string>; unplaced: string } {
  const v = (value ?? '').trim();
  if (!v) return { depths: {}, unplaced: '' };
  const parsed = parseRootPockets(v);
  if (parsed) return { depths: parsed, unplaced: '' };
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
