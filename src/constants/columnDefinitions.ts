import { ColumnDefinition } from '../types';
import i18n from '../i18n';
import type chart from '../locales/en/chart.json';

export type ColumnKey = keyof typeof chart.columns;

/** A grid column's display name in `lng` (the active language by default). */
export function columnLabel(key: ColumnKey, lng: string = i18n.language): string {
  return i18n.getFixedT(lng, 'chart')(`columns.${key}`);
}

// `name` is read through columnLabel each time, so it follows the language.
const column = (key: ColumnKey, editable: boolean, width: number, frozen?: true): ColumnDefinition => ({
  key,
  get name() {
    return columnLabel(key);
  },
  editable,
  width,
  ...(frozen ? { frozen } : {}),
});

/**
 * Column definitions for the dental data grid
 */
export const GRID_COLUMNS: ColumnDefinition[] = [
  column('tooth', false, 60, true),
  column('triadan', false, 70, true),
  column('mobility', true, 85),
  column('recession', true, 85),
  column('pocket', true, 70),
  column('furcation', true, 90),
  column('hyperplasia', true, 110),
  column('calculus', true, 85),
  column('gingivitis', true, 90),
  column('pdstate', true, 85),
];

/**
 * Minimum height for the data grid
 */
export const GRID_MIN_HEIGHT = 1000;

/**
 * Total number of rows in the grid
 */
export const GRID_ROW_COUNT = 43;

/** Valid scales for numeric grid columns (mirrors the AI's checks). */
export const COLUMN_RANGES: Record<string, [number, number]> = {
  mobility: [0, 3], furcation: [0, 3], calculus: [0, 3], gingivitis: [0, 3], pdstate: [0, 4],
  pocket: [0, 15], recession: [0, 15],
};

/**
 * Short-scale columns charted by tapping a score instead of typing it.
 * The prefix is the AVDC shorthand the score is read out as (M2, F3,
 * CI1, GI2, PD3) — chips show it, the cell still stores the bare number
 * so the PDF, AI checks and saved charts are unchanged.
 */
export const SCORE_PREFIX: Record<string, string> = {
  mobility: 'M', furcation: 'F', calculus: 'CI', gingivitis: 'GI', pdstate: 'PD',
};

export interface ScoreChoice { value: string; label: string }

/** Tappable choices for a column, or null when it isn't a short scale. */
export function scoreChoices(key: string): ScoreChoice[] | null {
  const prefix = SCORE_PREFIX[key];
  const range = COLUMN_RANGES[key];
  if (prefix === undefined || !range) return null;
  const out: ScoreChoice[] = [];
  for (let n = range[0]; n <= range[1]; n++) out.push({ value: String(n), label: `${prefix}${n}` });
  return out;
}
