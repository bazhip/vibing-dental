import {
  PDFDocument,
  PDFForm,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import {
  DENTAL_CODES,
  DentalCode,
  findCodesInText,
} from '../constants/dentalCodes';
import download from 'downloadjs';
import {
  ToothData,
  PatientInfo,
  Species,
  DentalField,
  Logo,
  NerveBlocks,
  EMPTY_NERVE_BLOCKS,
  ExamFindings,
  ExamFinding,
  EMPTY_EXAM_FINDINGS,
  EXAM_ITEMS,
  ToothMarks,
  DiagramComment,
  DiagramStroke,
} from '../types';
import { getInitialToothData } from '../constants';
import {
  TOOTH_GRID_LAYOUTS,
  TOOTH_DATA_ROWS,
  ToothGridLayout,
} from '../constants/chartLayout';
// Style system (palette, font choices, section/table-header variants)
// lives in `./pdf/styles`. We re-export the public surface so existing
// imports from `'./pdfGenerator'` keep working.
import {
  PALETTE,
  ACTIVE,
  applyPdfStyle,
  FONT_MAP,
  PDF_STYLES,
  DEFAULT_PDF_STYLE_ID,
  type CommentStyle,
} from './pdf/styles';

export { PDF_STYLES, DEFAULT_PDF_STYLE_ID };
export type { CommentStyle };

export interface DiagramState {
  marks: ToothMarks;
  comments: DiagramComment[];
  strokes: DiagramStroke[];
}

export interface DiagramExport {
  state: DiagramState;
  png: Uint8Array;
}

const DIAGRAM_STATE_FIELD = 'diagrams';
const PT_PER_IN = 72;


// Section heading. Dispatches to a variant based on ACTIVE.sectionTitleVariant.
// Returns the y-coord just below the rendered title (whatever its shape).
function drawSectionTitle(
  page: PDFPage,
  title: string,
  xPt: number,
  yTopPt: number,
  widthPt: number,
  fontBold: PDFFont
): number {
  switch (ACTIVE.sectionTitleVariant) {
    case 'uppercase': {
      const fontSize = 8;
      page.drawText(title.toUpperCase(), {
        x: xPt, y: yTopPt - fontSize, size: fontSize,
        font: fontBold, color: PALETTE.primary,
      });
      const ruleY = yTopPt - fontSize - 3;
      page.drawLine({
        start: { x: xPt, y: ruleY }, end: { x: xPt + widthPt, y: ruleY },
        thickness: 0.7, color: PALETTE.primary,
      });
      return ruleY - 5;
    }
    case 'block': {
      const fontSize = 9;
      const blockH = fontSize + 8;
      page.drawRectangle({
        x: xPt, y: yTopPt - blockH, width: widthPt, height: blockH,
        color: PALETTE.primary,
      });
      page.drawText(title, {
        x: xPt + 6, y: yTopPt - blockH + 4,
        size: fontSize, font: fontBold, color: PALETTE.white,
      });
      return yTopPt - blockH - 4;
    }
    case 'serif': {
      // Italic serif look: bold serif title + small ornament + double rule
      const fontSize = 11;
      page.drawText(title, {
        x: xPt, y: yTopPt - fontSize, size: fontSize,
        font: fontBold, color: PALETTE.primary,
      });
      const ruleY1 = yTopPt - fontSize - 4;
      const ruleY2 = ruleY1 - 2;
      page.drawLine({
        start: { x: xPt, y: ruleY1 }, end: { x: xPt + widthPt, y: ruleY1 },
        thickness: 0.5, color: PALETTE.primary,
      });
      page.drawLine({
        start: { x: xPt, y: ruleY2 }, end: { x: xPt + widthPt * 0.35, y: ruleY2 },
        thickness: 0.3, color: PALETTE.primary,
      });
      return ruleY2 - 6;
    }
    case 'underline-only': {
      const fontSize = 9;
      page.drawText(title, {
        x: xPt, y: yTopPt - fontSize, size: fontSize,
        font: fontBold, color: PALETTE.ink,
      });
      const ruleY = yTopPt - fontSize - 2;
      const titleW = fontBold.widthOfTextAtSize(title, fontSize);
      page.drawLine({
        start: { x: xPt, y: ruleY }, end: { x: xPt + titleW, y: ruleY },
        thickness: 1.0, color: PALETTE.ink,
      });
      return ruleY - 6;
    }
    case 'hairline':
    default: {
      const fontSize = 9;
      page.drawText(title, {
        x: xPt, y: yTopPt - fontSize, size: fontSize,
        font: fontBold, color: PALETTE.ink,
      });
      const ruleY = yTopPt - fontSize - 5;
      page.drawLine({
        start: { x: xPt, y: ruleY }, end: { x: xPt + widthPt, y: ruleY },
        thickness: 0.4, color: PALETTE.borderStrong,
      });
      return ruleY - 6;
    }
  }
}

// Table header strip. Variants control whether there's a fill, a colored
// rule under it, or nothing at all (just the cell text).
function drawTableHeaderStrip(
  page: PDFPage,
  xPt: number,
  yBottomPt: number,
  widthPt: number,
  heightPt: number,
  cells: Array<{ text: string; xPt: number; widthPt: number; align?: 'left' | 'center' }>,
  font: PDFFont,
  fontSize: number
): void {
  const variant = ACTIVE.tableHeaderVariant;
  let textColor = PALETTE.ink;

  if (variant === 'dark') {
    page.drawRectangle({ x: xPt, y: yBottomPt, width: widthPt, height: heightPt, color: PALETTE.primary });
    textColor = PALETTE.white;
  } else if (variant === 'light') {
    page.drawRectangle({ x: xPt, y: yBottomPt, width: widthPt, height: heightPt, color: PALETTE.cellGray });
    page.drawLine({
      start: { x: xPt, y: yBottomPt }, end: { x: xPt + widthPt, y: yBottomPt },
      thickness: 0.6, color: PALETTE.borderStrong,
    });
  } else if (variant === 'underline-only') {
    page.drawLine({
      start: { x: xPt, y: yBottomPt }, end: { x: xPt + widthPt, y: yBottomPt },
      thickness: 1.0, color: PALETTE.primary,
    });
  } // 'none': no fill, no rule

  const baselineY = yBottomPt + (heightPt - fontSize) / 2 + 1.5;
  for (const cell of cells) {
    const align = cell.align ?? 'left';
    let drawX: number;
    if (align === 'center') {
      const w = font.widthOfTextAtSize(cell.text, fontSize);
      drawX = cell.xPt + (cell.widthPt - w) / 2;
    } else {
      drawX = cell.xPt + 5;
    }
    page.drawText(cell.text, { x: drawX, y: baselineY, size: fontSize, font, color: textColor });
  }
}

// A drawn (non-interactive) checkbox glyph: square outline + a clean
// two-stroke check mark when `checked` is true.
function drawCheckGlyph(page: PDFPage, x: number, y: number, size: number, checked: boolean): void {
  page.drawRectangle({
    x, y,
    width: size,
    height: size,
    borderColor: PALETTE.borderStrong,
    borderWidth: 0.6,
    color: PALETTE.white,
  });
  if (!checked) return;
  const pad = size * 0.22;
  const elbow = { x: x + size * 0.42, y: y + pad + 0.5 };
  page.drawLine({
    start: { x: x + pad, y: y + size * 0.55 },
    end:   elbow,
    thickness: 1.4,
    color: PALETTE.ink,
  });
  page.drawLine({
    start: elbow,
    end:   { x: x + size - pad, y: y + size - pad },
    thickness: 1.4,
    color: PALETTE.ink,
  });
}

// Single-line text that's hard-clipped with an ellipsis if it exceeds
// `maxWidthPt`. Used for static (non-interactive) form-style values.
function drawClippedText(
  page: PDFPage,
  text: string,
  x: number,
  baselineY: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  maxWidthPt: number
): void {
  if (!text) return;
  let display = text;
  if (font.widthOfTextAtSize(display, size) > maxWidthPt) {
    while (display.length > 0 && font.widthOfTextAtSize(display + '…', size) > maxWidthPt) {
      display = display.slice(0, -1);
    }
    display = display.trimEnd() + '…';
  }
  page.drawText(display, { x, y: baselineY, size, font, color });
}

// Multi-paragraph text: split on \n, wrap each paragraph to `widthPt`, draw
// each line. Returns the y-coordinate after the last line.
function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  yTopPt: number,
  widthPt: number,
  size: number,
  lineHeight: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  maxLines?: number
): number {
  if (!text) return yTopPt;
  const paragraphs = text.split('\n');
  let cursorY = yTopPt;
  let linesDrawn = 0;
  outer: for (const para of paragraphs) {
    if (!para.trim()) {
      cursorY -= lineHeight;
      continue;
    }
    const wrapped = wrapToWidth(para, font, size, widthPt);
    for (const line of wrapped) {
      if (maxLines !== undefined && linesDrawn >= maxLines) break outer;
      cursorY -= lineHeight;
      page.drawText(line, { x, y: cursorY, size, font, color });
      linesDrawn++;
    }
  }
  return cursorY;
}

