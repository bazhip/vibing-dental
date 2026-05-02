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
}

export const EMPTY_NERVE_BLOCKS: NerveBlocks = {
  infraorbitalRight: '',
  infraorbitalLeft: '',
  inferiorAlveolarRight: '',
  inferiorAlveolarLeft: '',
  mentalRight: '',
  mentalLeft: '',
  other: '',
};

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
  doctor: string;
  tech: string;
  date: string;
  complaint: string;
  treatmentReport: string;
  nerveBlocks: NerveBlocks;
  exam: ExamFindings;
}

export const DEFAULT_VCA_DOCTOR = 'Dr. Margaret Smith, DVM, DAVDC';

/**
 * Species type for dental charts
 */
export type Species = 'feline' | 'canine';

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
