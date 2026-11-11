/**
 * Type definitions for the Dental Charting Application
 */

/**
 * Represents a single tooth in the dental chart
 */
export interface ToothData {
  tooth: string;
  triadan: number;
  mobility?: string;
  recession?: string;
  pocket?: string;
  furcation?: string;
  hyperplasia?: string;
  calculus?: string;
  gingivitis?: string;
  pdstate?: string;
}

/** One anesthetic in the nerve-block mix. `concentration` is the percent
 *  strength as typed (e.g. "0.5", "2") — the "%" is added on display. */
export interface AnestheticDrug {
  name: string;
  concentration: string;
}

/**
 * Nerve block dose entries (mL of anesthetic per site).
 * Field names map to PDF form fields nb_{io|ia|men|oth}_{r|l}.
 */
export interface NerveBlocks {
  infraorbitalRight: string;
  infraorbitalLeft: string;
  inferiorAlveolarRight: string;
  inferiorAlveolarLeft: string;
  mentalRight: string;
  mentalLeft: string;
  /** Free-text "other" block — single field that spans the row, no L/R or mL. */
  other: string;
  /** Anesthetics mixed for the blocks (the mL doses are of the mix). An
   *  empty list — or only blank names — means "use the template default"
   *  (0.5% Ropivacaine for VCA, 0.5% Bupivacaine for SoCal). Replaces the
   *  legacy single `drug` string; see normalizeNerveBlocks. */
  drugs: AnestheticDrug[];
}

/** The per-site text fields of NerveBlocks (everything but the drug list). */
export type NerveBlockSite = Exclude<keyof NerveBlocks, 'drugs'>;

export const EMPTY_NERVE_BLOCKS: NerveBlocks = {
  infraorbitalRight: '',
  infraorbitalLeft: '',
  inferiorAlveolarRight: '',
  inferiorAlveolarLeft: '',
  mentalRight: '',
  mentalLeft: '',
  other: '',
  drugs: [],
};

/** Default anesthetic per logo. Used when nerveBlocks.drugs is empty. */
export const DEFAULT_NERVE_BLOCK_DRUG: Record<'socal' | 'vca', string> = {
  vca: 'Ropivacaine',
  socal: 'Bupivacaine',
};

/** Strength the template default (and legacy single-drug charts) printed. */
export const DEFAULT_NERVE_BLOCK_CONCENTRATION = '0.5';

/** Usual veterinary nerve-block strength (%) per drug, for pre-filling the
 *  concentration when a drug is picked. Unknown drugs get ''. */
const USUAL_CONCENTRATION: Record<string, string> = {
  bupivacaine: '0.5',
  ropivacaine: '0.5',
  lidocaine: '2',
  mepivacaine: '2',
};

export function usualConcentration(name: string): string {
  return USUAL_CONCENTRATION[name.trim().toLowerCase()] ?? '';
}

/** Drugs that will actually be charted: blank names dropped, falling back
 *  to the template default when nothing is left. */
export function effectiveNerveBlockDrugs(
  nerveBlocks: Pick<NerveBlocks, 'drugs'>,
  logo: 'socal' | 'vca'
): AnestheticDrug[] {
  const named = (nerveBlocks.drugs ?? [])
    .map((d) => ({ name: (d?.name ?? '').trim(), concentration: (d?.concentration ?? '').trim() }))
    .filter((d) => d.name);
  return named.length
    ? named
    : [{ name: DEFAULT_NERVE_BLOCK_DRUG[logo], concentration: DEFAULT_NERVE_BLOCK_CONCENTRATION }];
}

/** "0.5% Bupivacaine" / "Bupivacaine" (no strength given). */
export function formatAnestheticDrug(d: AnestheticDrug): string {
  const c = d.concentration.trim().replace(/%$/, '');
  return c ? `${c}% ${d.name.trim()}` : d.name.trim();
}

/**
 * Coerce stored/stashed nerve-block data (possibly from before multi-drug
 * support, when it carried a single `drug` string) into the current shape.
 * Legacy charts always printed "0.5%", so that's the migrated strength.
 */