function formatGeneratedAt(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

const hlineLight = (page: PDFPage, x1: number, x2: number, y: number) =>
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.4, color: PALETTE.border });
const vlineLight = (page: PDFPage, xv: number, y1: number, y2: number) =>
  page.drawLine({ start: { x: xv, y: y1 }, end: { x: xv, y: y2 }, thickness: 0.4, color: PALETTE.border });
const hlineStrong = (page: PDFPage, x1: number, x2: number, y: number) =>
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: PALETTE.borderStrong });
const vlineStrong = (page: PDFPage, xv: number, y1: number, y2: number) =>
  page.drawLine({ start: { x: xv, y: y1 }, end: { x: xv, y: y2 }, thickness: 0.6, color: PALETTE.borderStrong });

// Where each diagram lands on its page. heightIn is the target height,
// maxWidthIn caps the natural-aspect width so the diagram doesn't bleed
// into adjacent columns. The diagram is centered horizontally inside the
// column [xIn, xIn + columnWidthIn].
interface DiagramSlot {
  pageIndex: number;
  xIn: number;             // left edge of the centering column
  columnWidthIn: number;   // width of the column to center within
  yTopIn: number;
  heightIn: number;
  maxWidthIn: number;
}

// Diagrams are portrait-oriented (aspect ≈ 0.70 — width / height), so
// heightIn is the binding constraint. Solved budget per page:
//   yTopIn_diagram + heightIn + 0.10 (gap) + codes_height ≤ 8.10 (footer)
// For 20-code legends (height ~1.55in) this gives:
//   P1: heightIn ≤ 4.05 (limited by the higher header on page 1)
//   P2: heightIn ≤ 4.70 (16-18% bigger than the previous 4.00)
const DIAGRAM_SLOTS: Record<Species, [DiagramSlot, DiagramSlot]> = {
  canine: [
    // Page 1: starts just under the doctor-name underline (around 2.20in)
    // and runs to 6.50 — codes legend starts at 6.55 underneath.
    { pageIndex: 0, xIn: 0.30, columnWidthIn: 4.80, yTopIn: 2.25, heightIn: 4.25, maxWidthIn: 4.70 },
    // Page 2: pushed down ~0.2in so the diagram clears the nerve-block
    // table (which ends near 1.60in from page top). Bottom near 6.45.
    { pageIndex: 1, xIn: 0.30, columnWidthIn: 5.10, yTopIn: 1.75, heightIn: 4.70, maxWidthIn: 5.00 },
  ],
  feline: [
    { pageIndex: 0, xIn: 0.30, columnWidthIn: 4.80, yTopIn: 2.25, heightIn: 4.25, maxWidthIn: 4.70 },
    { pageIndex: 1, xIn: 0.30, columnWidthIn: 5.10, yTopIn: 1.75, heightIn: 4.70, maxWidthIn: 5.00 },
  ],
};

/** Collect every code that occurs across an arbitrary set of text sources,
 *  deduped and sorted in the source legend's natural order. */
function codesIn(...texts: Array<string | undefined>): DentalCode[] {
  const seen = new Set<string>();
  const result: DentalCode[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const c of findCodesInText(text)) {
      if (seen.has(c.code)) continue;
      seen.add(c.code);
      result.push(c);
    }
  }
  const indexOf = new Map<string, number>(DENTAL_CODES.map((c, i) => [c.code, i]));
  result.sort((a, b) => (indexOf.get(a.code) ?? 0) - (indexOf.get(b.code) ?? 0));
  return result;
}

/** Codes used per page. Page 1 holds the diagnosis-style content (chief
 *  complaint, pre-surgery diagram, tooth-grid values). Page 2 holds the
 *  procedure-style content (treatment & surgery report, post-surgery
 *  diagram). */
function collectUsedCodesByPage(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  preDiagram: DiagramExport,
  postDiagram: DiagramExport
): { page1: DentalCode[]; page2: DentalCode[] } {
  const toothFields: string[] = [];
  for (const t of toothData) {
    toothFields.push(
      t.mobility ?? '',
      t.recession ?? '',
      t.pocket ?? '',
      t.furcation ?? '',
      t.hyperplasia ?? '',
      t.calculus ?? '',
      t.gingivitis ?? '',
      t.pdstate ?? ''
    );
  }
  const preComments = preDiagram.state.comments.map((c) => c.text);
  const postComments = postDiagram.state.comments.map((c) => c.text);
  const examComments = Object.values(patientInfo.exam)
    .filter((v) => v.status === 'abnormal')
    .map((v) => v.comment);

  return {
    page1: codesIn(patientInfo.complaint, ...toothFields, ...preComments, ...examComments),
    page2: codesIn(patientInfo.treatmentReport, ...postComments),
  };
}

interface LegendBox {
  xIn: number;
  yTopIn: number;
  widthIn: number;
  heightIn: number;
}

const LEGEND_BOXES_BY_PAGE: LegendBox[] = [
  // Page 1: below the diagram (which ends near 6.45). Width caps at 4.70
  // (right-column tooth grids start at 5.10). Body fits 20 codes at
  // line-height 9.5pt + 2 columns.
  { xIn: 0.30, yTopIn: 6.55, widthIn: 4.70, heightIn: 1.55 },
  // Page 2: below the diagram (also ends near 6.45). Stops short of the
  // treatment-report column. Same height = 20 codes, plus a wider 3rd
  // column would fit ~30 if needed.
  { xIn: 0.30, yTopIn: 6.55, widthIn: 5.00, heightIn: 1.55 },
];

// Page-2 nerve-block table — total width = 1.95 + 0.55*2 = 3.05in. xIn is
// chosen so the table is centered horizontally over the page-2 diagram
// (diagram column from 0.30 to 5.40 → center at 2.85; nerve-block xIn =
// 2.85 - 3.05/2 = 1.325in). yTopIn is set so drawNerveBlockTable's section
// title — drawn 0.20in above the table — lines up with the
// treatment-report section title (which sits at yTopIn=0.30).
const NERVE_BLOCK_BOX = {
  pageIndex: 1,
  xIn: 1.325,
  yTopIn: 0.50,
  labelColIn: 1.95,
  valueColIn: 0.55,   // each side (right / left) gets a column of this width
  rowHeightIn: 0.22,
};

// Page-1 patient info box. The container chrome (borders, labels) and the
// editable text fields / checkboxes are all created by drawPatientInfoBox()
// — pdf-lib spawns the AcroForm fields with the same names the parser reads
// (date, patient/pid, doctor/tech, chief, awake, sedated, anesth) so the
// PDF stays interactive and round-trip is unchanged.
const PATIENT_INFO_BOX = {
  pageIndex: 0,
  xIn: 3.65,
  // Bumped 0.30 → 0.50 to leave room for the floating section title above
  // (title is drawn 0.20in above yTopIn).
  yTopIn: 0.50,
  labelColIn: 1.10,
  valueColIn: 2.40,
  rowDateIn: 0.22,
  rowPatientIn: 0.22,
  rowIdIn: 0.22,
  rowChiefIn: 0.50,
  rowAnesthIn: 0.25,
};

