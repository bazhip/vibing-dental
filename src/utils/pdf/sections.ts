import { PDFDocument, PDFFont, PDFForm, PDFImage, PDFPage } from 'pdf-lib';
import { parseRootPockets } from '../pocket';
import { filledBlocks, fieldLines } from '../customAnesthesia';
import type { CustomAnesthesia } from '../../types';
import { DENTAL_CODES, DentalCode, findCodesInText, codeDefinition } from '../../constants/dentalCodes';
import i18n from '../../i18n';
import {
  PatientInfo,
  Logo,
  Species,
  ToothData,
  DentalField,
  ExamFindings,
  EXAM_ITEMS,
  NerveBlocks,
  effectiveNerveBlockDrugs,
  formatAnestheticDrug,
} from '../../types';
import { ToothGridLayout, TOOTH_DATA_ROWS } from '../../constants/chartLayout';
import { columnLabel, type ColumnKey } from '../../constants/columnDefinitions';
import { PALETTE, ACTIVE } from './styles';
import {
  PT_PER_IN,
  PATIENT_INFO_BOX,
  EXAM_TABLE_X_IN,
  EXAM_TABLE_YTOP_IN,
  EXAM_ROW_SHORT_IN,
  EXAM_ROW_TALL_IN,
  EXAM_COMMENT_BOX,
  TREATMENT_REPORT,
  NERVE_BLOCK_BOX,
  type DiagramSlot,
  type LegendBox,
} from './layout';
import {
  hlineLight,
  vlineLight,
  hlineStrong,
  wrapToWidth,
  fitTextToLines,
  drawClippedText,
  drawWrappedText,
  drawCenteredText,
  drawRadioGlyph,
  drawTableHeaderStrip,
  drawSectionCard,
  finishSectionCard,
  CARD_BAND_PT,
} from './draw';

/**
 * Section drawers — every visible block on the PDF gets one of these.
 * Each function knows just enough about its own section to lay it out;
 * none of them touch PALETTE / ACTIVE except by reading them (those are
 * mutated up-stack by applyPdfStyle).
 *
 * Every drawer takes the document language last (`lng`, default 'en'):
 * labels come from the `pdf` catalog (and `chart` / `codes`); text the
 * person typed prints as stored.
 */

/** The `pdf` catalog in the document's language. */
const pdfT = (lng: string) => i18n.getFixedT(lng, 'pdf');

// ---------------------------------------------------------------- Codes ----

