import { Species } from '../../types';

/**
 * All page-geometry constants for the PDF: page size, per-section boxes,
 * diagram slots, codes-legend regions. Centralized here so layout tuning
 * doesn't require chasing magic numbers through draw helpers.
 *
 * All coords are in inches measured from the page top/left unless noted.
 * Conversion to pdf-lib's bottom-up point system happens at draw time.
 */

export const PT_PER_IN = 72;

// Landscape US Letter (11×8.5 in).
export const PAGE_WIDTH_PT  = 11   * PT_PER_IN;
export const PAGE_HEIGHT_PT = 8.5  * PT_PER_IN;

// ---------- Diagram slots --------------------------------------------------
export interface DiagramSlot {
  pageIndex: number;
  /** Left edge of the centering column. */
  xIn: number;
  /** Width of the column the diagram is centered within. */
  columnWidthIn: number;
  yTopIn: number;
  /** Target height — actual height shrinks if the natural-aspect width
   *  would exceed maxWidthIn. */
  heightIn: number;
  maxWidthIn: number;
}

// Diagrams are portrait-oriented (aspect ≈ 0.70). heightIn is the binding
// constraint. Solved budget per page so the diagram + codes legend fit:
//   yTopIn + heightIn + 0.10 (gap) + codes_height ≤ 8.10 (footer rule).
//
// Page-1 slot reclaims the dead space below the logo / left of the
// patient-info box: upper-left at (0.15, 1.85), bottom-right held at
// (5.10, 6.50). Codes legend below stays at yTopIn 6.55 → 8.10.
export const DIAGRAM_SLOTS: Record<Species, [DiagramSlot, DiagramSlot]> = {
  canine: [
    { pageIndex: 0, xIn: 0.15, columnWidthIn: 4.95, yTopIn: 1.85, heightIn: 4.65, maxWidthIn: 4.85 },
    { pageIndex: 1, xIn: 0.30, columnWidthIn: 5.10, yTopIn: 1.75, heightIn: 4.70, maxWidthIn: 5.00 },
  ],
  // Same artwork/aspect as the adult canine chart.
  'canine-deciduous': [
    { pageIndex: 0, xIn: 0.15, columnWidthIn: 4.95, yTopIn: 1.85, heightIn: 4.65, maxWidthIn: 4.85 },
    { pageIndex: 1, xIn: 0.30, columnWidthIn: 5.10, yTopIn: 1.75, heightIn: 4.70, maxWidthIn: 5.00 },
  ],
  feline: [
    { pageIndex: 0, xIn: 0.15, columnWidthIn: 4.95, yTopIn: 1.85, heightIn: 4.65, maxWidthIn: 4.85 },
    { pageIndex: 1, xIn: 0.30, columnWidthIn: 5.10, yTopIn: 1.75, heightIn: 4.70, maxWidthIn: 5.00 },
  ],
};

// ---------- Codes-used legend ----------------------------------------------
export interface LegendBox {
  xIn: number;
  yTopIn: number;
  widthIn: number;
  heightIn: number;
}

export const LEGEND_BOXES_BY_PAGE: LegendBox[] = [
  // Page 1: below the diagram, left column. Width caps at 4.70 (right-
  // column tooth grids start at 5.10). Body fits 20 codes (or 30 in 3-col
  // mode, see drawCodesLegend).
  { xIn: 0.30, yTopIn: 6.55, widthIn: 4.70, heightIn: 1.55 },
  // Page 2: stops short of the treatment-report column at 5.50.
  { xIn: 0.30, yTopIn: 6.55, widthIn: 5.00, heightIn: 1.55 },
];

// ---------- Page-2 nerve-block table ---------------------------------------
// 3.05in wide. xIn places the table centered horizontally above the page-2
// diagram (column from 0.30 to 5.40 → center 2.85; xIn = 2.85 - 3.05/2).
export const NERVE_BLOCK_BOX = {
  pageIndex: 1,
  xIn: 1.325,
  yTopIn: 0.50,
  labelColIn: 1.95,
  valueColIn: 0.55,
  rowHeightIn: 0.22,
};

// ---------- Page-1 patient info box ----------------------------------------
// yTopIn=0.50 leaves room above for the floating section title (drawn
// 0.20in above the table top).
export const PATIENT_INFO_BOX = {
  pageIndex: 0,
  xIn: 3.65,
  yTopIn: 0.50,
  labelColIn: 1.10,
  valueColIn: 2.40,
  rowDateIn: 0.22,
  rowPatientIn: 0.22,
  rowIdIn: 0.22,
  rowChiefIn: 0.50,
  rowAnesthIn: 0.25,
};

// ---------- Page-1 oral-exam table -----------------------------------------
export const EXAM_TABLE_X_IN     = 5.10;
export const EXAM_TABLE_YTOP_IN  = 2.30;
/** Single-line row height (no comment, or comment fits on one line). */
export const EXAM_ROW_SHORT_IN   = 0.24;
/** Row height when the row's comment needs two lines. */
export const EXAM_ROW_TALL_IN    = 0.42;

/** Right-column comment slot for abnormal exam rows. */
export const EXAM_COMMENT_BOX = {
  pageIndex: 0,
  xIn: 7.40,
  widthIn: 3.20,
  maxFontSizePt: 9,
  minFontSizePt: 5.5,
  lineHeightFactor: 1.18,
};

/** Match the LaTeX-original label phrasing (no spaces around the slash). */
export const EXAM_PDF_LABELS: Record<string, string> = {
  extraoral: 'Extraoral/facial',
  lymph:     'Lymph nodes',
  buccal:    'Buccal mucosa',
  tongue:    'Tongue',
  palate:    'Palate',
  pharynx:   'Pharynx/Tonsils',
};

// ---------- Page-2 treatment & surgery report ------------------------------
export const TREATMENT_REPORT = {
  pageIndex: 1,
  xIn: 5.50,
  headerYTopIn: 0.30,
  fieldYTopIn: 0.50,
  fieldWidthIn: 5.10,
  fieldHeightIn: 7.50,
};