// Exam-comment slot for each abnormal row on page 1. yTopIn is the
// *baseline* of the first row (Extraoral) — derived from EXAM_TABLE_YTOP_IN
// + half the row height. rowHeightIn matches the exam table.
// Comments live in this column to the right of the exam labels. The actual
// y-position of each row's comment is computed from the cumulative row
// heights in drawExamSection (since each row's height varies based on
// whether its comment needs 1 or 2 lines).
const EXAM_COMMENT_BOX = {
  pageIndex: 0,
  xIn: 7.40,
  widthIn: 3.20,
  maxFontSizePt: 9,
  minFontSizePt: 5.5,
  lineHeightFactor: 1.18,
};

function wrapToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCodesLegend(
  page: PDFPage,
  region: LegendBox,
  codes: DentalCode[],
  bold: PDFFont,
  regular: PDFFont
): void {
  if (codes.length === 0) return;

  const { height: pageHeight } = page.getSize();
  const x = region.xIn * PT_PER_IN;
  const yTop = pageHeight - region.yTopIn * PT_PER_IN;
  const widthPt = region.widthIn * PT_PER_IN;
  const heightPt = region.heightIn * PT_PER_IN;

  const bodyStartY = drawSectionTitle(page, 'Codes Used', x, yTop, widthPt, bold);
  const bodyHeight = heightPt - (yTop - bodyStartY);

  // Switch to 3 columns when there's enough content that 2 would overflow.
  // 3-column layout shrinks the code badge + definition widths so it stays
  // readable even with many entries.
  const useThreeCols = codes.length > 18;
  const codeSize = useThreeCols ? 6.5 : 7;
  const lineHeight = useThreeCols ? 9 : 9.5;
  const cols = useThreeCols ? 3 : 2;
  const colGap = useThreeCols ? 8 : 12;
  const colWidth = (widthPt - colGap * (cols - 1)) / cols;
  const codeColWidth = useThreeCols ? 38 : 48;
  const defWidth = colWidth - codeColWidth - 4;
  // Balance between columns rather than filling col-1 first.
  const maxRowsPerCol = Math.max(1, Math.floor(bodyHeight / lineHeight));
  const rowsPerCol = Math.min(maxRowsPerCol, Math.ceil(codes.length / cols));

  let col = 0;
  let rowInCol = 0;
  for (const c of codes) {
    if (rowInCol >= rowsPerCol) {
      col++;
      rowInCol = 0;
      if (col >= cols) break;
    }
    const cx = x + col * (colWidth + colGap);
    const rowTop = bodyStartY - rowInCol * lineHeight;
    const cy = rowTop - lineHeight + 3; // baseline

    if (rowInCol % 2 === 1) {
      page.drawRectangle({
        x: cx - 2,
        y: rowTop - lineHeight,
        width: colWidth,
        height: lineHeight,
        color: PALETTE.rowAlt,
      });
    }

    page.drawText(c.code, {
      x: cx,
      y: cy,
      size: codeSize,
      font: bold,
      color: PALETTE.primary,
    });

    const defLines = wrapToWidth(c.definition, regular, codeSize, defWidth);
    const text = defLines[0] + (defLines.length > 1 ? '…' : '');
    page.drawText(text, {
      x: cx + codeColWidth,
      y: cy,
      size: codeSize,
      font: regular,
      color: PALETTE.text,
    });

    rowInCol++;
  }
}

function drawPatientInfoBox(
  _form: PDFForm,
  page: PDFPage,
  patientInfo: PatientInfo,
  _logo: Logo,
  font: PDFFont,
  fontBold: PDFFont
): void {
  const { height: pageHeight } = page.getSize();
  const x = PATIENT_INFO_BOX.xIn * PT_PER_IN;
  const yTop = pageHeight - PATIENT_INFO_BOX.yTopIn * PT_PER_IN;
  const labelW = PATIENT_INFO_BOX.labelColIn * PT_PER_IN;
  const valueW = PATIENT_INFO_BOX.valueColIn * PT_PER_IN;
  const totalW = labelW + valueW;

  type Row = {
    label: string;
    value?: string;
    multiline?: boolean;
    heightIn: number;
  };
  // Patient + PID for both logos — Doctor / Tech are shown above the patient
  // info box (in the logo header) for VCA.
  const rows: Row[] = [
    { label: 'Date',            value: patientInfo.date,          heightIn: PATIENT_INFO_BOX.rowDateIn },
    { label: 'Patient',         value: patientInfo.patientName,   heightIn: PATIENT_INFO_BOX.rowPatientIn },
    { label: 'PID',             value: patientInfo.patientNumber, heightIn: PATIENT_INFO_BOX.rowIdIn },
    { label: 'Chief Complaint', value: patientInfo.complaint, multiline: true, heightIn: PATIENT_INFO_BOX.rowChiefIn },
  ];
  const labeledRowsH = rows.reduce((acc, r) => acc + r.heightIn * PT_PER_IN, 0);
  const totalH = labeledRowsH;

  const labelFontSize = 7.5;
  const padX = 5;

  // Section title in the same style as the rest of the document — mixed-
  // case bold ink text with a hairline rule beneath, no shaded header bar.
  drawSectionTitle(page, 'Patient Information', x, yTop + 0.20 * PT_PER_IN, totalW, fontBold);

  // Soft outer rectangle (no internal column separator — labels and values
  // share alternating-row tints to read as a unified table).
  hlineLight(page, x, x + totalW, yTop);
  hlineLight(page, x, x + totalW, yTop - totalH);
  vlineLight(page, x, yTop, yTop - totalH);
  vlineLight(page, x + totalW, yTop, yTop - totalH);

  // Row separators (between each labeled row).
  let yCursor = yTop;
  for (let i = 0; i < rows.length - 1; i++) {
    yCursor -= rows[i].heightIn * PT_PER_IN;
    hlineLight(page, x, x + totalW, yCursor);
  }

  // Alternating row tints — every other row gets a subtle slate-50 fill.
  yCursor = yTop;
  for (let i = 0; i < rows.length; i++) {
    const rowH = rows[i].heightIn * PT_PER_IN;
    if (i % 2 === 1) {
      page.drawRectangle({
        x,
        y: yCursor - rowH,
        width: totalW,
        height: rowH,
        color: PALETTE.rowAlt,
      });
    }
    yCursor -= rowH;
  }

  // Labels + values per row (all static text — no AcroForm fields).
  yCursor = yTop;
  const valueFontSize = 9;
  for (const row of rows) {
    const rowH = row.heightIn * PT_PER_IN;
    const rowBottom = yCursor - rowH;

    const labelBaselineY = row.multiline
      ? yCursor - labelFontSize - 5
      : rowBottom + (rowH - labelFontSize) / 2 + 1.5;
    page.drawText(row.label, {
      x: x + padX,
      y: labelBaselineY,
      size: labelFontSize,
      font,
      color: PALETTE.muted,
    });

    if (row.value !== undefined) {
      const valueX = x + labelW + padX;
      const valueWidth = valueW - padX * 2;
      if (row.multiline) {
        // Chief complaint wraps to fit the value column. Drop down 4pt from
        // the row's top edge so the first line aligns with the label.
        drawWrappedText(
          page,
          row.value,
          valueX,
          yCursor - 4,
          valueWidth,
          valueFontSize,
          valueFontSize + 2.5,
          font,
          PALETTE.ink,
          3
        );
      } else {
        const baselineY = rowBottom + (rowH - valueFontSize) / 2 + 1.5;
        drawClippedText(page, row.value, valueX, baselineY, valueFontSize, font, PALETTE.ink, valueWidth);
      }
    }

    yCursor = rowBottom;
  }
}