/** Codes referenced anywhere in `texts`, deduped, sorted in DENTAL_CODES order. */
export function codesIn(...texts: Array<string | undefined>): DentalCode[] {
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

interface CollectInput {
  patientInfo: PatientInfo;
  toothData: ToothData[];
  preCommentTexts: string[];
  postCommentTexts: string[];
}
/** Codes used per page. Page 1: chief complaint, tooth grid, pre comments,
 *  exam comments. Page 2: treatment report + post comments. */
export function collectUsedCodesByPage({
  patientInfo, toothData, preCommentTexts, postCommentTexts,
}: CollectInput): { page1: DentalCode[]; page2: DentalCode[] } {
  const toothFields: string[] = [];
  for (const t of toothData) {
    toothFields.push(
      t.mobility ?? '', t.recession ?? '', t.pocket ?? '',
      t.furcation ?? '', t.hyperplasia ?? '', t.calculus ?? '',
      t.gingivitis ?? '', t.pdstate ?? ''
    );
  }
  const examComments = Object.values(patientInfo.exam)
    .filter((v) => v.status === 'abnormal')
    .map((v) => v.comment);
  return {
    page1: codesIn(patientInfo.complaint, ...toothFields, ...preCommentTexts, ...examComments),
    page2: codesIn(patientInfo.treatmentReport, patientInfo.radiographicFindings ?? "", ...postCommentTexts),
  };
}

/** Column count the legend uses for `count` codes: 3 once 2 would
 *  overflow the standard box, 1 when the caller pins a narrow column. */
export function codesLegendCols(count: number, maxCols = 3): number {
  return Math.min(maxCols, count > 18 ? 3 : 2);
}

const legendLineHeight = (cols: number) => (cols >= 3 ? 9 : 9.5);
/** Band + body inset above the first row and below the last. */
const LEGEND_CHROME_PT = CARD_BAND_PT + 3 + 4 + 2;

/** Height (inches) the legend needs to list every code, so the box can
 *  shrink to its content instead of reserving a fixed block. */
export function codesLegendHeightIn(count: number, cols: number): number {
  const rows = Math.ceil(count / cols);
  return (LEGEND_CHROME_PT + rows * legendLineHeight(cols)) / PT_PER_IN;
}

export function drawCodesLegend(
  page: PDFPage,
  region: LegendBox,
  codes: DentalCode[],
  bold: PDFFont,
  regular: PDFFont,
  maxCols = 3,
  lng = 'en'
): void {
  if (codes.length === 0) return;
  const t = pdfT(lng);

  const { height: pageHeight } = page.getSize();
  const x = region.xIn * PT_PER_IN;
  const yTop = pageHeight - region.yTopIn * PT_PER_IN;
  const widthPt = region.widthIn * PT_PER_IN;
  const heightPt = region.heightIn * PT_PER_IN;

  // One card: "Codes Used" band + entries in a single rounded frame.
  const bandBottom = drawSectionCard(page, x, yTop, widthPt, heightPt, t('codes.title'), bold);
  const bodyStartY = bandBottom - 3;
  const bodyHeight = heightPt - (yTop - bodyStartY) - 4;

  // 3-col layout when there's enough content that 2 cols would overflow.
  const cols = codesLegendCols(codes.length, maxCols);
  const useThreeCols = cols >= 3;
  const codeSize = useThreeCols ? 6.5 : 7;
  const lineHeight = legendLineHeight(cols);
  const colGap = useThreeCols ? 8 : 12;
  const innerX = x + 5;
  const innerW = widthPt - 10;
  const colWidth = (innerW - colGap * (cols - 1)) / cols;
  const codeColWidth = useThreeCols ? 38 : 48;
  const defWidth = colWidth - codeColWidth - 4;
  // Balance between cols rather than filling col-1 first.
  const maxRowsPerCol = Math.max(1, Math.floor(bodyHeight / lineHeight));
  const rowsPerCol = Math.min(maxRowsPerCol, Math.ceil(codes.length / cols));

  // If more codes are used than fit the box, reserve the final cell for a
  // "+N more" marker so the reader knows the legend is truncated rather
  // than silently dropping clinically-referenced codes.
  const capacity = cols * rowsPerCol;
  const overflow = codes.length > capacity;
  const shown = overflow ? codes.slice(0, capacity - 1) : codes;

  let col = 0, rowInCol = 0;
  for (const c of shown) {
    if (rowInCol >= rowsPerCol) { col++; rowInCol = 0; }
    const cx = innerX + col * (colWidth + colGap);
    const rowTop = bodyStartY - rowInCol * lineHeight;
    const cy = rowTop - lineHeight + 3;

    if (rowInCol % 2 === 1) {
      page.drawRectangle({
        x: cx - 2, y: rowTop - lineHeight,
        width: colWidth, height: lineHeight,
        color: PALETTE.rowAlt,
      });
    }

    page.drawText(c.code, { x: cx, y: cy, size: codeSize, font: bold, color: PALETTE.primary });
    const defLines = wrapToWidth(codeDefinition(c.code, lng), regular, codeSize, defWidth);
    const text = defLines[0] + (defLines.length > 1 ? '…' : '');
    page.drawText(text, { x: cx + codeColWidth, y: cy, size: codeSize, font: regular, color: PALETTE.text });

    rowInCol++;
  }

  if (overflow) {
    if (rowInCol >= rowsPerCol) { col++; rowInCol = 0; }
    const cx = innerX + col * (colWidth + colGap);
    const cy = bodyStartY - rowInCol * lineHeight - lineHeight + 3;
    const remaining = codes.length - (capacity - 1);
    page.drawText(t('codes.more', { n: remaining }), {
      x: cx, y: cy, size: codeSize, font: bold, color: PALETTE.muted,
    });
  }

  finishSectionCard(page, x, yTop, widthPt, heightPt);
}

// ------------------------------------------------------------ Logo header --

export async function drawLogoAndHeader(
  pdfDoc: PDFDocument,
  page: PDFPage,
  logo: Logo,
  species: Species,
  doctorName: string,
  techName: string,
  font: PDFFont,
  fontBold: PDFFont,
  /** Uploaded practice logo (PNG URL); replaces the template's mark. */
  customLogoUrl?: string,
  /** Practice name — drawn as a text wordmark when there's no uploaded
   *  logo, so a signed-in practice never prints another clinic's mark. */
  practiceName?: string,
  lng = 'en'
): Promise<number> {
  const t = pdfT(lng);
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const titleSize = 22;
  const subtitleSize = 9;
  const SPECIES_TITLES: Record<Species, string> = {
    canine: t('header.title.canine'),
    'canine-deciduous': t('header.title.canineDeciduous'),
    feline: t('header.title.feline'),
    'feline-deciduous': t('header.title.felineDeciduous'),
  };
  const titleText = SPECIES_TITLES[species];
  const subtitleText = t('header.subtitle');
  const logoWidthIn = 2.20;
  const logoWidth = logoWidthIn * PT_PER_IN;
  const logoUrl = logo === 'vca' ? 'logo_vca.png' : 'logo_socal.png';
  const logoLeftPt = 0.30 * PT_PER_IN;
  const logoTopPt = pageHeight - 0.35 * PT_PER_IN;

  // Logos keep their own colors — the active style only drives the
  // surrounding chrome (titles, table headers, comment cards), not the
  // mark itself. A signed-in practice's uploaded logo takes precedence
  // over the template asset; failures fall through to the template, then
  // to a text wordmark.
  // Fallback placement assumes a ~2:1 logo so the doctor name / underline
  // below still land sensibly if the asset can't be loaded.
  let logoBottomPt = logoTopPt - logoWidth * 0.5;

  // Practice-name text wordmark: up to two wrapped lines, bold ink.
  const drawWordmark = (name: string) => {
    const wmSize = 15;
    const wmLineH = wmSize * 1.2;
    const lines = wrapToWidth(name, fontBold, wmSize, 2.46 * PT_PER_IN).slice(0, 2);
    let y = logoTopPt - wmSize;
    for (const line of lines) {
      page.drawText(line, { x: logoLeftPt + 2, y, size: wmSize, font: fontBold, color: PALETTE.ink });
      y -= wmLineH;
    }
    logoBottomPt = y + wmLineH - 6;
  };

  try {
    let logoBytes: ArrayBuffer | null = null;
    if (customLogoUrl) {
      try {
        const customRes = await fetch(customLogoUrl);
        if (customRes.ok) logoBytes = await customRes.arrayBuffer();
      } catch {
        // fall through to the wordmark / template asset
      }
    }
    if (!logoBytes && practiceName?.trim()) {
      // Signed-in practice without an uploaded logo: their name, never
      // another clinic's mark.
      drawWordmark(practiceName.trim());
    } else {
      if (!logoBytes) {
        const res = await fetch(logoUrl);
        // eslint-disable-next-line no-restricted-syntax -- dev-only: PDF build callers show a generic translated build error
        if (!res.ok) throw new Error(`logo fetch failed: ${res.status}`);
        logoBytes = await res.arrayBuffer();
      }
      const png = await pdfDoc.embedPng(new Uint8Array(logoBytes));
      // Fit inside a bounded box: width-capped AND height-capped, aspect
      // preserved. Without the height cap a square or tall uploaded logo
      // rendered 2.2in+ tall and shoved the header into the diagram.
      const maxLogoH = 1.10 * PT_PER_IN;
      const scale = Math.min(logoWidth / png.width, maxLogoH / png.height);
      const logoW = png.width * scale;
      const logoH = png.height * scale;
      logoBottomPt = logoTopPt - logoH;
      page.drawImage(png, {
        x: logoLeftPt, y: logoBottomPt,
        width: logoW, height: logoH,
      });
    }
  } catch (err) {
    // A missing/unreachable logo must not sink the entire chart export.
    // Drop in a text wordmark and carry on.
    // eslint-disable-next-line no-console
    console.warn('[pdf] logo unavailable, using text fallback', err);
    drawWordmark(
      practiceName?.trim() || (logo === 'vca' ? 'VCA' : 'SoCal Veterinary Dentistry')
    );
  }

  // Doctor name + (optional) "Tech: …" sub-line + colored underline.
  // Both clip with an ellipsis at the underline width so a long typed
  // name can't run into the diagram or patient box.
  const drNameSize = 11;
  const techSize = 8;
  const drNameTopGap = 8;
  const nameMaxW = 2.46 * PT_PER_IN;
  const drNameBaselineY = logoBottomPt - drNameTopGap - drNameSize;
  drawClippedText(page, doctorName, logoLeftPt + 2, drNameBaselineY,
    drNameSize, fontBold, PALETTE.ink, nameMaxW);

  let underlineY = drNameBaselineY - 4;
  if (logo === 'vca' && techName.trim()) {
    const techBaselineY = drNameBaselineY - techSize - 4;
    drawClippedText(page, t('header.tech', { name: techName }), logoLeftPt + 2, techBaselineY,
      techSize, font, PALETTE.muted, nameMaxW);
    underlineY = techBaselineY - 4;
  }
  page.drawLine({
    start: { x: logoLeftPt, y: underlineY },
    end:   { x: logoLeftPt + 2.48 * PT_PER_IN, y: underlineY },
    thickness: 0.6, color: PALETTE.primary,
  });

  // Species title + subtitle, top-right — top-aligned with the logo and
  // the patient card so the header reads as one row. The title shrinks
  // until it clears the patient-info box (right edge 7.15in + gap): a
  // long species name must never print across the patient fields.
  const titleTopIn = 0.32;
  const titleMaxW = pageWidth - 0.40 * PT_PER_IN - 7.35 * PT_PER_IN;
  let fittedTitleSize = titleSize;
  while (
    fittedTitleSize > 12 &&
    fontBold.widthOfTextAtSize(titleText, fittedTitleSize) > titleMaxW
  ) {
    fittedTitleSize -= 0.5;
  }
  const titleW = fontBold.widthOfTextAtSize(titleText, fittedTitleSize);
  page.drawText(titleText, {
    x: pageWidth - 0.40 * PT_PER_IN - titleW,
    y: pageHeight - titleTopIn * PT_PER_IN - fittedTitleSize,
    size: fittedTitleSize, font: fontBold, color: PALETTE.ink,
  });
  const subtitleW = font.widthOfTextAtSize(subtitleText, subtitleSize);
  page.drawText(subtitleText, {
    x: pageWidth - 0.40 * PT_PER_IN - subtitleW,
    y: pageHeight - titleTopIn * PT_PER_IN - fittedTitleSize - subtitleSize - 4,
    size: subtitleSize, font, color: PALETTE.muted,
  });

  // Header block's bottom edge (inches from the page top). Tall uploaded
  // logos push this well past the default diagram-slot top — the caller
  // uses it to keep the diagram clear of the header.
  return (pageHeight - underlineY) / PT_PER_IN;
}

// ----------------------------------------------------------- Patient info --

/** Line metrics for the chief-complaint value text. */
const COMPLAINT_FONT_PT = 9;
const COMPLAINT_LINE_PT = COMPLAINT_FONT_PT + 2.5;

export function drawPatientInfoBox(
  page: PDFPage,
  patientInfo: PatientInfo,
  font: PDFFont,
  fontBold: PDFFont,
  /** Cap on complaint lines, budgeted by the caller from the space left
   *  above the exam card. Truncation past the cap gets an ellipsis. */
  maxComplaintLines: number = 3,
  lng = 'en'
): number {
  const t = pdfT(lng);
  const { height: pageHeight } = page.getSize();
  const x = PATIENT_INFO_BOX.xIn * PT_PER_IN;
  const yTop = pageHeight - PATIENT_INFO_BOX.yTopIn * PT_PER_IN;
  const labelW = PATIENT_INFO_BOX.labelColIn * PT_PER_IN;
  const valueW = PATIENT_INFO_BOX.valueColIn * PT_PER_IN;
  const totalW = labelW + valueW;

  // The complaint row sizes to its text: one writable blank line when
  // empty, otherwise exactly as many rows as the wrapped text needs (up
  // to the caller's budget) — no fixed two-line default.
  const complaintCleaned = (patientInfo.complaint ?? '').replace(/\s+/g, ' ').trim();
  const complaintAllLines = complaintCleaned
    ? wrapToWidth(complaintCleaned, font, COMPLAINT_FONT_PT, valueW - 10)
    : [];
  const complaintTruncated = complaintAllLines.length > maxComplaintLines;
  const complaintLines = complaintAllLines.slice(0, Math.max(1, maxComplaintLines));
  if (complaintTruncated) {
    const last = complaintLines.length - 1;
    let text = complaintLines[last];
    while (text.length > 0 && font.widthOfTextAtSize(text + '…', COMPLAINT_FONT_PT) > valueW - 10) {
      text = text.slice(0, -1);
    }
    complaintLines[last] = text.trimEnd() + '…';
  }
  const complaintRowIn = Math.max(
    0.26,
    (10 + complaintLines.length * COMPLAINT_LINE_PT) / PT_PER_IN
  );

  type Row = { label: string; value?: string; multiline?: boolean; heightIn: number };
  // Patient + PID for both logos — Doctor / Tech live in the logo header
  // for VCA, not in the patient info box.
  const rows: Row[] = [
    { label: t('patient.date'),      value: patientInfo.date,          heightIn: PATIENT_INFO_BOX.rowDateIn },
    { label: t('patient.patient'),   value: patientInfo.patientName,   heightIn: PATIENT_INFO_BOX.rowPatientIn },
    { label: t('patient.pid'),       value: patientInfo.patientNumber, heightIn: PATIENT_INFO_BOX.rowIdIn },
    { label: t('patient.complaint'), value: patientInfo.complaint, multiline: true, heightIn: complaintRowIn },
  ];
  const labeledRowsH = rows.reduce((acc, r) => acc + r.heightIn * PT_PER_IN, 0);

  const labelFontSize = 7.5;
  const padX = 5;

  // One card: title band + rows inside a single rounded frame. The card
  // top sits where the floating title used to; the rows start just below
  // the band.
  const cardTop = yTop + 0.20 * PT_PER_IN;
  const bodyTop = drawSectionCard(
    page, x, cardTop, totalW, CARD_BAND_PT + labeledRowsH,
    t('patient.title'), fontBold
  );

  // Alternating row tints (inset so they don't poke past the corners).
  let yCursor = bodyTop;
  for (let i = 0; i < rows.length; i++) {
    const rowH = rows[i].heightIn * PT_PER_IN;
    if (i % 2 === 1) {
      page.drawRectangle({
        x: x + 0.6, y: yCursor - rowH,
        width: totalW - 1.2, height: rowH, color: PALETTE.rowAlt,
      });
    }
    yCursor -= rowH;
  }

  // Row separators.
  yCursor = bodyTop;
  for (let i = 0; i < rows.length - 1; i++) {
    yCursor -= rows[i].heightIn * PT_PER_IN;
    hlineLight(page, x, x + totalW, yCursor);
  }

  // Labels + values.
  yCursor = bodyTop;
  const valueFontSize = 9;
  for (const row of rows) {
    const rowH = row.heightIn * PT_PER_IN;
    const rowBottom = yCursor - rowH;
    const labelBaselineY = row.multiline
      ? yCursor - labelFontSize - 5
      : rowBottom + (rowH - labelFontSize) / 2 + 1.5;
    page.drawText(row.label, {
      x: x + padX, y: labelBaselineY,
      size: labelFontSize, font, color: PALETTE.muted,
    });
    if (row.value !== undefined) {
      const valueX = x + labelW + padX;
      const valueWidth = valueW - padX * 2;
      if (row.multiline) {
        // Pre-wrapped above; the row is already sized to these lines.
        let lineY = yCursor - 4;
        for (const line of complaintLines) {
          lineY -= COMPLAINT_LINE_PT;
          page.drawText(line, { x: valueX, y: lineY, size: COMPLAINT_FONT_PT, font, color: PALETTE.ink });
        }
      } else {
        const baselineY = rowBottom + (rowH - valueFontSize) / 2 + 1.5;
        drawClippedText(page, row.value, valueX, baselineY, valueFontSize, font, PALETTE.ink, valueWidth);
      }
    }
    yCursor = rowBottom;
  }

  finishSectionCard(page, x, cardTop, totalW, CARD_BAND_PT + labeledRowsH);

  // Card bottom in inches from the page top — the exam card shifts down
  // when a long complaint grows this card.
  return (pageHeight - (cardTop - CARD_BAND_PT - labeledRowsH)) / PT_PER_IN;
}

// ---------------------------------------------------------------- Exam ----

/** Where the exam card sits and how its columns fall. The standard
 *  card runs label | Normal | Abnormal | Comment across the right half
 *  of page 1; the compact card (grid left off the PDF) is a narrow
 *  right-hand column with each abnormal comment on its own line(s)
 *  beneath the label. */
export interface ExamGeometry {
  xIn: number;
  widthIn: number;
  normalCXIn: number;
  abnormalCXIn: number;
  commentXIn: number;
  commentWidthIn: number;
  commentBelow: boolean;
}

export const EXAM_GEOMETRY_STANDARD: ExamGeometry = {
  xIn: EXAM_TABLE_X_IN,
  widthIn: EXAM_COMMENT_BOX.xIn + EXAM_COMMENT_BOX.widthIn - EXAM_TABLE_X_IN,
  normalCXIn: 6.60,
  abnormalCXIn: 7.12,
  commentXIn: EXAM_COMMENT_BOX.xIn,
  commentWidthIn: EXAM_COMMENT_BOX.widthIn,
  commentBelow: false,
};

export function compactExamGeometry(xIn: number, widthIn: number): ExamGeometry {
  return {
    xIn,
    widthIn,
    normalCXIn: xIn + widthIn - 1.05,
    abnormalCXIn: xIn + widthIn - 0.50,
    commentXIn: xIn + 0.20,
    commentWidthIn: widthIn - 0.30,
    commentBelow: true,
  };
}

// Per-row layout: short row when 0–1 lines of comment, tall when 2 —
// or, with comments below the label, the short row plus its lines.
type ExamRowLayout = {
  heightPt: number;
  comment: { lines: string[]; fontSize: number; lineHeight: number } | null;
};

function computeExamLayouts(exam: ExamFindings, font: PDFFont, geo: ExamGeometry): ExamRowLayout[] {
  const commentWidthPt = geo.commentWidthIn * PT_PER_IN;
  return EXAM_ITEMS.map(({ key }) => {
    const item = exam[key];
    if (item.status !== 'abnormal' || !item.comment.trim()) {
      return { heightPt: EXAM_ROW_SHORT_IN * PT_PER_IN, comment: null };
    }
    const cleaned = item.comment.replace(/\s+/g, ' ').trim();
    const { lines, fontSize: cFontSize } = fitTextToLines(
      cleaned, font, commentWidthPt, geo.commentBelow ? 3 : 2,
      EXAM_COMMENT_BOX.maxFontSizePt, EXAM_COMMENT_BOX.minFontSizePt
    );
    const lineHeight = cFontSize * EXAM_COMMENT_BOX.lineHeightFactor;
    const heightPt = geo.commentBelow
      ? EXAM_ROW_SHORT_IN * PT_PER_IN + lines.length * lineHeight + 3
      : (lines.length > 1 ? EXAM_ROW_TALL_IN : EXAM_ROW_SHORT_IN) * PT_PER_IN;
    return { heightPt, comment: { lines, fontSize: cFontSize, lineHeight } };
  });
}

/** Height of the Normal/Abnormal column-caption row inside the card. */
const EXAM_HEAD_IN = 0.18;

/** Total height of the exam body (caption row + rows, excluding the card
 *  band), in inches — lets the orchestrator budget page 1 before anything
 *  draws. */
export function measureExamRowsIn(
  exam: ExamFindings,
  font: PDFFont,
  geo: ExamGeometry = EXAM_GEOMETRY_STANDARD
): number {
  return (
    EXAM_HEAD_IN +
    computeExamLayouts(exam, font, geo).reduce((acc, l) => acc + l.heightPt, 0) / PT_PER_IN
  );
}

export function drawExamSection(
  page: PDFPage,
  exam: ExamFindings,
  font: PDFFont,
  fontBold: PDFFont,
  bodyTopIn: number = EXAM_TABLE_YTOP_IN,
  geo: ExamGeometry = EXAM_GEOMETRY_STANDARD,
  lng = 'en'
): number {
  const t = pdfT(lng);
  const { height: pageHeight } = page.getSize();
  const fontSize = 9;
  const xPt = geo.xIn * PT_PER_IN;
  const sectionWidth = geo.widthIn * PT_PER_IN;
  const commentXPt = geo.commentXIn * PT_PER_IN;

  const bodyTopPt = pageHeight - bodyTopIn * PT_PER_IN;

  const layouts = computeExamLayouts(exam, font, geo);

  // One card around the band + caption row + every exam row (heights
  // vary with comment wrapping, so the total is computed from the
  // laid-out rows).
  const headPt = EXAM_HEAD_IN * PT_PER_IN;
  const rowsTotalH = layouts.reduce((acc, l) => acc + l.heightPt, 0);
  drawSectionCard(
    page, xPt, bodyTopPt + CARD_BAND_PT, sectionWidth,
    CARD_BAND_PT + headPt + rowsTotalH, t('exam.title'), fontBold
  );

  // Column layout mirrors the app: label | Normal | Abnormal | Comment.
  const labelX = xPt + 7;
  const normalCX   = geo.normalCXIn * PT_PER_IN;
  const abnormalCX = geo.abnormalCXIn * PT_PER_IN;
  const radioR = 4.2;

  // Caption row.
  const capSize = 6.5;
  const capBaseline = bodyTopPt - headPt + (headPt - capSize) / 2 + 1;
  drawCenteredText(page, t('exam.normal'),   normalCX - 40,   normalCX + 40,   capBaseline, capSize, fontBold, PALETTE.muted);
  drawCenteredText(page, t('exam.abnormal'), abnormalCX - 40, abnormalCX + 40, capBaseline, capSize, fontBold, PALETTE.muted);
  if (!geo.commentBelow) {
    page.drawText(t('exam.comment'), { x: commentXPt, y: capBaseline, size: capSize, font: fontBold, color: PALETTE.muted });
  }
  hlineLight(page, xPt, xPt + sectionWidth, bodyTopPt - headPt);

  let cursorY = bodyTopPt - headPt;
  for (let i = 0; i < EXAM_ITEMS.length; i++) {
    const { key } = EXAM_ITEMS[i];
    const item = exam[key];
    const layout = layouts[i];
    const rowTopY = cursorY;
    const rowBottomY = cursorY - layout.heightPt;
    // With comments below, the label + radios keep the short row's
    // midline and the comment fills the space under them.
    const rowMidY = geo.commentBelow
      ? rowTopY - (EXAM_ROW_SHORT_IN * PT_PER_IN) / 2
      : (rowTopY + rowBottomY) / 2;
    const labelY = rowMidY - fontSize / 2 + 1.5;

    const abnormal = item.status === 'abnormal';

    // Abnormal rows get the app's red wash; normal rows keep the zebra.
    // Inset so fills stay inside the card's rounded corners.
    if (abnormal) {
      page.drawRectangle({ x: xPt + 0.6, y: rowBottomY, width: sectionWidth - 1.2, height: layout.heightPt, color: PALETTE.dangerTint });
    } else if (i % 2 === 1) {
      page.drawRectangle({ x: xPt + 0.6, y: rowBottomY, width: sectionWidth - 1.2, height: layout.heightPt, color: PALETTE.rowAlt });
    }

    const labelText = t(`exam.items.${key}`);
    page.drawText(labelText, {
      x: labelX, y: labelY, size: fontSize,
      font: abnormal ? fontBold : font,
      color: abnormal ? PALETTE.danger : PALETTE.text,
    });

    // Radio pair under the Normal / Abnormal captions — abnormal carries
    // the clinical signal color, same language as the app.
    drawRadioGlyph(page, normalCX, rowMidY, radioR, item.status === 'normal');
    drawRadioGlyph(page, abnormalCX, rowMidY, radioR, abnormal, PALETTE.danger);

    if (layout.comment) {
      const { lines, fontSize: cSize, lineHeight } = layout.comment;
      const blockHeight = lines.length * lineHeight;
      // Center the block in the row, but never let its top rise above the
      // row top (a tall 2-line comment would otherwise clip into the row
      // above).
      const blockTopY = geo.commentBelow
        ? rowTopY - EXAM_ROW_SHORT_IN * PT_PER_IN + 1
        : Math.min(rowMidY + blockHeight / 2, rowTopY - 2);
      for (let j = 0; j < lines.length; j++) {
        const baselineY = blockTopY - (j + 1) * lineHeight + (lineHeight - cSize) / 2;
        page.drawText(lines[j], { x: commentXPt, y: baselineY, size: cSize, font, color: PALETTE.text });
      }
    }

    cursorY = rowBottomY;
  }

  finishSectionCard(page, xPt, bodyTopPt + CARD_BAND_PT, sectionWidth, CARD_BAND_PT + headPt + rowsTotalH);

  // Bottom edge in inches from the page top, so the caller can place the
  // arch grids dynamically beneath.
  return (pageHeight - cursorY) / PT_PER_IN;
}

// ------------------------------------------------------------ Tooth grid --

/** Fit a grid value in a tooth column. Short values print as-is. Per-root
 *  pockets ("MB4 MP5 D6") shrink to fit, and when even the smallest size
 *  is too wide they print as depths in root order ("4/5/6"). */
export function fitCellText(value: string, width: number, font: PDFFont, size: number): { text: string; size: number } {
  const MIN = 4.5;
  if (font.widthOfTextAtSize(value, size) <= width) return { text: value, size };
  const shrunk = Math.max(MIN, (size * width) / font.widthOfTextAtSize(value, size));
  if (font.widthOfTextAtSize(value, shrunk) <= width) return { text: value, size: shrunk };
  const roots = parseRootPockets(value);
  if (roots) {
    const compact = Object.values(roots).join('/');
    const s2 = Math.max(MIN, Math.min(size, (size * width) / font.widthOfTextAtSize(compact, size)));
    return { text: compact, size: s2 };
  }
  return { text: value, size: shrunk };
}

const GRID_LABEL_PT = 6;
const GRID_LABEL_MIN_PT = 4.5;
/** Rows that have a short label (chart grid.short). */
const SHORT_KEYS = {
  mobility: 1, recession: 1, pocket: 1, furcation: 1, hyperplasia: 1, calculus: 1, gingivitis: 1, pdstate: 1,
} as const;

/** A tooth-grid row label sized for the label column: 6pt as always,
 *  shrunk (to 4.5pt at least) when a translated label is too wide, and
 *  the grid's short label when even that doesn't fit. The 0.5pt slack
 *  keeps English exactly as it has always printed ("Enlargement" is
 *  36.3pt in the 36pt column). */
export function fitGridRowLabel(key: ColumnKey, lng: string, font: PDFFont, columnW: number): { text: string; size: number } {
  const full = columnLabel(key, lng);
  if (font.widthOfTextAtSize(full, GRID_LABEL_PT) <= columnW + 0.5) return { text: full, size: GRID_LABEL_PT };
  const target = columnW - 2;
  const shrink = (text: string) => {
    const size = Math.max(GRID_LABEL_MIN_PT, Math.min(GRID_LABEL_PT, (GRID_LABEL_PT * target) / font.widthOfTextAtSize(text, GRID_LABEL_PT)));
    return { text, size, fits: font.widthOfTextAtSize(text, size) <= target + 0.01 };
  };
  const shrunk = shrink(full);
  if (shrunk.fits || !(key in SHORT_KEYS)) return { text: shrunk.text, size: shrunk.size };
  const short = shrink(i18n.getFixedT(lng, 'chart')(`grid.short.${key as keyof typeof SHORT_KEYS}`));
  return { text: short.text, size: short.size };
}

const SUFFIX_TO_FIELD: Record<string, DentalField> = {
  mob: 'mobility', rec: 'recession', poc: 'pocket', fur: 'furcation',
  hyp: 'hyperplasia', cal: 'calculus', gin: 'gingivitis', pds: 'pdstate',
};

export function drawToothGrid(
  page: PDFPage,
  layout: ToothGridLayout,
  toothData: ToothData[],
  font: PDFFont,
  fontBold: PDFFont,
  archTitle: string,
  missingTriadans?: Set<number>,
  lng = 'en'
): void {
  const { height: pageHeight } = page.getSize();
  const x = layout.xIn * PT_PER_IN;
  const yTop = pageHeight - layout.yTopIn * PT_PER_IN;
  const labelW = layout.labelColIn * PT_PER_IN;
  const toothW = layout.toothColIn * PT_PER_IN;
  const rowH = layout.rowHeightIn * PT_PER_IN;
  const totalW = labelW + toothW * layout.teeth.length;
  const headerSize = 6;
  const totalRows = 2 + TOOTH_DATA_ROWS.length;
  const totalH = rowH * totalRows;

  // One card: arch title band + the grid inside a single rounded frame.
  drawSectionCard(
    page, x, yTop + CARD_BAND_PT, totalW,
    CARD_BAND_PT + totalH, archTitle, fontBold
  );

  // Two header rows. The fill follows the style's table-header variant so
  // the tooth grids speak the same language as every other table — for
  // the default theme that's the app's solid-primary header strip.
  const darkHeader = ACTIVE.tableHeaderVariant === 'dark';
  const headerFill  = darkHeader ? PALETTE.primary : PALETTE.cellGray;
  const headerText  = darkHeader ? PALETTE.white   : PALETTE.ink;
  const headerSub   = darkHeader ? PALETTE.white   : PALETTE.muted;
  page.drawRectangle({ x: x + 0.6, y: yTop - rowH * 2, width: totalW - 1.2, height: rowH * 2, color: headerFill });
  // Data rows: alternating tint behind data cells; label column always
  // tinted. Fills inset so they stay inside the card's rounded corners.
  for (let r = 0; r < TOOTH_DATA_ROWS.length; r++) {
    if (r % 2 === 1) {
      page.drawRectangle({
        x: x + labelW, y: yTop - rowH * (3 + r),
        width: totalW - labelW - 0.6, height: rowH, color: PALETTE.rowAlt,
      });
    }
    page.drawRectangle({
      x: x + 0.6, y: yTop - rowH * (3 + r),
      width: labelW - 0.6, height: rowH, color: PALETTE.cellGray,
    });
  }

  // Missing teeth: wash the whole column in the clinical red tint — the
  // grid twin of the app's crossed-out row.
  if (missingTriadans && missingTriadans.size > 0) {
    for (let i = 0; i < layout.teeth.length; i++) {
      if (!missingTriadans.has(layout.teeth[i].triadan)) continue;
      page.drawRectangle({
        x: x + labelW + i * toothW,
        y: yTop - totalH,
        width: toothW,
        height: totalH - rowH * 2,
        color: PALETTE.dangerTint,
      });
    }
  }

  // Gridlines — interior only; the card frame is the outer border.
  for (let r = 1; r < totalRows; r++) {
    hlineLight(page, x, x + totalW, yTop - r * rowH);
  }
  vlineLight(page, x + labelW, yTop, yTop - totalH);
  for (let c = 1; c < layout.teeth.length; c++) {
    vlineLight(page, x + labelW + c * toothW, yTop, yTop - totalH);
  }
  hlineStrong(page, x, x + totalW, yTop - rowH * 2);

  const baselineForRow = (rowIdx: number, fontSize: number) =>
    yTop - rowIdx * rowH - rowH / 2 - fontSize / 2 + 1.5;

  for (const [rowIdx, key] of [[0, 'tooth'], [1, 'triadan']] as const) {
    const fit = fitGridRowLabel(key, lng, fontBold, labelW);
    drawCenteredText(page, fit.text, x, x + labelW, baselineForRow(rowIdx, fit.size), fit.size, fontBold, headerText);
  }
  for (let i = 0; i < layout.teeth.length; i++) {
    const tooth = layout.teeth[i];
    const cellLeft = x + labelW + i * toothW;
    const cellRight = cellLeft + toothW;
    drawCenteredText(page, tooth.abbr,            cellLeft, cellRight, baselineForRow(0, headerSize), headerSize, fontBold, headerText);
    drawCenteredText(page, String(tooth.triadan), cellLeft, cellRight, baselineForRow(1, headerSize), headerSize, font,     headerSub);
  }

  // Data rows — values are static text (no AcroForm fields).
  const cellFontSize = 6.5;
  for (let r = 0; r < TOOTH_DATA_ROWS.length; r++) {
    const dataRow = TOOTH_DATA_ROWS[r];
    const rowIdx = 2 + r;
    const fit = fitGridRowLabel(dataRow.key, lng, fontBold, labelW);
    drawCenteredText(page, fit.text, x, x + labelW, baselineForRow(rowIdx, fit.size), fit.size, fontBold, PALETTE.muted);
    const fieldKey = SUFFIX_TO_FIELD[dataRow.suffix];
    for (let i = 0; i < layout.teeth.length; i++) {
      const tooth = layout.teeth[i];
      const td = toothData.find((t) => t.triadan === tooth.triadan);
      const value = td ? (td[fieldKey] ?? '') : '';
      if (!value) continue;
      const cellLeft = x + labelW + i * toothW;
      const cellRight = cellLeft + toothW;
      const fit = fitCellText(value, toothW - 2, font, cellFontSize);
      drawCenteredText(page, fit.text, cellLeft, cellRight, baselineForRow(rowIdx, fit.size), fit.size, font, PALETTE.ink);
    }
  }

  finishSectionCard(page, x, yTop + CARD_BAND_PT, totalW, CARD_BAND_PT + totalH);
}

// ------------------------------------------------------- Treatment Report --

/** The treatment card's text: radiographic findings (when present) as a
 *  labelled first block, then the report — the card keeps its size and
 *  place, so charts without findings print exactly as before. */
export function treatmentCardText(treatmentReport: string, radiographicFindings?: string, lng = 'en'): string {
  const rads = (radiographicFindings ?? '').trim();
  if (!rads) return treatmentReport;
  const report = treatmentReport.trim();
  const t = pdfT(lng);
  return `${t('treatment.findingsHeading')}\n${rads}${report ? `\n\n${t('treatment.treatmentHeading')}\n${report}` : ''}`;
}

export function drawTreatmentReportField(
  page: PDFPage,
  value: string,
  font: PDFFont,
  fontBold: PDFFont,
  lng = 'en'
): void {
  const t = pdfT(lng);
  const { height: pageHeight } = page.getSize();
  const xPt = TREATMENT_REPORT.xIn * PT_PER_IN;
  const titleYTopPt = pageHeight - TREATMENT_REPORT.headerYTopIn * PT_PER_IN;
  const fieldW = TREATMENT_REPORT.fieldWidthIn * PT_PER_IN;

  // One card: title band + writing area in a single rounded frame. The
  // card's bottom edge stays at the old field bottom.
  const fieldY = pageHeight - (TREATMENT_REPORT.fieldYTopIn + TREATMENT_REPORT.fieldHeightIn) * PT_PER_IN;
  const cardH = titleYTopPt - fieldY;
  const bodyTop = drawSectionCard(
    page, xPt, titleYTopPt, fieldW, cardH,
    t('treatment.title'), fontBold
  );

  if (value) {
    const innerX = xPt + 8;
    const innerYTop = bodyTop - 6;
    const innerWidth = fieldW - 16;
    const fontSize = 9.5;
    const lineHeight = fontSize * 1.45;
    // Cap at the box height — an unbounded report used to keep drawing
    // straight through the field border and over the footer. When capped,
    // say so: the full text still round-trips via the embedded state.
    const maxLines = Math.floor((innerYTop - (fieldY + 10)) / lineHeight);
    const totalLines = value
      .split('\n')
      .reduce((n, para) => n + Math.max(1, wrapToWidth(para, font, fontSize, innerWidth).length), 0);
    if (totalLines > maxLines) {
      drawWrappedText(page, value, innerX, innerYTop, innerWidth,
        fontSize, lineHeight, font, PALETTE.ink, maxLines - 1);
      const noteY = fieldY + 8;
      page.drawText(t('treatment.continued'), {
        x: innerX, y: noteY, size: 7.5, font, color: PALETTE.muted,
      });
    } else {
      drawWrappedText(page, value, innerX, innerYTop, innerWidth,
        fontSize, lineHeight, font, PALETTE.ink);
    }
  }

  finishSectionCard(page, xPt, titleYTopPt, fieldW, cardH);
}

// ----------------------------------------------------------- Nerve block --

/** Draws the nerve-block table and returns the y (in inches from the page
 *  top) of its bottom edge, so the caller can place the diagram beneath it
 *  without overlap (the "Other" row grows to fit wrapped free text). */
export function drawNerveBlockTable(
  page: PDFPage,
  nerveBlocks: NerveBlocks,
  bold: PDFFont,
  regular: PDFFont,
  isVca: boolean,
  /** Rows the person hides (chart settings) — left out when empty. */
  hiddenRows: readonly string[] = [],
  /** The chart's custom blocks (extra rows) and fields (lines at the top
   *  of the "Other" row) — printed only when filled. */
  custom?: CustomAnesthesia,
  lng = 'en'
): number {
  const t = pdfT(lng);
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

  type LR = { kind: 'lr'; label: string; right: string; left: string };
  type Free = { kind: 'free'; label: string; value: string };
  // Caudal maxillary prints only when used, so charts without it keep
  // the original page-2 layout.
  const caudal = { right: nerveBlocks.caudalMaxillaryRight || '', left: nerveBlocks.caudalMaxillaryLeft || '' };
  // A row the person hides is left out only while it's empty.
  const keep = (id: string, r: { right: string; left: string }) => !hiddenRows.includes(id) || !!(r.right || r.left);
  const lr = (id: string, label: string, right: string, left: string): LR[] =>
    keep(id, { right, left }) ? [{ kind: 'lr', label, right, left }] : [];
  const rows: Array<LR | Free> = [
    ...lr('infraorbital', t('anesthesia.blocks.infraorbital'), nerveBlocks.infraorbitalRight || '', nerveBlocks.infraorbitalLeft || ''),
    ...(caudal.right || caudal.left ? [{ kind: 'lr' as const, label: t('anesthesia.blocks.caudalMaxillary'), ...caudal }] : []),
    ...lr('inferiorAlveolar', t('anesthesia.blocks.inferiorAlveolar'), nerveBlocks.inferiorAlveolarRight || '', nerveBlocks.inferiorAlveolarLeft || ''),
    ...lr('mental', t('anesthesia.blocks.mental'), nerveBlocks.mentalRight || '', nerveBlocks.mentalLeft || ''),
    ...filledBlocks(custom).map((b): LR => ({ kind: 'lr', label: b.label || i18n.getFixedT(lng, 'chart')('customAnesthesia.block'), right: b.right, left: b.left })),
    { kind: 'free', label: t('anesthesia.other'), value: [...fieldLines(custom, lng), (nerveBlocks.other || '').trim()].filter(Boolean).join('\n') },
  ];

  // The free-text "Other" row (always last) grows to fit wrapped content
  // instead of clipping; the L/R rows stay one line tall. Computed first
  // so the card can be sized before anything draws.
  const lrCount = rows.length - 1;
  const otherRow = rows[rows.length - 1] as Free;
  // The "Other" note ignores the L/R column grid — it starts right after
  // the short "Other" label and uses the full remaining row width (the wide
  // label column would otherwise be wasted whitespace).
  const otherLabelW = regular.widthOfTextAtSize(otherRow.label, bodySize);
  const otherValueX = x + padX + otherLabelW + 8;
  const otherValueWidth = x + totalW - padX - otherValueX;
  const otherLineHeight = bodySize * 1.35;
  const otherLines = otherRow.value
    ? wrapToWidth(otherRow.value, regular, bodySize, otherValueWidth).slice(0, 12)
    : [];
  const otherRowH = Math.max(
    rowH,
    otherLines.length * otherLineHeight + (rowH - bodySize)
  );
  // Anesthetics. One drug that fits keeps the classic header label
  // ("Nerve Block 0.5% Bupivacaine"); a mix — or a long name — gets its
  // own full-width row above the header, wrapping whole drugs per line.
  const drugs = effectiveNerveBlockDrugs(nerveBlocks, isVca ? 'vca' : 'socal').map(formatAnestheticDrug);
  const headerMaxWidth = labelW - padX * 2;
  const minHeaderSize = 6.5;
  const singleLabel = t('anesthesia.nerveBlockWith', { drug: drugs[0] });
  const useDrugRow =
    drugs.length > 1 || bold.widthOfTextAtSize(singleLabel, minHeaderSize) > headerMaxWidth;
  const drugLabel = drugs.length > 1 ? t('anesthesia.anesthetics') : t('anesthesia.anesthetic');
  const drugLabelW = bold.widthOfTextAtSize(drugLabel, bodySize);
  const drugValueX = x + padX + drugLabelW + 8;
  const drugValueWidth = x + totalW - padX - drugValueX;
  const drugLineHeight = bodySize * 1.35;
  const drugLines: string[] = [];
  if (useDrugRow) {
    const sep = '  +  ';
    let line = '';
    for (const d of drugs) {
      const candidate = line ? `${line}${sep}${d}` : d;
      // Leave room for a trailing "  +" should the next drug wrap.
      if (!line || regular.widthOfTextAtSize(`${candidate}  +`, bodySize) <= drugValueWidth) {
        line = candidate;
      } else {
        // Trailing "+" keeps the mix reading as one list across lines.
        drugLines.push(`${line}  +`);
        line = d;
      }
    }
    if (line) drugLines.push(line);
    // A single over-long name still has to fit: break it within the word.
    const fitted = drugLines.flatMap((l) =>
      regular.widthOfTextAtSize(l, bodySize) > drugValueWidth
        ? wrapToWidth(l, regular, bodySize, drugValueWidth)
        : [l]
    );
    drugLines.splice(0, drugLines.length, ...fitted.slice(0, 6));
  }
  const drugRowH = useDrugRow
    ? Math.max(rowH, drugLines.length * drugLineHeight + (rowH - bodySize))
    : 0;

  const totalH = drugRowH + rowH * (lrCount + 1) + otherRowH;

  // One card: title band + table inside a single rounded frame.
  const cardTop = yTop + 0.20 * PT_PER_IN;
  const bodyTop = drawSectionCard(
    page, x, cardTop, totalW, CARD_BAND_PT + totalH,
    t('anesthesia.title'), bold
  );

  if (useDrugRow) {
    const firstBaseline = bodyTop - drugLineHeight + (drugLineHeight - bodySize) / 2 + 1.5
      - (drugRowH - drugLines.length * drugLineHeight) / 2;
    page.drawText(drugLabel, { x: x + padX, y: firstBaseline, size: bodySize, font: bold, color: PALETTE.text });
    let dy = firstBaseline;
    for (const line of drugLines) {
      page.drawText(line, { x: drugValueX, y: dy, size: bodySize, font: regular, color: PALETTE.ink });
      dy -= drugLineHeight;
    }
  }
  // Everything below the drug row lays out from here, as it did before
  // the row existed.
  const tableTop = bodyTop - drugRowH;
  if (useDrugRow) hlineLight(page, x, x + totalW, tableTop);

  const headerLabel = useDrugRow ? t('anesthesia.nerveBlock') : singleLabel;
  let headerLabelSize = headerSize;
  while (headerLabelSize > minHeaderSize && bold.widthOfTextAtSize(headerLabel, headerLabelSize) > headerMaxWidth) {
    headerLabelSize -= 0.25;
  }
  drawTableHeaderStrip(page, x, tableTop - rowH, totalW, rowH, [
    { text: headerLabel, xPt: x,                    widthPt: labelW, align: 'left' },
    { text: t('anesthesia.right'), xPt: x + labelW,           widthPt: valueW, align: 'center' },
    { text: t('anesthesia.left'),  xPt: x + labelW + valueW,  widthPt: valueW, align: 'center' },
  ], bold, headerLabelSize);

  // Alternating row tints — L/R rows are rowH, the Other row is otherRowH.
  for (let i = 0; i < lrCount; i++) {
    if (i % 2 === 1) {
      page.drawRectangle({
        x: x + 0.6, y: tableTop - rowH * (i + 2),
        width: totalW - 1.2, height: rowH, color: PALETTE.rowAlt,
      });
    }
  }
  const otherTopY = tableTop - rowH * (lrCount + 1); // below header + L/R rows
  if (lrCount % 2 === 1) {
    page.drawRectangle({ x: x + 0.6, y: otherTopY - otherRowH, width: totalW - 1.2, height: otherRowH, color: PALETTE.rowAlt });
  }

  // Interior gridlines — the card frame is the outer border.
  for (let i = 1; i <= lrCount + 1; i++) {
    hlineLight(page, x, x + totalW, tableTop - rowH * i);
  }
  const lrBottomY = tableTop - rowH * (lrCount + 1);
  vlineLight(page, x + labelW,          tableTop - rowH, lrBottomY);
  vlineLight(page, x + labelW + valueW, tableTop - rowH, lrBottomY);

  // L/R rows.
  const baselineOffset = (rowH - bodySize) / 2 + 1.5;
  for (let i = 0; i < lrCount; i++) {
    const row = rows[i] as LR;
    const baselineY = tableTop - rowH * (i + 2) + baselineOffset;
    page.drawText(row.label, { x: x + padX, y: baselineY, size: bodySize, font: regular, color: PALETTE.text });
    for (const [colIdx, raw] of [[1, row.right], [2, row.left]] as const) {
      if (!raw) continue;
      const text = t('anesthesia.dose', { value: raw });
      const colX = x + labelW + valueW * (colIdx - 1);
      const w = regular.widthOfTextAtSize(text, bodySize);
      page.drawText(text, { x: colX + (valueW - w) / 2, y: baselineY, size: bodySize, font: regular, color: PALETTE.ink });
    }
  }

  // Other row — label aligned to the first line, value wrapped beneath.
  const otherFirstBaseline = otherTopY - otherLineHeight + (otherLineHeight - bodySize) / 2 + 1.5;
  page.drawText(otherRow.label, {
    x: x + padX,
    y: otherLines.length > 0 ? otherFirstBaseline : otherTopY - rowH + baselineOffset,
    size: bodySize, font: regular, color: PALETTE.text,
  });
  let lineY = otherFirstBaseline;
  for (const line of otherLines) {
    page.drawText(line, { x: otherValueX, y: lineY, size: bodySize, font: regular, color: PALETTE.ink });
    lineY -= otherLineHeight;
  }

  finishSectionCard(page, x, cardTop, totalW, CARD_BAND_PT + totalH);

  // Bottom edge in inches from the page top (card top → band → table).
  const { height: ph } = page.getSize();
  return (ph - (cardTop - CARD_BAND_PT - totalH)) / PT_PER_IN;
}

// -------------------------------------------------------------- Diagram --

export async function drawDiagramAt(
  pdfDoc: PDFDocument,
  slot: DiagramSlot,
  pngBytes: Uint8Array,
  /** When set, the diagram centers vertically between slot.yTopIn and
   *  this bottom edge (inches from page top) instead of hanging from the
   *  slot top — fills tall leftover regions evenly above and below. */
  regionBottomIn?: number
): Promise<void> {
  const page = pdfDoc.getPage(slot.pageIndex);
  const { height: pageHeight } = page.getSize();
  const png = await pdfDoc.embedPng(pngBytes);
  const aspect = png.width / png.height;
  const maxWidthPt = slot.maxWidthIn * PT_PER_IN;
  let heightPt: number;
  let widthPt: number;
  if (regionBottomIn !== undefined) {
    // Fill the available region: scale the (already content-cropped) PNG
    // as large as the column width and region height allow.
    const regionPt = (regionBottomIn - slot.yTopIn) * PT_PER_IN;
    const scale = Math.min(maxWidthPt / png.width, regionPt / png.height);
    widthPt = png.width * scale;
    heightPt = png.height * scale;
  } else {
    heightPt = slot.heightIn * PT_PER_IN;
    widthPt = heightPt * aspect;
    if (widthPt > maxWidthPt) {
      widthPt = maxWidthPt;
      heightPt = widthPt / aspect;
    }
  }
  const colLeftPt = slot.xIn * PT_PER_IN;
  const colWidthPt = slot.columnWidthIn * PT_PER_IN;
  const x = colLeftPt + (colWidthPt - widthPt) / 2;
  let yTop = pageHeight - slot.yTopIn * PT_PER_IN;
  if (regionBottomIn !== undefined) {
    const regionPt = (regionBottomIn - slot.yTopIn) * PT_PER_IN;
    if (regionPt > heightPt) {
      yTop -= (regionPt - heightPt) / 2;
    }
  }
  page.drawImage(png, { x, y: yTop - heightPt, width: widthPt, height: heightPt });
}

// ---------------------------------------------------------------- Footer --

export function drawFooter(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  pageNum: number,
  totalPages: number,
  generatedAt: string,
  identityLine?: string,
  lng = 'en'
): void {
  const t = pdfT(lng);
  const { width: pageWidth } = page.getSize();
  const fontSize = 7;
  const ruleY = 0.40 * PT_PER_IN;

  page.drawLine({
    start: { x: 0.30 * PT_PER_IN, y: ruleY },
    end:   { x: pageWidth - 0.30 * PT_PER_IN, y: ruleY },
    thickness: 0.4, color: PALETTE.border,
  });

  page.drawText(t('footer.generated', { at: generatedAt }), {
    x: 0.30 * PT_PER_IN, y: 0.22 * PT_PER_IN,
    size: fontSize, font, color: PALETTE.muted,
  });

  // Patient identity, centered — pages of a medical record must remain
  // attributable if they're printed or filed separately.
  if (identityLine) {
    const w = fontBold.widthOfTextAtSize(identityLine, fontSize);
    page.drawText(identityLine, {
      x: (pageWidth - w) / 2, y: 0.22 * PT_PER_IN,
      size: fontSize, font: fontBold, color: PALETTE.text,
    });
  }

  // "Page X of Y" — page number bold-emphasized in primary color. The
  // sentence is split around the number so word order follows the language.
  const MARK = '\u0000';
  const [pageStr, ofStr = ''] = t('footer.pageOf', { n: MARK, total: totalPages }).split(MARK);
  const pageNumStr = `${pageNum}`;
  const pageW = fontBold.widthOfTextAtSize(pageNumStr, fontSize);
  const ofW   = font.widthOfTextAtSize(ofStr, fontSize);
  const totalW = pageW + ofW + font.widthOfTextAtSize(pageStr, fontSize);
  let cursor = pageWidth - 0.30 * PT_PER_IN - totalW;
  page.drawText(pageStr, { x: cursor, y: 0.22 * PT_PER_IN, size: fontSize, font, color: PALETTE.muted });
  cursor += font.widthOfTextAtSize(pageStr, fontSize);
  page.drawText(pageNumStr, { x: cursor, y: 0.22 * PT_PER_IN, size: fontSize, font: fontBold, color: PALETTE.primary });
  cursor += pageW;
  page.drawText(ofStr, { x: cursor, y: 0.22 * PT_PER_IN, size: fontSize, font, color: PALETTE.muted });
}

// Form parameter exists historically (older sections accepted a PDFForm
// that they wrote into). All sections are now non-interactive, but the
// signature for some callers is preserved as `_form: PDFForm` to avoid
// rippling changes through generateDentalChartPDF. Suppress unused.
export function _unusedFormSignaturePin(_: PDFForm): void { /* no-op */ }

// --------------------------------------------------------------- Images --

/** One chart image for the PDF's image pages. `jpegBytes: null` means the
 *  file couldn't be fetched — it still gets a labelled cell so the PDF
 *  never silently drops part of the record. */
export interface PdfImage {
  jpegBytes: Uint8Array | null;
  caption: string;
  kind: 'photo' | 'xray';
}

export const IMAGES_PER_PAGE = 4;

/** Drop characters the standard (WinAnsi) font can't encode — a caption
 *  with an emoji or arrow would otherwise throw and sink the whole PDF. */
export function pdfSafe(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      /* unsupported glyph — skip */
    }
  }
  return out;
}