export function normalizeNerveBlocks(raw: unknown): NerveBlocks {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<NerveBlocks> & { drug?: unknown };
  const out: NerveBlocks = { ...EMPTY_NERVE_BLOCKS };
  for (const key of Object.keys(EMPTY_NERVE_BLOCKS) as Array<keyof NerveBlocks>) {
    if (key === 'drugs') continue;
    const v = r[key];
    if (typeof v === 'string') out[key] = v;
  }
  if (Array.isArray(r.drugs)) {
    out.drugs = r.drugs
      .filter((d): d is AnestheticDrug => !!d && typeof d === 'object')
      .map((d) => ({ name: String(d.name ?? ''), concentration: String(d.concentration ?? '') }));
  } else if (typeof r.drug === 'string' && r.drug.trim()) {
    out.drugs = [{ name: r.drug.trim(), concentration: DEFAULT_NERVE_BLOCK_CONCENTRATION }];
  }
  return out;
}

/**
 * Result of a single oral-exam item: either Normal, Abnormal, or unset.
 * Each item carries an optional free-text comment (used when status is
 * abnormal; the field is preserved across status changes so users don't
 * lose a note if they bounce between radio choices).
 *
 * Maps to PDF form fields:
 *   ex<Item>N — checked when status === 'normal'
 *   ex<Item>A — checked when status === 'abnormal'
 *   ex<Item>C — comment text (rendered when abnormal)
 */
export type ExamFinding = 'normal' | 'abnormal' | '';

export interface ExamItemValue {
  status: ExamFinding;
  comment: string;
}

export interface ExamFindings {
  extraoral: ExamItemValue;
  lymph: ExamItemValue;
  buccal: ExamItemValue;
  tongue: ExamItemValue;
  palate: ExamItemValue;
  pharynx: ExamItemValue;
}

const emptyItem = (): ExamItemValue => ({ status: '', comment: '' });

export const EMPTY_EXAM_FINDINGS: ExamFindings = {
  extraoral: emptyItem(),
  lymph: emptyItem(),
  buccal: emptyItem(),
  tongue: emptyItem(),
  palate: emptyItem(),
  pharynx: emptyItem(),
};

export const EXAM_ITEMS: { key: keyof ExamFindings; label: string; pdfName: string }[] = [
  { key: 'extraoral', label: 'Extraoral / facial', pdfName: 'Extraoral' },
  { key: 'lymph',     label: 'Lymph nodes',        pdfName: 'Lymph' },
  { key: 'buccal',    label: 'Buccal mucosa',      pdfName: 'Buccal' },
  { key: 'tongue',    label: 'Tongue',             pdfName: 'Tongue' },
  { key: 'palate',    label: 'Palate',             pdfName: 'Palate' },
  { key: 'pharynx',   label: 'Pharynx / Tonsils',  pdfName: 'Pharynx' },
];

/**
 * Patient information.
 *
 * SoCal charts surface `patientName` / `patientNumber` in the patient
 * info box; VCA charts surface `doctor` / `tech` instead. Both pairs of
 * fields are kept on the object so a user can toggle templates without
 * losing the values they typed.
 */
export interface PatientInfo {
  patientName: string;
  patientNumber: string;
  /** Pet owner (client) contact — name/phone searchable in My charts;
   *  email is the recheck-reminder recipient. */
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  doctor: string;
  tech: string;
  date: string;
  complaint: string;
  treatmentReport: string;
  /** Next dental recheck due (yyyy-mm-dd), '' when none. Surfaced in the
   *  chart library as a recall reminder. */
  recallDate: string;
  nerveBlocks: NerveBlocks;
  exam: ExamFindings;
}

/** New charts start with no doctor; the practice profile's doctor name
 *  brands PDFs. (Was a specific doctor's name — wrong for every other
 *  practice.) */
export const DEFAULT_VCA_DOCTOR = '';

/**
 * Species / dentition type for dental charts. The `-deciduous` variants are
 * the primary dentitions: `canine-deciduous` = 28-tooth puppy (no P1, no
 * molars); `feline-deciduous` = 26-tooth kitten (as canine-deciduous but
 * the lower jaw also has no p2). Triadan quadrants 5-8.
 */