// ============================================================================
// Logo + species title (page 1, top header strip)
// ----------------------------------------------------------------------------
// SoCal: logo top-left, "Margaret Smith, DVM, DAVDC" + horizontal rule below
// it, species title top-right.
// VCA: decorative "Patient Sticker" rectangle top-left, VCA logo top-right,
// species title below the logo.
// ============================================================================
async function drawLogoAndHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  logo: Logo,
  species: Species,
  doctorName: string,
  techName: string,
  font: PDFFont,
  fontBold: PDFFont
): Promise<void> {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const titleSize = 22;
  const subtitleSize = 9;
  const titleText = `${species === 'canine' ? 'Canine' : 'Feline'} Dental Chart`;
  const subtitleText = 'Periodontal Assessment & Treatment Plan';
  const logoWidthIn = 2.20;
  const logoWidth = logoWidthIn * PT_PER_IN;
  const logoUrl = logo === 'vca' ? 'logo_vca.png' : 'logo_socal.png';
  const logoLeftPt = 0.30 * PT_PER_IN;
  const logoTopPt = pageHeight - 0.35 * PT_PER_IN;

  // Logo top-left.
  const logoBytes = await fetch(logoUrl).then((r) => r.arrayBuffer());
  const png = await pdfDoc.embedPng(new Uint8Array(logoBytes));
  const logoHeight = logoWidth * (png.height / png.width);
  const logoBottomPt = logoTopPt - logoHeight;
  page.drawImage(png, {
    x: logoLeftPt,
    y: logoBottomPt,
    width: logoWidth,
    height: logoHeight,
  });

  // Doctor name sits 6pt below the logo (regardless of logo height) +
  // thin slate-900 underline directly under the doctor name. For VCA
  // charts a small "Tech: <name>" sub-line sits below the doctor name.
  const drNameSize = 11;
  const techSize = 8;
  const drNameTopGap = 8;
  const drNameBaselineY = logoBottomPt - drNameTopGap - drNameSize;
  page.drawText(doctorName, {
    x: logoLeftPt + 2,
    y: drNameBaselineY,
    size: drNameSize,
    font: fontBold,
    color: PALETTE.ink,
  });

  let underlineY = drNameBaselineY - 4;
  if (logo === 'vca' && techName.trim()) {
    const techBaselineY = drNameBaselineY - techSize - 4;
    page.drawText(`Tech: ${techName}`, {
      x: logoLeftPt + 2,
      y: techBaselineY,
      size: techSize,
      font,
      color: PALETTE.muted,
    });
    underlineY = techBaselineY - 4;
  }
  page.drawLine({
    start: { x: logoLeftPt,                  y: underlineY },
    end:   { x: logoLeftPt + 2.48 * PT_PER_IN, y: underlineY },
    thickness: 0.6,
    color: PALETTE.primary,
  });

  // Species title + subtitle, top-right.
  const titleW = fontBold.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, {
    x: pageWidth - 0.40 * PT_PER_IN - titleW,
    y: pageHeight - 0.55 * PT_PER_IN - titleSize,
    size: titleSize,
    font: fontBold,
    color: PALETTE.ink,
  });
  const subtitleW = font.widthOfTextAtSize(subtitleText, subtitleSize);
  page.drawText(subtitleText, {
    x: pageWidth - 0.40 * PT_PER_IN - subtitleW,
    y: pageHeight - 0.55 * PT_PER_IN - titleSize - subtitleSize - 4,
    size: subtitleSize,
    font,
    color: PALETTE.muted,
  });
}

// ============================================================================
// Exam table (page 1) — six rows of [N]/[A] checkbox pairs + label.
// Comments for abnormal rows are drawn separately by drawExamComments() so
// long notes get wrapped/clipped properly without overflowing the page.
// ============================================================================
const EXAM_TABLE_X_IN = 5.10;
const EXAM_TABLE_YTOP_IN = 2.30;   // clears the patient-info box (ends ~1.87)
const EXAM_ROW_SHORT_IN = 0.24;    // single-line height (no comment, or
                                    // comment fits on one line)
const EXAM_ROW_TALL_IN  = 0.42;    // two-line comment height

// Match the LaTeX label phrasing (no spaces around the slash).
const EXAM_PDF_LABELS: Record<string, string> = {
  extraoral: 'Extraoral/facial',
  lymph:     'Lymph nodes',
  buccal:    'Buccal mucosa',
  tongue:    'Tongue',
  palate:    'Palate',
  pharynx:   'Pharynx/Tonsils',
};

// Single-pass renderer for the oral-exam section: lays out each row's
// height dynamically based on whether the comment fits on one line or
// needs two, and draws the labels (left) + comment text (right) for each
// row at the right vertical positions.
function drawExamSection(
  page: PDFPage,
  exam: ExamFindings,
  font: PDFFont,
  fontBold: PDFFont
): void {
  const { height: pageHeight } = page.getSize();
  const fontSize = 9;
  const cbSize = 9;
  const xPt = EXAM_TABLE_X_IN * PT_PER_IN;
  const sectionWidth = (EXAM_COMMENT_BOX.xIn + EXAM_COMMENT_BOX.widthIn - EXAM_TABLE_X_IN) * PT_PER_IN;
  const commentXPt = EXAM_COMMENT_BOX.xIn * PT_PER_IN;
  const commentWidthPt = EXAM_COMMENT_BOX.widthIn * PT_PER_IN;

  // Section title above the rows.
  const titleYTop = pageHeight - (EXAM_TABLE_YTOP_IN - 0.20) * PT_PER_IN;
  drawSectionTitle(page, 'Oral Exam Findings', xPt, titleYTop, sectionWidth, fontBold);

  // Pre-compute per-row layouts so each row gets only the height it needs.
  type RowLayout = {
    heightPt: number;
    comment: { lines: string[]; fontSize: number; lineHeight: number } | null;
  };
  const layouts: RowLayout[] = EXAM_ITEMS.map(({ key }) => {
    const item = exam[key];
    if (item.status !== 'abnormal' || !item.comment.trim()) {
      return { heightPt: EXAM_ROW_SHORT_IN * PT_PER_IN, comment: null };
    }
    const cleaned = item.comment.replace(/\s+/g, ' ').trim();
    const { lines, fontSize: cFontSize } = fitTextToLines(
      cleaned,
      font,
      commentWidthPt,
      2,
      EXAM_COMMENT_BOX.maxFontSizePt,
      EXAM_COMMENT_BOX.minFontSizePt
    );
    const lineHeight = cFontSize * EXAM_COMMENT_BOX.lineHeightFactor;
    const heightIn = lines.length > 1 ? EXAM_ROW_TALL_IN : EXAM_ROW_SHORT_IN;
    return { heightPt: heightIn * PT_PER_IN, comment: { lines, fontSize: cFontSize, lineHeight } };
  });

  let cursorY = pageHeight - EXAM_TABLE_YTOP_IN * PT_PER_IN;
  for (let i = 0; i < EXAM_ITEMS.length; i++) {
    const { key } = EXAM_ITEMS[i];
    const item = exam[key];
    const layout = layouts[i];
    const rowTopY = cursorY;
    const rowBottomY = cursorY - layout.heightPt;
    const rowMidY = (rowTopY + rowBottomY) / 2;
    const cbY = rowMidY - cbSize / 2;
    const labelY = rowMidY - fontSize / 2 + 1.5;

    // Subtle alternating row tint for visual rhythm.
    if (i % 2 === 1) {
      page.drawRectangle({
        x: xPt,
        y: rowBottomY,
        width: sectionWidth,
        height: layout.heightPt,
        color: PALETTE.rowAlt,
      });
    }

    // Status glyphs + N/A labels.
    let glyphX = xPt;
    drawCheckGlyph(page, glyphX, cbY, cbSize, item.status === 'normal');
    glyphX += cbSize + 4;
    page.drawText('N', { x: glyphX, y: labelY, size: fontSize, font, color: PALETTE.muted });
    glyphX += font.widthOfTextAtSize('N', fontSize) + 14;

    drawCheckGlyph(page, glyphX, cbY, cbSize, item.status === 'abnormal');
    glyphX += cbSize + 4;
    page.drawText('A', { x: glyphX, y: labelY, size: fontSize, font, color: PALETTE.muted });
    glyphX += font.widthOfTextAtSize('A', fontSize) + 12;

    // Vertical divider before the label so each row reads as distinct cells.
    vlineLight(page, glyphX - 4, rowTopY - 2, rowBottomY + 2);

    // Label text — bold when abnormal so the eye snaps to the rows that matter.
    const labelText = EXAM_PDF_LABELS[key] ?? key;
    page.drawText(labelText, {
      x: glyphX,
      y: labelY,
      size: fontSize,
      font: item.status === 'abnormal' ? fontBold : font,
      color: item.status === 'abnormal' ? PALETTE.ink : PALETTE.text,
    });

    // Comment text (right side) — vertically centered to the row, drawn
    // line-by-line with the auto-shrunk font we computed above.
    if (layout.comment) {
      const { lines, fontSize: cSize, lineHeight } = layout.comment;
      const blockHeight = lines.length * lineHeight;
      const blockTopY = rowMidY + blockHeight / 2;
      for (let j = 0; j < lines.length; j++) {
        const baselineY = blockTopY - (j + 1) * lineHeight + (lineHeight - cSize) / 2;
        page.drawText(lines[j], {
          x: commentXPt,
          y: baselineY,
          size: cSize,
          font,
          color: PALETTE.text,
        });
      }
    }

    cursorY = rowBottomY;
  }

  // Bottom rule for visual closure.
  hlineLight(page, xPt, xPt + sectionWidth, cursorY);
}