/**
 * One page of chart images in a 2×2 grid inside a single section card.
 * Each cell fits its image (aspect preserved, centered) above a one-line
 * "N. Photo — caption" label. `startIndex` is the 0-based number of the
 * first image on this page, so labels count across pages.
 */
export async function drawImagePage(
  pdfDoc: PDFDocument,
  page: PDFPage,
  images: PdfImage[],
  startIndex: number,
  totalImages: number,
  font: PDFFont,
  fontBold: PDFFont,
  lng = 'en'
): Promise<void> {
  const t = pdfT(lng);
  const { height: pageHeight } = page.getSize();
  const cardX = 0.30 * PT_PER_IN;
  const cardW = 10.40 * PT_PER_IN;
  const cardTop = pageHeight - 0.30 * PT_PER_IN;
  const cardBottom = pageHeight - 8.02 * PT_PER_IN; // footer rule at 8.10
  const cardH = cardTop - cardBottom;

  const first = startIndex + 1;
  const last = startIndex + images.length;
  const title =
    totalImages === 1
      ? t('images.title')
      : t('images.titleRange', { range: first === last ? `${first}` : `${first}–${last}`, total: totalImages });
  const bodyTop = drawSectionCard(page, cardX, cardTop, cardW, cardH, title, fontBold);

  const pad = 10;
  const gap = 14;
  const labelH = 16;
  const cols = 2;
  const rows = 2;
  const cellW = (cardW - 2 * pad - (cols - 1) * gap) / cols;
  const cellH = (bodyTop - cardBottom - 2 * pad - (rows - 1) * gap) / rows;
  const boxH = cellH - labelH;

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = cardX + pad + col * (cellW + gap);
    const cellTop = bodyTop - pad - row * (cellH + gap);
    const boxBottom = cellTop - boxH;

    let embedded: PDFImage | null = null;
    if (img.jpegBytes) {
      try {
        embedded = await pdfDoc.embedJpg(img.jpegBytes);
      } catch {
        embedded = null;
      }
    }
    if (embedded) {
      const scale = Math.min(cellW / embedded.width, boxH / embedded.height);
      const w = embedded.width * scale;
      const h = embedded.height * scale;
      const x = cellX + (cellW - w) / 2;
      const y = boxBottom + (boxH - h) / 2;
      page.drawImage(embedded, { x, y, width: w, height: h });
      page.drawRectangle({ x, y, width: w, height: h, borderColor: PALETTE.border, borderWidth: 0.5 });
    } else {
      page.drawRectangle({
        x: cellX, y: boxBottom, width: cellW, height: boxH,
        color: PALETTE.rowAlt, borderColor: PALETTE.border, borderWidth: 0.5,
      });
      drawCenteredText(page, t('images.failed'), cellX, cellX + cellW, boxBottom + boxH / 2 - 4, 9, font, PALETTE.muted);
    }

    const n = startIndex + i + 1;
    const kindLabel = img.kind === 'xray' ? t('images.radiograph') : t('images.photo');
    const caption = pdfSafe(img.caption.trim().replace(/\s+/g, ' '), font);
    const label = `${n}. ${kindLabel}${caption ? ` — ${caption}` : ''}`;
    drawClippedText(page, label, cellX, boxBottom - 11, 8.5, font, PALETTE.text, cellW);
  }

  finishSectionCard(page, cardX, cardTop, cardW, cardH);
}
