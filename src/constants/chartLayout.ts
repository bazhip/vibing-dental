/**
 * Layout constants for the fully-dynamic chart PDF. Triadan ordering and
 * column widths mirror what used to live in the LaTeX template, so any
 * downstream change here is the single source of truth for the chart's
 * tooth-grid geometry.
 *
 * Tooth display order goes right→midline→left for each arch (matching how
 * a clinician views the patient looking at them: right side back-to-front,
 * across the midline, then left side front-to-back).
 */

import { Species } from '../types';

export interface ChartTooth {
  triadan: number;
  abbr: string;
}

export interface ToothGridLayout {
  pageIndex: number;
  xIn: number;
  yTopIn: number;
  labelColIn: number;     // first column (Tooth/Triadan/Mob/etc.) total width
  toothColIn: number;     // each tooth column total width
  rowHeightIn: number;    // total row height (header + each data row)
  fieldWidthIn: number;   // text-field width within a tooth column
  fieldHeightIn: number;  // text-field height
  teeth: ChartTooth[];
}

export const CANINE_MAXILLA_TEETH: ChartTooth[] = [
  { triadan: 110, abbr: 'M2' },
  { triadan: 109, abbr: 'M1' },
  { triadan: 108, abbr: 'P4' },
  { triadan: 107, abbr: 'P3' },
  { triadan: 106, abbr: 'P2' },
  { triadan: 105, abbr: 'P1' },
  { triadan: 104, abbr: 'C'  },
  { triadan: 103, abbr: 'I3' },
  { triadan: 102, abbr: 'I2' },
  { triadan: 101, abbr: 'I1' },
  { triadan: 201, abbr: 'I1' },
  { triadan: 202, abbr: 'I2' },
  { triadan: 203, abbr: 'I3' },
  { triadan: 204, abbr: 'C'  },
  { triadan: 205, abbr: 'P1' },
  { triadan: 206, abbr: 'P2' },
  { triadan: 207, abbr: 'P3' },
  { triadan: 208, abbr: 'P4' },
  { triadan: 209, abbr: 'M1' },
  { triadan: 210, abbr: 'M2' },
];

export const CANINE_MANDIBLE_TEETH: ChartTooth[] = [
  { triadan: 411, abbr: 'M3' },
  { triadan: 410, abbr: 'M2' },
  { triadan: 409, abbr: 'M1' },
  { triadan: 408, abbr: 'P4' },
  { triadan: 407, abbr: 'P3' },
  { triadan: 406, abbr: 'P2' },
  { triadan: 405, abbr: 'P1' },
  { triadan: 404, abbr: 'C'  },
  { triadan: 403, abbr: 'I3' },
  { triadan: 402, abbr: 'I2' },
  { triadan: 401, abbr: 'I1' },
  { triadan: 301, abbr: 'I1' },
  { triadan: 302, abbr: 'I2' },
  { triadan: 303, abbr: 'I3' },
  { triadan: 304, abbr: 'C'  },
  { triadan: 305, abbr: 'P1' },
  { triadan: 306, abbr: 'P2' },
  { triadan: 307, abbr: 'P3' },
  { triadan: 308, abbr: 'P4' },
  { triadan: 309, abbr: 'M1' },
  { triadan: 310, abbr: 'M2' },
  { triadan: 311, abbr: 'M3' },
];

// Feline lacks 105/205 (no upper P1) and 110/210 (no upper M2).
export const FELINE_MAXILLA_TEETH: ChartTooth[] = [
  { triadan: 109, abbr: 'M1' },
  { triadan: 108, abbr: 'P4' },
  { triadan: 107, abbr: 'P3' },
  { triadan: 106, abbr: 'P2' },
  { triadan: 104, abbr: 'C'  },
  { triadan: 103, abbr: 'I3' },
  { triadan: 102, abbr: 'I2' },
  { triadan: 101, abbr: 'I1' },
  { triadan: 201, abbr: 'I1' },
  { triadan: 202, abbr: 'I2' },
  { triadan: 203, abbr: 'I3' },
  { triadan: 204, abbr: 'C'  },
  { triadan: 206, abbr: 'P2' },
  { triadan: 207, abbr: 'P3' },
  { triadan: 208, abbr: 'P4' },
  { triadan: 209, abbr: 'M1' },
];