// ============================================================================
// Tooth grids (maxilla + mandible). Each grid is a 10-row table (Tooth header,
// Triadan header, then 8 data rows for Mob/Rec/Poc/Fur/Hyp/Cal/Gin/PDS) with
// one form text field per (tooth × data-row) cell. Field names match the
// existing parser convention `g{triadan}{suffix}`.
// ============================================================================
const SUFFIX_TO_FIELD: Record<string, DentalField> = {
  mob: 'mobility',
  rec: 'recession',
  poc: 'pocket',
  fur: 'furcation',
  hyp: 'hyperplasia',
  cal: 'calculus',
  gin: 'gingivitis',
  pds: 'pdstate',
};

function drawCenteredText(
  page: PDFPage,
  text: string,
  x1: number,
  x2: number,
  baselineY: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>
): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: x1 + (x2 - x1 - w) / 2,
    y: baselineY,
    size,
    font,
    color,
  });
}

function drawToothGrid(
  _form: PDFForm,
  page: PDFPage,
  layout: ToothGridLayout,
  toothData: ToothData[],
  font: PDFFont,
  fontBold: PDFFont,
  archTitle: string
): void {
  const { height: pageHeight } = page.getSize();
  const x = layout.xIn * PT_PER_IN;
  const yTop = pageHeight - layout.yTopIn * PT_PER_IN;
  const labelW = layout.labelColIn * PT_PER_IN;
  const toothW = layout.toothColIn * PT_PER_IN;
  const rowH = layout.rowHeightIn * PT_PER_IN;
  const totalW = labelW + toothW * layout.teeth.length;
  const headerSize = 6;
  const labelSize = 6;

  const totalRows = 2 + TOOTH_DATA_ROWS.length;
  const totalH = rowH * totalRows;

  // Section title above the grid. 0.26in of clearance above the grid top
  // so the descenders / rule of the title don't get clipped by whatever
  // drew above (matches the exam-table title's breathing room).
  drawSectionTitle(page, archTitle, x, yTop + 0.26 * PT_PER_IN, totalW, fontBold);

  // Two header rows in a soft slate-50 fill, dark text.
  page.drawRectangle({
    x,
    y: yTop - rowH * 2,
    width: totalW,
    height: rowH * 2,
    color: PALETTE.cellGray,
  });
  // Data rows: alternating tint behind data cells (skipping the gray label
  // column, which gets its own fill).
  for (let r = 0; r < TOOTH_DATA_ROWS.length; r++) {
    if (r % 2 === 1) {
      page.drawRectangle({
        x: x + labelW,
        y: yTop - rowH * (3 + r),
        width: totalW - labelW,
        height: rowH,
        color: PALETTE.rowAlt,
      });
    }
    // Data row label cell (always tinted).
    page.drawRectangle({
      x,
      y: yTop - rowH * (3 + r),
      width: labelW,
      height: rowH,
      color: PALETTE.cellGray,
    });
  }

  // Gridlines.
  for (let r = 0; r <= totalRows; r++) {
    hlineLight(page, x, x + totalW, yTop - r * rowH);
  }
  vlineLight(page, x, yTop, yTop - totalH);
  vlineLight(page, x + labelW, yTop, yTop - totalH);
  for (let c = 1; c <= layout.teeth.length; c++) {
    vlineLight(page, x + labelW + c * toothW, yTop, yTop - totalH);
  }
  // Strong outer rectangle.
  hlineStrong(page, x, x + totalW, yTop);
  hlineStrong(page, x, x + totalW, yTop - totalH);
  vlineStrong(page, x, yTop, yTop - totalH);
  vlineStrong(page, x + totalW, yTop, yTop - totalH);
  // Strong rule below the header rows.
  hlineStrong(page, x, x + totalW, yTop - rowH * 2);

  const baselineForRow = (rowIdx: number, fontSize: number) =>
    yTop - rowIdx * rowH - rowH / 2 - fontSize / 2 + 1.5;

  // Header text — slate-900 emphasis on the slate-50 fill.
  drawCenteredText(page, 'Tooth',   x, x + labelW, baselineForRow(0, headerSize), headerSize, fontBold, PALETTE.ink);
  drawCenteredText(page, 'Triadan', x, x + labelW, baselineForRow(1, headerSize), headerSize, fontBold, PALETTE.ink);
  for (let i = 0; i < layout.teeth.length; i++) {
    const tooth = layout.teeth[i];
    const cellLeft = x + labelW + i * toothW;
    const cellRight = cellLeft + toothW;
    drawCenteredText(page, tooth.abbr,            cellLeft, cellRight, baselineForRow(0, headerSize), headerSize, fontBold, PALETTE.ink);
    drawCenteredText(page, String(tooth.triadan), cellLeft, cellRight, baselineForRow(1, headerSize), headerSize, font,     PALETTE.muted);
  }

  // Data rows — values are drawn statically (no AcroForm fields).
  const cellFontSize = 6.5;
  for (let r = 0; r < TOOTH_DATA_ROWS.length; r++) {
    const dataRow = TOOTH_DATA_ROWS[r];
    const rowIdx = 2 + r;

    drawCenteredText(page, dataRow.label, x, x + labelW, baselineForRow(rowIdx, labelSize), labelSize, fontBold, PALETTE.muted);

    const fieldKey = SUFFIX_TO_FIELD[dataRow.suffix];
    for (let i = 0; i < layout.teeth.length; i++) {
      const tooth = layout.teeth[i];
      const td = toothData.find((t) => t.triadan === tooth.triadan);
      const value = td ? (td[fieldKey] ?? '') : '';
      if (!value) continue;

      const cellLeft = x + labelW + i * toothW;
      const cellRight = cellLeft + toothW;
      drawCenteredText(
        page,
        value,
        cellLeft,
        cellRight,
        baselineForRow(rowIdx, cellFontSize),
        cellFontSize,
        font,
        PALETTE.ink
      );
    }
  }
}

// ============================================================================
// Treatment & Surgery Report (page 2 right column) — header + multiline
// AcroForm TextField that fills the right half of the page.
// ============================================================================
const TREATMENT_REPORT = {
  pageIndex: 1,
  xIn: 5.50,
  headerYTopIn: 0.30,
  fieldYTopIn: 0.50,
  fieldWidthIn: 5.10,    // ~half the page (page is 11in wide; right margin 0.40)
  fieldHeightIn: 7.50,
};

