import { DentalField } from '../types';

/**
 * Chart settings — per person. They follow the signed-in account on every
 * device (profiles.chart_prefs); without an account they stay in this
 * browser. Every default reproduces the app as it was before these
 * settings existed, so an empty or missing object changes nothing.
 */

export const PERIO_FIELDS: { key: DentalField; label: string }[] = [
  { key: 'mobility', label: 'Mobility' },
  { key: 'recession', label: 'Recession' },
  { key: 'pocket', label: 'Pocket' },
  { key: 'furcation', label: 'Furcation' },
  { key: 'hyperplasia', label: 'Enlargement' },
  { key: 'calculus', label: 'Calculus' },
  { key: 'gingivitis', label: 'Gingivitis' },
  { key: 'pdstate', label: 'PD Stage' },
];
const FIELD_KEYS = new Set<string>(PERIO_FIELDS.map((f) => f.key));

export interface ChartPrefs {
  /** 'tooth' = one pocket box per tooth; 'root' = one per root. */
  pocketMode: 'tooth' | 'root';
  /** Charting grid columns that are hidden. */
  hiddenColumns: DentalField[];
  /** Grid values written beside the teeth (Diagnosis diagram + PDF). */
  besideTeeth: DentalField[];
  /** Write grid findings beside the teeth on the Diagnosis diagram. */
  mirrorToDiagnosis: boolean;
  /** Charting view: spreadsheet grid or By tooth. */
  chartingView: 'grid' | 'tooth';
  /** PDF keeps the charting grid (optional while findings are mirrored). */
  pdfIncludeGrid: boolean;
  /** PDF includes image pages. */
  pdfIncludeImages: boolean;
  /** Leave out the Recheck due field on the Patient page. */
  hideRecheck: boolean;
}

export const DEFAULT_CHART_PREFS: ChartPrefs = {
  pocketMode: 'tooth',
  hiddenColumns: [],
  besideTeeth: PERIO_FIELDS.map((f) => f.key),
  mirrorToDiagnosis: false,
  chartingView: 'grid',
  pdfIncludeGrid: true,
  pdfIncludeImages: true,
  hideRecheck: false,
};

const fieldList = (v: unknown, fallback: DentalField[]): DentalField[] =>
  Array.isArray(v) ? (v.filter((k) => typeof k === 'string' && FIELD_KEYS.has(k)) as DentalField[]) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Tolerant read of stored preferences; anything missing or invalid takes
 *  the value from `fallback` (the defaults, or this browser's old
 *  choices). */
export function normalizeChartPrefs(raw: unknown, fallback: ChartPrefs = DEFAULT_CHART_PREFS): ChartPrefs {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    pocketMode: r.pocketMode === 'root' || r.pocketMode === 'tooth' ? r.pocketMode : fallback.pocketMode,
    hiddenColumns: fieldList(r.hiddenColumns, fallback.hiddenColumns),
    besideTeeth: fieldList(r.besideTeeth, fallback.besideTeeth),
    mirrorToDiagnosis: bool(r.mirrorToDiagnosis, fallback.mirrorToDiagnosis),
    chartingView: r.chartingView === 'tooth' || r.chartingView === 'grid' ? r.chartingView : fallback.chartingView,
    pdfIncludeGrid: bool(r.pdfIncludeGrid, fallback.pdfIncludeGrid),
    pdfIncludeImages: bool(r.pdfIncludeImages, fallback.pdfIncludeImages),
    hideRecheck: bool(r.hideRecheck, fallback.hideRecheck),
  };
}