// Feline lacks 405/305 (no lower P1), 406/306 (no lower P2), and 410/411/310/311 (no lower M2/M3).
export const FELINE_MANDIBLE_TEETH: ChartTooth[] = [
  { triadan: 409, abbr: 'M1' },
  { triadan: 408, abbr: 'P4' },
  { triadan: 407, abbr: 'P3' },
  { triadan: 404, abbr: 'C'  },
  { triadan: 403, abbr: 'I3' },
  { triadan: 402, abbr: 'I2' },
  { triadan: 401, abbr: 'I1' },
  { triadan: 301, abbr: 'I1' },
  { triadan: 302, abbr: 'I2' },
  { triadan: 303, abbr: 'I3' },
  { triadan: 304, abbr: 'C'  },
  { triadan: 307, abbr: 'P3' },
  { triadan: 308, abbr: 'P4' },
  { triadan: 309, abbr: 'M1' },
];

// Deciduous dog (puppy): 28 teeth per the AVDC Triadan table — i1-i3, c,
// p2-p4 per quadrant in the 500s-800s (no x05; no molars). Display order
// mirrors the adult charts: right side back-to-front, across the midline,
// then left side front-to-back.
export const CANINE_DECIDUOUS_MAXILLA_TEETH: ChartTooth[] = [
  { triadan: 508, abbr: 'p4' },
  { triadan: 507, abbr: 'p3' },
  { triadan: 506, abbr: 'p2' },
  { triadan: 504, abbr: 'c'  },
  { triadan: 503, abbr: 'i3' },
  { triadan: 502, abbr: 'i2' },
  { triadan: 501, abbr: 'i1' },
  { triadan: 601, abbr: 'i1' },
  { triadan: 602, abbr: 'i2' },
  { triadan: 603, abbr: 'i3' },
  { triadan: 604, abbr: 'c'  },
  { triadan: 606, abbr: 'p2' },
  { triadan: 607, abbr: 'p3' },
  { triadan: 608, abbr: 'p4' },
];

export const CANINE_DECIDUOUS_MANDIBLE_TEETH: ChartTooth[] = [
  { triadan: 808, abbr: 'p4' },
  { triadan: 807, abbr: 'p3' },
  { triadan: 806, abbr: 'p2' },
  { triadan: 804, abbr: 'c'  },
  { triadan: 803, abbr: 'i3' },
  { triadan: 802, abbr: 'i2' },
  { triadan: 801, abbr: 'i1' },
  { triadan: 701, abbr: 'i1' },
  { triadan: 702, abbr: 'i2' },
  { triadan: 703, abbr: 'i3' },
  { triadan: 704, abbr: 'c'  },
  { triadan: 706, abbr: 'p2' },
  { triadan: 707, abbr: 'p3' },
  { triadan: 708, abbr: 'p4' },
];

export const FELINE_DECIDUOUS_MAXILLA_TEETH: ChartTooth[] = [
  { triadan: 508, abbr: 'p4' },
  { triadan: 507, abbr: 'p3' },
  { triadan: 506, abbr: 'p2' },
  { triadan: 504, abbr: 'c'  },
  { triadan: 503, abbr: 'i3' },
  { triadan: 502, abbr: 'i2' },
  { triadan: 501, abbr: 'i1' },
  { triadan: 601, abbr: 'i1' },
  { triadan: 602, abbr: 'i2' },
  { triadan: 603, abbr: 'i3' },
  { triadan: 604, abbr: 'c'  },
  { triadan: 606, abbr: 'p2' },
  { triadan: 607, abbr: 'p3' },
  { triadan: 608, abbr: 'p4' },
];

// Kitten mandible has no deciduous p2 (12 teeth).
export const FELINE_DECIDUOUS_MANDIBLE_TEETH: ChartTooth[] = [
  { triadan: 808, abbr: 'p4' },
  { triadan: 807, abbr: 'p3' },
  { triadan: 804, abbr: 'c'  },
  { triadan: 803, abbr: 'i3' },
  { triadan: 802, abbr: 'i2' },
  { triadan: 801, abbr: 'i1' },
  { triadan: 701, abbr: 'i1' },
  { triadan: 702, abbr: 'i2' },
  { triadan: 703, abbr: 'i3' },
  { triadan: 704, abbr: 'c'  },
  { triadan: 707, abbr: 'p3' },
  { triadan: 708, abbr: 'p4' },
];