function drawTreatmentReportField(
  _form: PDFForm,
  page: PDFPage,
  value: string,
  font: PDFFont,
  fontBold: PDFFont
): void {
  const { height: pageHeight } = page.getSize();
  const xPt = TREATMENT_REPORT.xIn * PT_PER_IN;
  const titleYTopPt = pageHeight - TREATMENT_REPORT.headerYTopIn * PT_PER_IN;
  const fieldW = TREATMENT_REPORT.fieldWidthIn * PT_PER_IN;
  const fieldH = TREATMENT_REPORT.fieldHeightIn * PT_PER_IN;

  drawSectionTitle(page, 'Treatment & Surgery Report', xPt, titleYTopPt, fieldW, fontBold);

  // Outlined "writing surface" panel — visual only, no input field.
  const fieldY = pageHeight - (TREATMENT_REPORT.fieldYTopIn + TREATMENT_REPORT.fieldHeightIn) * PT_PER_IN;
  page.drawRectangle({
    x: xPt,
    y: fieldY,
    width: fieldW,
    height: fieldH,
    borderColor: PALETTE.border,
    borderWidth: 0.6,
  });

  // Static wrapped text inside the panel.
  if (value) {
    const innerX = xPt + 8;
    const innerYTop = fieldY + fieldH - 8;
    const innerWidth = fieldW - 16;
    const fontSize = 9.5;
    const lineHeight = fontSize * 1.45;
    drawWrappedText(
      page,
      value,
      innerX,
      innerYTop,
      innerWidth,
      fontSize,
      lineHeight,
      font,
      PALETTE.ink
    );
  }
}

// ============================================================================
// Footer with a thin colored rule, page indicator (right) and generation
// timestamp (left).
// ============================================================================
function drawFooter(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  pageNum: number,
  totalPages: number,
  generatedAt: string
): void {
  const { width: pageWidth } = page.getSize();
  const fontSize = 7;
  const ruleY = 0.40 * PT_PER_IN;

  // Subtle full-width rule.
  page.drawLine({
    start: { x: 0.30 * PT_PER_IN, y: ruleY },
    end:   { x: pageWidth - 0.30 * PT_PER_IN, y: ruleY },
    thickness: 0.4,
    color: PALETTE.border,
  });

  // Generation timestamp on the left, in muted gray.
  page.drawText(`Generated ${generatedAt}`, {
    x: 0.30 * PT_PER_IN,
    y: 0.22 * PT_PER_IN,
    size: fontSize,
    font,
    color: PALETTE.muted,
  });

  // "Page X of Y" on the right; the X is bold-emphasized.
  const pageNumStr = `${pageNum}`;
  const ofStr = ` of ${totalPages}`;
  const pageW = fontBold.widthOfTextAtSize(pageNumStr, fontSize);
  const ofW = font.widthOfTextAtSize(ofStr, fontSize);
  const totalW = pageW + ofW + font.widthOfTextAtSize('Page ', fontSize);
  let cursor = pageWidth - 0.30 * PT_PER_IN - totalW;
  page.drawText('Page ', {
    x: cursor,
    y: 0.22 * PT_PER_IN,
    size: fontSize,
    font,
    color: PALETTE.muted,
  });
  cursor += font.widthOfTextAtSize('Page ', fontSize);
  page.drawText(pageNumStr, {
    x: cursor,
    y: 0.22 * PT_PER_IN,
    size: fontSize,
    font: fontBold,
    color: PALETTE.primary,
  });
  cursor += pageW;
  page.drawText(ofStr, {
    x: cursor,
    y: 0.22 * PT_PER_IN,
    size: fontSize,
    font,
    color: PALETTE.muted,
  });
}

function drawNerveBlockTable(
  page: PDFPage,
  nerveBlocks: NerveBlocks,
  bold: PDFFont,
  regular: PDFFont,
  isVca: boolean
): void {
  const { height: pageHeight } = page.getSize();
  const x = NERVE_BLOCK_BOX.xIn * PT_PER_IN;
  const yTop = pageHeight - NERVE_BLOCK_BOX.yTopIn * PT_PER_IN;
  const labelW = NERVE_BLOCK_BOX.labelColIn * PT_PER_IN;
  const valueW = NERVE_BLOCK_BOX.valueColIn * PT_PER_IN;
  const totalW = labelW + valueW * 2;
  const rowH = NERVE_BLOCK_BOX.rowHeightIn * PT_PER_IN;
  const headerSize = 8;
  const bodySize = 7.5;
  const padX = 5;

  // Three L/R rows (named blocks shown as `<value> mL`) + a single
  // full-width free-text "Other" row.
  type LR = { kind: 'lr'; label: string; right: string; left: string };
  type Free = { kind: 'free'; label: string; value: string };
  const rows: Array<LR | Free> = [
    { kind: 'lr',  label: 'Infraorbital',      right: nerveBlocks.infraorbitalRight     || '', left: nerveBlocks.infraorbitalLeft     || '' },
    { kind: 'lr',  label: 'Inferior Alveolar', right: nerveBlocks.inferiorAlveolarRight || '', left: nerveBlocks.inferiorAlveolarLeft || '' },
    { kind: 'lr',  label: 'Mental',            right: nerveBlocks.mentalRight           || '', left: nerveBlocks.mentalLeft           || '' },
    { kind: 'free', label: 'Other',            value: nerveBlocks.other                 || '' },
  ];

  // Section title floats above the table.
  drawSectionTitle(page, 'Anesthesia · Nerve Blocks', x, yTop + 0.20 * PT_PER_IN, totalW, bold);

  const headerLabel = `Nerve Block 0.5% ${isVca ? 'Ropivacaine' : 'Bupivacaine'}`;

  // Header strip — auto-shrink the agent-name text if it would overflow
  // the label column (paranoid but cheap).
  let headerLabelSize = headerSize;
  const headerMaxWidth = labelW - padX * 2;
  while (headerLabelSize > 6 && bold.widthOfTextAtSize(headerLabel, headerLabelSize) > headerMaxWidth) {
    headerLabelSize -= 0.25;
  }
  drawTableHeaderStrip(page, x, yTop - rowH, totalW, rowH, [
    { text: headerLabel, xPt: x,                    widthPt: labelW, align: 'left' },
    { text: 'RIGHT',     xPt: x + labelW,           widthPt: valueW, align: 'center' },
    { text: 'LEFT',      xPt: x + labelW + valueW,  widthPt: valueW, align: 'center' },
  ], bold, headerLabelSize);

  // Alternating row tints behind body rows.
  for (let i = 0; i < rows.length; i++) {
    if (i % 2 === 1) {
      page.drawRectangle({
        x,
        y: yTop - rowH * (i + 2),
        width: totalW,
        height: rowH,
        color: PALETTE.rowAlt,
      });
    }
  }

  // Borders. Vertical column dividers run only through the L/R rows; the
  // free-text Other row spans both value columns.
  const totalRows = rows.length + 1;
  const totalH = rowH * totalRows;
  for (let i = 1; i < totalRows; i++) {
    hlineLight(page, x, x + totalW, yTop - rowH * i);
  }
  // L/R rows live between yTop-rowH (after header) and the start of the
  // free row at yTop - rowH*(rows.length).
  const lrBottomY = yTop - rowH * rows.length;
  vlineLight(page, x + labelW,          yTop - rowH, lrBottomY);
  vlineLight(page, x + labelW + valueW, yTop - rowH, lrBottomY);
  // Strong outer border.
  hlineStrong(page, x, x + totalW, yTop);
  hlineStrong(page, x, x + totalW, yTop - totalH);
  vlineStrong(page, x,           yTop, yTop - totalH);
  vlineStrong(page, x + totalW,  yTop, yTop - totalH);

  // Body rows.
  const baselineOffset = (rowH - bodySize) / 2 + 1.5;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowY = yTop - rowH * (i + 2);
    const baselineY = rowY + baselineOffset;

    page.drawText(row.label, {
      x: x + padX,
      y: baselineY,
      size: bodySize,
      font: regular,
      color: PALETTE.text,
    });

    if (row.kind === 'lr') {
      for (const [colIdx, raw] of [[1, row.right], [2, row.left]] as const) {
        if (!raw) continue;
        const text = `${raw} mL`;
        const colX = x + labelW + valueW * (colIdx - 1);
        const w = regular.widthOfTextAtSize(text, bodySize);
        page.drawText(text, {
          x: colX + (valueW - w) / 2,
          y: baselineY,
          size: bodySize,
          font: regular,
          color: PALETTE.ink,
        });
      }
    } else {
      // Free-text spans both value columns. Hard-clip with an ellipsis if
      // the user's text is wider than the available room.
      if (row.value) {
        const valueX = x + labelW + padX;
        const valueWidth = (totalW - labelW) - padX * 2;
        drawClippedText(page, row.value, valueX, baselineY, bodySize, regular, PALETTE.ink, valueWidth);
      }
    }
  }
}