export type Species =
  | 'feline'
  | 'canine'
  | 'canine-deciduous'
  | 'feline-deciduous';

/**
 * Per-tooth visual mark on the interactive diagram.
 *  - `missing`   → tooth filled solid (extracted pre-surgery, no longer there)
 *  - `extracted` → X drawn over the tooth (extracted during this visit)
 */
export type ToothMark = 'missing' | 'extracted';

export type ToothMarks = Record<number, ToothMark>;

export interface DiagramComment {
  id: string;
  text: string;
  /** Triadan number this comment is anchored to, or null for free-floating. */
  anchorTriadan: number | null;
  /** Position in SVG coords. For anchored comments these may be undefined,
   *  in which case the layout auto-places the comment in the side margin
   *  closest to the anchor tooth. Once the user drags, x/y get set. */
  x?: number;
  y?: number;
  /** User-set size in SVG coords. Defaults to the layout's standard size. */
  width?: number;
  height?: number;
}

export interface StrokePoint {
  x: number;
  y: number;
}

export interface DiagramStroke {
  id: string;
  /** Which arch the stroke was drawn on. */
  arch: 'maxilla' | 'mandible';
  color: string;
  width: number;
  points: StrokePoint[];
}

/**
 * Logo/Organization type for PDF templates
 */
export type Logo = 'socal' | 'vca';

/**
 * Complete chart snapshot — everything needed to restore a chart. Same
 * information the PDF round-trip embeds; also the payload synced to the
 * cloud `charts` table.
 */
/** Owner-report tag for an attached image: which side of a Before &
 *  After pair it belongs to. Untagged images stay out of the report. */
export type ImageRole = 'before' | 'after';

/** Hand-edited overrides for the owner report. Every block starts
 *  auto-generated from the chart; a field is present here only when the
 *  team customized it (absent = keep using the generated text). */
export interface OwnerReportOverrides {
  /** Opening summary paragraph. */
  intro?: string;
  /** Home-care advice, one tip per line. */
  homecare?: string;
  /** Optional extra note from the team, printed as its own section. */
  extraNotes?: string;
  /** Practice owner-report template chosen for this chart (absent = the
   *  practice default). Unknown ids fall back to the default too. */
  templateId?: string;
}

export interface ChartSnapshot {
  /** Snapshot schema version — absent on charts saved before the field
   *  existed (treat as 1). Bump when the shape changes incompatibly so
   *  loaders have something to key migrations on. */
  version?: number;
  /** Before/after tags for attached images (by attachment id), used by
   *  the owner report's photo section. */
  imageRoles?: Record<string, ImageRole>;
  /** Attachment ids left OUT of the chart PDF's image pages. Stored as
   *  exclusions so a newly added image is in the PDF by default. */
  pdfExcludedImages?: string[];
  /** Hand-edited owner-report text blocks (absent fields = generated). */
  ownerReport?: OwnerReportOverrides;
  patientInfo: PatientInfo;
  toothData: ToothData[];
  species: Species;
  logo: Logo;
  preMarks: ToothMarks;
  preComments: DiagramComment[];
  preStrokes: DiagramStroke[];
  postMarks: ToothMarks;
  postComments: DiagramComment[];
  postStrokes: DiagramStroke[];
}

/**
 * Column definition for the data grid
 */
export interface ColumnDefinition {
  key: keyof ToothData;
  name: string;
  editable: boolean;
  width?: number;
  frozen?: boolean;
}

/**
 * Field names that can be edited in the dental chart
 */
export type DentalField =
  | 'mobility'
  | 'recession'
  | 'pocket'
  | 'furcation'
  | 'hyperplasia'
  | 'calculus'
  | 'gingivitis'
  | 'pdstate';

/**
 * Coordinate position for PDF text placement
 */
export interface Coordinate {
  x: number;
  y: number;
}

/**
 * Spacing configuration for PDF generation
 */
export interface PDFSpacing {
  xSpacing: number;
  ySpacing: number;
}

/**
 * Region configuration for tooth layout in PDF
 */
export interface ToothRegion {
  startIndex: number;
  count: number;
  startX: number;
  startY: number;
  xSpacing: number;
  ySpacing: number;
  reverse?: boolean;
}