// Tooth grids are 5.50in wide (matching the exam table above) and pushed
// down so the mandible bottom sits just above the page-1 footer rule
// (mandible bottom ≈ 8.00in; footer rule at 8.10in). Each grid is 1.30in
// tall (10 rows × 0.13in), so:
//   maxilla:  yTopIn = 5.10 → ends at 6.40
//   mandible: yTopIn = 6.70 → ends at 8.00
// labelCol 0.50in + N tooth cols = 5.50in → toothColIn = (5.50 - 0.50) / N.
export const TOOTH_GRID_LAYOUTS: Record<Species, { maxilla: ToothGridLayout; mandible: ToothGridLayout }> = {
  canine: {
    maxilla: {
      pageIndex: 0, xIn: 5.10, yTopIn: 5.10,
      labelColIn: 0.50, toothColIn: 0.250,    // 5.00 / 20
      rowHeightIn: 0.13, fieldWidthIn: 0.225, fieldHeightIn: 0.115,
      teeth: CANINE_MAXILLA_TEETH,
    },
    mandible: {
      pageIndex: 0, xIn: 5.10, yTopIn: 6.70,
      labelColIn: 0.50, toothColIn: 0.227,    // 5.00 / 22 ≈ 0.227
      rowHeightIn: 0.13, fieldWidthIn: 0.202, fieldHeightIn: 0.115,
      teeth: CANINE_MANDIBLE_TEETH,
    },
  },
  'canine-deciduous': {
    maxilla: {
      pageIndex: 0, xIn: 5.10, yTopIn: 5.10,
      labelColIn: 0.50, toothColIn: 0.3571,   // 5.00 / 14 ≈ 0.357
      rowHeightIn: 0.13, fieldWidthIn: 0.332, fieldHeightIn: 0.115,
      teeth: CANINE_DECIDUOUS_MAXILLA_TEETH,
    },
    mandible: {
      pageIndex: 0, xIn: 5.10, yTopIn: 6.70,
      labelColIn: 0.50, toothColIn: 0.3571,   // 5.00 / 14 ≈ 0.357
      rowHeightIn: 0.13, fieldWidthIn: 0.332, fieldHeightIn: 0.115,
      teeth: CANINE_DECIDUOUS_MANDIBLE_TEETH,
    },
  },
  feline: {
    maxilla: {
      pageIndex: 0, xIn: 5.10, yTopIn: 5.10,
      labelColIn: 0.50, toothColIn: 0.3125,   // 5.00 / 16
      rowHeightIn: 0.13, fieldWidthIn: 0.288, fieldHeightIn: 0.115,
      teeth: FELINE_MAXILLA_TEETH,
    },
    mandible: {
      pageIndex: 0, xIn: 5.10, yTopIn: 6.70,
      labelColIn: 0.50, toothColIn: 0.3571,   // 5.00 / 14 ≈ 0.357
      rowHeightIn: 0.13, fieldWidthIn: 0.332, fieldHeightIn: 0.115,
      teeth: FELINE_MANDIBLE_TEETH,
    },
  },
  'feline-deciduous': {
    maxilla: {
      pageIndex: 0, xIn: 5.10, yTopIn: 5.10,
      labelColIn: 0.50, toothColIn: 0.3571,   // 5.00 / 14 ≈ 0.357
      rowHeightIn: 0.13, fieldWidthIn: 0.332, fieldHeightIn: 0.115,
      teeth: FELINE_DECIDUOUS_MAXILLA_TEETH,
    },
    mandible: {
      pageIndex: 0, xIn: 5.10, yTopIn: 6.70,
      labelColIn: 0.50, toothColIn: 0.4167,   // 5.00 / 12 ≈ 0.417
      rowHeightIn: 0.13, fieldWidthIn: 0.387, fieldHeightIn: 0.115,
      teeth: FELINE_DECIDUOUS_MANDIBLE_TEETH,
    },
  },
};

export const TOOTH_DATA_ROWS: Array<{ label: string; suffix: string }> = [
  { label: 'Mobility', suffix: 'mob' },
  { label: 'Recession', suffix: 'rec' },
  { label: 'Pocket', suffix: 'poc' },
  { label: 'Furcation', suffix: 'fur' },
  { label: 'Hyperplasia', suffix: 'hyp' },
  { label: 'Calculus', suffix: 'cal' },
  { label: 'Gingivitis', suffix: 'gin' },
  { label: 'PD Stage', suffix: 'pds' },
];