// Find the largest font size at which `text` fits in <= maxLines lines of
// width `widthPt`. Returns the chosen size + the wrapped lines. If even the
// minimum size needs more than maxLines lines, the last visible line is
// hard-clipped with an ellipsis so the row never overflows.
function fitTextToLines(
  text: string,
  font: PDFFont,
  widthPt: number,
  maxLines: number,
  maxSize: number,
  minSize: number
): { lines: string[]; fontSize: number } {
  for (let size = maxSize; size >= minSize; size -= 0.25) {
    const lines = wrapToWidth(text, font, size, widthPt);
    if (lines.length <= maxLines) return { lines, fontSize: size };
  }
  const lines = wrapToWidth(text, font, minSize, widthPt).slice(0, maxLines);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 0 && font.widthOfTextAtSize(last + '…', minSize) > widthPt) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last.trimEnd() + '…';
  }
  return { lines, fontSize: minSize };
}

async function drawDiagramAt(
  pdfDoc: PDFDocument,
  slot: DiagramSlot,
  pngBytes: Uint8Array
): Promise<void> {
  const page = pdfDoc.getPage(slot.pageIndex);
  const { height: pageHeight } = page.getSize();
  const png = await pdfDoc.embedPng(pngBytes);
  const aspect = png.width / png.height;
  let heightPt = slot.heightIn * PT_PER_IN;
  let widthPt = heightPt * aspect;
  const maxWidthPt = slot.maxWidthIn * PT_PER_IN;
  if (widthPt > maxWidthPt) {
    widthPt = maxWidthPt;
    heightPt = widthPt / aspect;
  }
  const colLeftPt = slot.xIn * PT_PER_IN;
  const colWidthPt = slot.columnWidthIn * PT_PER_IN;
  const x = colLeftPt + (colWidthPt - widthPt) / 2;
  const yTop = pageHeight - slot.yTopIn * PT_PER_IN;
  page.drawImage(png, { x, y: yTop - heightPt, width: widthPt, height: heightPt });
}

// Maps NerveBlocks keys → PDF form field names. Used only by the legacy
// parser path; the Other field has no PDF form field equivalent any more
// (it's a free-text single field), so it's handled separately.
const NERVE_BLOCK_FIELDS: Array<[Exclude<keyof NerveBlocks, 'other'>, string]> = [
  ['infraorbitalRight', 'nbior'],
  ['infraorbitalLeft', 'nbiol'],
  ['inferiorAlveolarRight', 'nbiar'],
  ['inferiorAlveolarLeft', 'nbial'],
  ['mentalRight', 'nbmenr'],
  ['mentalLeft', 'nbmenl'],
];

const DENTAL_FIELDS: DentalField[] = [
  'mobility',
  'recession',
  'pocket',
  'furcation',
  'hyperplasia',
  'calculus',
  'gingivitis',
  'pdstate',
];

// LaTeX/hyperref strips underscores from PDF form field names, so the names in
// the compiled template are e.g. "g110mob" rather than "g_110_mob".
// Maps internal DentalField → 3-char suffix used in the chart's form fields.
const FIELD_SUFFIX: Record<DentalField, string> = {
  mobility: 'mob',
  recession: 'rec',
  pocket: 'poc',
  furcation: 'fur',
  hyperplasia: 'hyp',
  calculus: 'cal',
  gingivitis: 'gin',
  pdstate: 'pds',
};

function readCheckBox(form: PDFForm, name: string): boolean {
  try {
    return form.getCheckBox(name).isChecked();
  } catch {
    return false;
  }
}

function readExamFindings(form: PDFForm): ExamFindings {
  const result: ExamFindings = {
    extraoral: { ...EMPTY_EXAM_FINDINGS.extraoral },
    lymph:     { ...EMPTY_EXAM_FINDINGS.lymph },
    buccal:    { ...EMPTY_EXAM_FINDINGS.buccal },
    tongue:    { ...EMPTY_EXAM_FINDINGS.tongue },
    palate:    { ...EMPTY_EXAM_FINDINGS.palate },
    pharynx:   { ...EMPTY_EXAM_FINDINGS.pharynx },
  };
  for (const { key, pdfName } of EXAM_ITEMS) {
    const normal = readCheckBox(form, `ex${pdfName}N`);
    const abnormal = readCheckBox(form, `ex${pdfName}A`);
    let status: ExamFinding = '';
    if (normal && !abnormal) status = 'normal';
    else if (abnormal && !normal) status = 'abnormal';
    result[key] = {
      status,
      comment: readTextField(form, `ex${pdfName}C`),
    };
  }
  return result;
}

// All form fields (patient info, treatment report, tooth grid, exam status,
// awake/sedated/anesth) are created and populated together by their dynamic
// draw helpers — there's no longer a separate "fill" pass after loading a
// template, because there's no template to load.

export interface ParsedChart {
  patientInfo: PatientInfo;
  toothData: ToothData[];
  species: Species;
  logo: Logo;
  preDiagram?: DiagramState;
  postDiagram?: DiagramState;
}

const EMPTY_DIAGRAM_STATE: DiagramState = { marks: {}, comments: [], strokes: [] };

interface StashedState {
  pre?: DiagramState;
  post?: DiagramState;
  nerveBlocks?: NerveBlocks;
  exam?: ExamFindings;
  // Full chart state for non-interactive PDFs. When present, the parser
  // recovers everything from these fields and skips reading AcroForm
  // widgets entirely (the new generator doesn't create any).
  patientInfo?: PatientInfo;
  toothData?: ToothData[];
  species?: Species;
  logo?: Logo;
}

function readStashedState(form: PDFForm): StashedState {
  try {
    const raw = form.getTextField(DIAGRAM_STATE_FIELD).getText();
    if (!raw) return {};
    return JSON.parse(raw) as StashedState;
  } catch {
    return {};
  }
}

function readTextField(form: PDFForm, name: string): string {
  try {
    return form.getTextField(name).getText() ?? '';
  } catch {
    return '';
  }
}

function hasTextField(form: PDFForm, name: string): boolean {
  try {
    form.getTextField(name);
    return true;
  } catch {
    return false;
  }
}

