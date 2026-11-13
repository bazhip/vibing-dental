import { DentalField } from '../types';
import { AppLanguage, isAppLanguage } from '../i18n/config';
import { ColumnKey, columnLabel } from '../constants/columnDefinitions';
import { CustomBlockDef, CustomFieldDef, normalizeBlockDefs, normalizeFieldDefs } from './customAnesthesia';

/**
 * Chart settings — per person. They follow the signed-in account on every
 * device (profiles.chart_prefs); without an account they stay in this
 * browser. Every default reproduces the app as it was before these
 * settings existed, so an empty or missing object changes nothing.
 */

// `label` is read through columnLabel each time, so it follows the language.
const perioField = (key: DentalField & ColumnKey): { key: DentalField; readonly label: string } => ({
  key,
  get label() {
    return columnLabel(key);
  },
});
export const PERIO_FIELDS: { key: DentalField; readonly label: string }[] = [
  perioField('mobility'),
  perioField('recession'),
  perioField('pocket'),
  perioField('furcation'),
  perioField('hyperplasia'),
  perioField('calculus'),
  perioField('gingivitis'),
  perioField('pdstate'),
];
const FIELD_KEYS = new Set<string>(PERIO_FIELDS.map((f) => f.key));

/** Nerve block rows on the Anesthesia page (each R/L pair, plus Other). Names: settings:chart.anesthesia.blockNames. */
export const BLOCK_ROW_OPTIONS = [
  { id: 'infraorbital' },
  { id: 'caudalMaxillary' },
  { id: 'inferiorAlveolar' },
  { id: 'mental' },
  { id: 'other' },
] as const;
export type BlockRowId = (typeof BLOCK_ROW_OPTIONS)[number]['id'];
const BLOCK_IDS = new Set<string>(BLOCK_ROW_OPTIONS.map((b) => b.id));

export type ScoreTapMove = 'finding' | 'tooth' | 'stay';
const SCORE_TAP_MOVES = new Set<string>(['finding', 'tooth', 'stay']);

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
  /** Space in a grid cell moves down to the next tooth (for calling out
   *  a run of depths) instead of typing a space. */
  spaceMovesDown: boolean;
  /** Where the grid goes after a score is tapped (M2, F1, …): the same
   *  tooth's next finding (exams go tooth by tooth), the next tooth in
   *  the same column, or nowhere. */
  scoreTapMoves: ScoreTapMove;
  /** Nerve block rows hidden on the Anesthesia page (shown anyway when
   *  they hold a dose). */
  hiddenBlocks: BlockRowId[];
  /** The person's usual anesthetic — offered as one tap on a chart with
   *  no anesthetic set. null = none. */
  usualDrug: { name: string; concentration: string } | null;
  /** Id of the last "What's new" the person has seen ('' = none). */
  whatsNewSeen: string;
  /** The person's own nerve blocks (extra Right/Left mL rows). */
  customBlocks: CustomBlockDef[];
  /** The person's own anesthesia fields (text, number, yes/no, pick-list). */
  customFields: CustomFieldDef[];
  /** The person's chosen language. null = follow the browser. */
  language: AppLanguage | null;
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
  spaceMovesDown: true,
  scoreTapMoves: 'finding',
  hiddenBlocks: [],
  usualDrug: null,
  whatsNewSeen: '',
  customBlocks: [],
  customFields: [],
  language: null,
};

const fieldList = (v: unknown, fallback: DentalField[]): DentalField[] =>
  Array.isArray(v) ? (v.filter((k) => typeof k === 'string' && FIELD_KEYS.has(k)) as DentalField[]) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
function usualDrugOf(v: unknown, fallback: ChartPrefs['usualDrug']): ChartPrefs['usualDrug'] {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return fallback;
  const d = v as { name?: unknown; concentration?: unknown };
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 60) : '';
  if (!name) return null;
  return { name, concentration: typeof d.concentration === 'string' ? d.concentration.replace(/%/g, '').trim().slice(0, 10) : '' };
}

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
    spaceMovesDown: bool(r.spaceMovesDown, fallback.spaceMovesDown),
    scoreTapMoves: typeof r.scoreTapMoves === 'string' && SCORE_TAP_MOVES.has(r.scoreTapMoves) ? (r.scoreTapMoves as ScoreTapMove) : fallback.scoreTapMoves,
    hiddenBlocks: Array.isArray(r.hiddenBlocks)
      ? (r.hiddenBlocks.filter((b) => typeof b === 'string' && BLOCK_IDS.has(b)) as BlockRowId[])
      : fallback.hiddenBlocks,
    usualDrug: usualDrugOf(r.usualDrug, fallback.usualDrug),
    whatsNewSeen: typeof r.whatsNewSeen === 'string' ? r.whatsNewSeen.slice(0, 40) : fallback.whatsNewSeen,
    customBlocks: Array.isArray(r.customBlocks) ? normalizeBlockDefs(r.customBlocks) : fallback.customBlocks,
    customFields: Array.isArray(r.customFields) ? normalizeFieldDefs(r.customFields) : fallback.customFields,
    language: r.language === null ? null : isAppLanguage(r.language) ? r.language : fallback.language,
  };
}