export async function parseDentalChartPDF(file: File): Promise<ParsedChart> {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const stash = readStashedState(form);

  // ---- Modern format ----------------------------------------------------
  // The current generator embeds the entire chart state in the JSON stash
  // and renders the visible PDF as static (non-interactive) content. If
  // that payload is present, recover from it directly and we're done.
  if (stash.patientInfo && stash.toothData && stash.species && stash.logo) {
    return {
      patientInfo: stash.patientInfo,
      toothData: stash.toothData,
      species: stash.species,
      logo: stash.logo,
      preDiagram: stash.pre ?? EMPTY_DIAGRAM_STATE,
      postDiagram: stash.post ?? EMPTY_DIAGRAM_STATE,
    };
  }

  // ---- Legacy format ----------------------------------------------------
  // Older PDFs (pre-static refactor) carried the values as AcroForm fields,
  // with only the diagram state + nerve blocks + exam comments in the
  // stash. Read them out the old way for backwards compat on uploads.
  const logo: Logo = hasTextField(form, 'doctor') ? 'vca' : 'socal';
  const species: Species =
    hasTextField(form, 'g110mob') || hasTextField(form, 'g311mob') ? 'canine' : 'feline';

  const patientName =
    logo === 'vca' ? readTextField(form, 'doctor') : readTextField(form, 'patient');
  const patientNumber =
    logo === 'vca' ? readTextField(form, 'tech') : readTextField(form, 'pid');

  const nerveBlocks: NerveBlocks = stash.nerveBlocks
    ? { ...EMPTY_NERVE_BLOCKS, ...stash.nerveBlocks }
    : (() => {
        const fallback: NerveBlocks = { ...EMPTY_NERVE_BLOCKS };
        for (const [key, fieldName] of NERVE_BLOCK_FIELDS) {
          fallback[key] = readTextField(form, fieldName);
        }
        // Combine legacy nbothr / nbothl form fields (which existed before
        // "Other" became single free-text) into the new `other` field.
        const legacyOther = [readTextField(form, 'nbothr'), readTextField(form, 'nbothl')]
          .filter(Boolean)
          .join(' / ');
        fallback.other = legacyOther;
        return fallback;
      })();

  const examFromCheckboxes = readExamFindings(form);
  const exam: ExamFindings = (() => {
    if (!stash.exam) return examFromCheckboxes;
    const merged = { ...examFromCheckboxes };
    for (const { key } of EXAM_ITEMS) {
      const stashed = stash.exam[key];
      if (stashed) {
        merged[key] = {
          status: stashed.status || examFromCheckboxes[key].status,
          comment: stashed.comment ?? examFromCheckboxes[key].comment,
        };
      }
    }
    return merged;
  })();

  // Legacy VCA PDFs stored doctor/tech in the same `doctor`/`tech` form
  // fields and patient/PID in `patient`/`pid`. New VCA charts have
  // dedicated doctor/tech keys; legacy ones don't, so we recover the
  // doctor/tech values from the legacy form fields when present.
  const legacyDoctor = readTextField(form, 'doctor');
  const legacyTech   = readTextField(form, 'tech');
  const patientInfo: PatientInfo = {
    date: readTextField(form, 'date'),
    patientName,
    patientNumber,
    doctor: logo === 'vca' ? legacyDoctor : 'Dr. Margaret Smith, DVM, DAVDC',
    tech:   logo === 'vca' ? legacyTech   : '',
    complaint: readTextField(form, 'chief'),
    treatmentReport: readTextField(form, 'treatmentreport'),
    nerveBlocks,
    exam,
  };

  const toothData = getInitialToothData(species).map((tooth) => {
    const updates: Partial<ToothData> = {};
    for (const field of DENTAL_FIELDS) {
      const value = readTextField(form, `g${tooth.triadan}${FIELD_SUFFIX[field]}`);
      if (value) updates[field] = value;
    }
    return { ...tooth, ...updates };
  });

  return {
    patientInfo,
    toothData,
    species,
    logo,
    preDiagram: stash.pre ?? EMPTY_DIAGRAM_STATE,
    postDiagram: stash.post ?? EMPTY_DIAGRAM_STATE,
  };
}

// Landscape US Letter page dimensions in points (11×8.5in × 72pt/in).
const PAGE_WIDTH_PT = 11 * PT_PER_IN;
const PAGE_HEIGHT_PT = 8.5 * PT_PER_IN;

/**
 * Build the PDF as raw bytes — used by both the download path and the
 * preview iframe. Accepts an optional style id so the preview can swap
 * presets without re-capturing diagrams.
 */
export async function buildDentalChartPDFBytes(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  species: Species,
  logo: Logo,
  preDiagram: DiagramExport,
  postDiagram: DiagramExport,
  styleId: string = DEFAULT_PDF_STYLE_ID
): Promise<Uint8Array> {
  const style = PDF_STYLES.find((s) => s.id === styleId) ?? PDF_STYLES[0];
  applyPdfStyle(style);

  const pdfDoc = await PDFDocument.create();
  const page1 = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
  const page2 = pdfDoc.addPage([PAGE_WIDTH_PT, PAGE_HEIGHT_PT]);
  const form = pdfDoc.getForm();

  // Font selection follows the active style (sans / serif / mono).
  const fontIds = FONT_MAP[ACTIVE.fontFamilyKey];
  const helvetica = await pdfDoc.embedFont(fontIds.regular);
  const helveticaBold = await pdfDoc.embedFont(fontIds.bold);

  const generatedAt = formatGeneratedAt(new Date());

  // ---- Page 1 ------------------------------------------------------------
  // For SoCal the doctor-line is the practice's signature ("Margaret Smith,
  // DVM, DAVDC"); for VCA it's whatever the user typed in the webapp.
  const doctorLine =
    logo === 'vca' ? (patientInfo.doctor || 'Dr. Margaret Smith, DVM, DAVDC') : 'Margaret Smith, DVM, DAVDC';
  const techLine = logo === 'vca' ? patientInfo.tech : '';
  await drawLogoAndHeader(pdfDoc, page1, logo, species, doctorLine, techLine, helvetica, helveticaBold);
  drawPatientInfoBox(form, page1, patientInfo, logo, helvetica, helveticaBold);
  drawExamSection(page1, patientInfo.exam, helvetica, helveticaBold);
  drawToothGrid(form, page1, TOOTH_GRID_LAYOUTS[species].maxilla,  toothData, helvetica, helveticaBold, 'Maxillary Arch');
  drawToothGrid(form, page1, TOOTH_GRID_LAYOUTS[species].mandible, toothData, helvetica, helveticaBold, 'Mandibular Arch');
  await drawDiagramAt(pdfDoc, DIAGRAM_SLOTS[species][0], preDiagram.png);
  drawFooter(page1, helvetica, helveticaBold, 1, 2, generatedAt);

  // ---- Page 2 ------------------------------------------------------------
  drawNerveBlockTable(page2, patientInfo.nerveBlocks, helveticaBold, helvetica, logo === 'vca');
  await drawDiagramAt(pdfDoc, DIAGRAM_SLOTS[species][1], postDiagram.png);
  drawTreatmentReportField(form, page2, patientInfo.treatmentReport, helvetica, helveticaBold);
  drawFooter(page2, helvetica, helveticaBold, 2, 2, generatedAt);

  // ---- Codes-used legends (both pages) -----------------------------------
  const usedByPage = collectUsedCodesByPage(patientInfo, toothData, preDiagram, postDiagram);
  const pageCodes = [usedByPage.page1, usedByPage.page2];
  for (let i = 0; i < 2; i++) {
    drawCodesLegend(
      pdfDoc.getPage(i),
      LEGEND_BOXES_BY_PAGE[i],
      pageCodes[i],
      helveticaBold,
      helvetica
    );
  }

  // ---- Hidden round-trip stash -------------------------------------------
  // The PDF itself is a static print artifact — every value (patient info,
  // tooth grid, exam, nerve blocks, diagrams) lives only in this JSON
  // payload, which the parser uses to rehydrate the webapp on upload.
  const stateJson = JSON.stringify({
    pre: preDiagram.state,
    post: postDiagram.state,
    nerveBlocks: patientInfo.nerveBlocks,
    exam: patientInfo.exam,
    patientInfo,
    toothData,
    species,
    logo,
  } satisfies StashedState);
  const stateField = form.createTextField(DIAGRAM_STATE_FIELD);
  stateField.setText(stateJson);
  stateField.addToPage(page1, { x: 0, y: 0, width: 0, height: 0, borderWidth: 0 });

  return await pdfDoc.save();
}

/**
 * Build the PDF + trigger a browser download. Filename derived from patient
 * info. The original public entry point — kept for the existing "Generate
 * Chart" submit button.
 */
export async function generateDentalChartPDF(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  species: Species,
  logo: Logo,
  preDiagram: DiagramExport,
  postDiagram: DiagramExport,
  styleId: string = DEFAULT_PDF_STYLE_ID
): Promise<void> {
  const pdfBytes = await buildDentalChartPDFBytes(
    patientInfo, toothData, species, logo, preDiagram, postDiagram, styleId
  );
  const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${sanitize(patientInfo.patientName)}_${sanitize(patientInfo.patientNumber)}_${patientInfo.date}.pdf`;
  download(pdfBytes, filename, 'application/pdf');
}
