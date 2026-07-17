import { PDFDocument, PDFFont, PDFForm, PDFPage } from 'pdf-lib';
import { DENTAL_CODES, DentalCode, findCodesInText } from '../../constants/dentalCodes';
import {
  PatientInfo,
  Logo,
  Species,
  ToothData,
  DentalField,
  ExamFindings,
  EXAM_ITEMS,
  NerveBlocks,
} from '../../types';
import { ToothGridLayout, TOOTH_DATA_ROWS } from '../../constants/chartLayout';
import { PALETTE, ACTIVE } from './styles';
import {
  PT_PER_IN,
  PATIENT_INFO_BOX,
  EXAM_TABLE_X_IN,
  EXAM_TABLE_YTOP_IN,
  EXAM_ROW_SHORT_IN,
  EXAM_ROW_TALL_IN,
  EXAM_COMMENT_BOX,
  EXAM_PDF_LABELS,
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
  drawCheckGlyph,
  drawTableHeaderStrip,
  drawSectionCard,
  CARD_BAND_PT,
} from './draw';

/**
 * Section drawers — every visible block on the PDF gets one of these.
 * Each function knows just enough about its own section to lay it out;
 * none of them touch PALETTE / ACTIVE except by reading them (those are
 * mutated up-stack by applyPdfStyle).
 */

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
    page2: codesIn(patientInfo.treatmentReport, ...postCommentTexts),
  };
}

export function drawCodesLegend(
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

  // One card: "Codes Used" band + entries in a single rounded frame.
  const bandBottom = drawSectionCard(page, x, yTop, widthPt, heightPt, 'Codes Used', bold);
  const bodyStartY = bandBottom - 3;
  const bodyHeight = heightPt - (yTop - bodyStartY) - 4;

  // 3-col layout when there's enough content that 2 cols would overflow.
  const useThreeCols = codes.length > 18;
  const codeSize = useThreeCols ? 6.5 : 7;
  const lineHeight = useThreeCols ? 9 : 9.5;
  const cols = useThreeCols ? 3 : 2;
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
    const defLines = wrapToWidth(c.definition, regular, codeSize, defWidth);
    const text = defLines[0] + (defLines.length > 1 ? '…' : '');
    page.drawText(text, { x: cx + codeColWidth, y: cy, size: codeSize, font: regular, color: PALETTE.text });

    rowInCol++;
  }

  if (overflow) {
    if (rowInCol >= rowsPerCol) { col++; rowInCol = 0; }
    const cx = innerX + col * (colWidth + colGap);
    const cy = bodyStartY - rowInCol * lineHeight - lineHeight + 3;
    const remaining = codes.length - (capacity - 1);
    page.drawText(`+${remaining} more`, {
      x: cx, y: cy, size: codeSize, font: bold, color: PALETTE.muted,
    });
  }
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
  fontBold: PDFFont
): Promise<void> {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const titleSize = 22;
  const subtitleSize = 9;
  const SPECIES_TITLES: Record<Species, string> = {
    canine: 'Canine',
    'canine-deciduous': 'Canine (Deciduous)',
    feline: 'Feline',
    'feline-deciduous': 'Feline (Deciduous)',
  };
  const titleText = `${SPECIES_TITLES[species]} Dental Chart`;
  const subtitleText = 'Periodontal Assessment & Treatment Plan';
  const logoWidthIn = 2.20;
  const logoWidth = logoWidthIn * PT_PER_IN;
  const logoUrl = logo === 'vca' ? 'logo_vca.png' : 'logo_socal.png';
  const logoLeftPt = 0.30 * PT_PER_IN;
  const logoTopPt = pageHeight - 0.35 * PT_PER_IN;

  // Both logos use their original brand colors — SoCal stays dark grey +
  // pink, VCA stays its house palette. The active style only drives the
  // surrounding chrome (titles, table headers, comment cards), not the
  // mark itself.
  // Fallback placement assumes a ~2:1 logo so the doctor name / underline
  // below still land sensibly if the asset can't be loaded.
  let logoBottomPt = logoTopPt - logoWidth * 0.5;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) throw new Error(`logo fetch failed: ${res.status}`);
    const logoBytes = await res.arrayBuffer();
    const png = await pdfDoc.embedPng(new Uint8Array(logoBytes));
    const logoHeight = logoWidth * (png.height / png.width);
    logoBottomPt = logoTopPt - logoHeight;
    page.drawImage(png, {
      x: logoLeftPt, y: logoBottomPt,
      width: logoWidth, height: logoHeight,
    });
  } catch (err) {
    // A missing/unreachable logo must not sink the entire chart export.
    // Drop in a text wordmark and carry on.
    // eslint-disable-next-line no-console
    console.warn('[pdf] logo unavailable, using text fallback', err);
    page.drawText(logo === 'vca' ? 'VCA' : 'SoCal Veterinary Dentistry', {
      x: logoLeftPt + 2, y: logoTopPt - 18,
      size: 14, font: fontBold, color: PALETTE.ink,
    });
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
    drawClippedText(page, `Tech: ${techName}`, logoLeftPt + 2, techBaselineY,
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
}

// ----------------------------------------------------------- Patient info --

export function drawPatientInfoBox(
  page: PDFPage,
  patientInfo: PatientInfo,
  font: PDFFont,
  fontBold: PDFFont
): void {
  const { height: pageHeight } = page.getSize();
  const x = PATIENT_INFO_BOX.xIn * PT_PER_IN;
  const yTop = pageHeight - PATIENT_INFO_BOX.yTopIn * PT_PER_IN;
  const labelW = PATIENT_INFO_BOX.labelColIn * PT_PER_IN;
  const valueW = PATIENT_INFO_BOX.valueColIn * PT_PER_IN;
  const totalW = labelW + valueW;

  type Row = { label: string; value?: string; multiline?: boolean; heightIn: number };
  // Patient + PID for both logos — Doctor / Tech live in the logo header
  // for VCA, not in the patient info box.
  const rows: Row[] = [
    { label: 'Date',            value: patientInfo.date,          heightIn: PATIENT_INFO_BOX.rowDateIn },
    { label: 'Patient',         value: patientInfo.patientName,   heightIn: PATIENT_INFO_BOX.rowPatientIn },
    { label: 'PID',             value: patientInfo.patientNumber, heightIn: PATIENT_INFO_BOX.rowIdIn },
    { label: 'Chief Complaint', value: patientInfo.complaint, multiline: true, heightIn: PATIENT_INFO_BOX.rowChiefIn },
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
    'Patient Information', fontBold
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
        // Fit-to-box instead of a silent 3-line clamp: shrink the font
        // toward a floor first, and if it still can't fit, end with an
        // ellipsis so the reader knows the record is truncated here.
        const cleaned = row.value.replace(/\s+/g, ' ').trim();
        if (cleaned) {
          const { lines, fontSize: fitSize } = fitTextToLines(
            cleaned, font, valueWidth, 3, valueFontSize, 6.5
          );
          let lineY = yCursor - 4;
          for (const line of lines) {
            lineY -= fitSize + 2.5;
            page.drawText(line, { x: valueX, y: lineY, size: fitSize, font, color: PALETTE.ink });
          }
        }
      } else {
        const baselineY = rowBottom + (rowH - valueFontSize) / 2 + 1.5;
        drawClippedText(page, row.value, valueX, baselineY, valueFontSize, font, PALETTE.ink, valueWidth);
      }
    }
    yCursor = rowBottom;
  }
}

// ---------------------------------------------------------------- Exam ----

export function drawExamSection(
  page: PDFPage,
  exam: ExamFindings,
  font: PDFFont,
  fontBold: PDFFont
): number {
  const { height: pageHeight } = page.getSize();
  const fontSize = 9;
  const cbSize = 9;
  const xPt = EXAM_TABLE_X_IN * PT_PER_IN;
  const sectionWidth = (EXAM_COMMENT_BOX.xIn + EXAM_COMMENT_BOX.widthIn - EXAM_TABLE_X_IN) * PT_PER_IN;
  const commentXPt = EXAM_COMMENT_BOX.xIn * PT_PER_IN;
  const commentWidthPt = EXAM_COMMENT_BOX.widthIn * PT_PER_IN;

  const bodyTopPt = pageHeight - EXAM_TABLE_YTOP_IN * PT_PER_IN;

  // Per-row layout: short row when 0–1 lines of comment, tall when 2.
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
      cleaned, font, commentWidthPt, 2,
      EXAM_COMMENT_BOX.maxFontSizePt, EXAM_COMMENT_BOX.minFontSizePt
    );
    const lineHeight = cFontSize * EXAM_COMMENT_BOX.lineHeightFactor;
    const heightIn = lines.length > 1 ? EXAM_ROW_TALL_IN : EXAM_ROW_SHORT_IN;
    return { heightPt: heightIn * PT_PER_IN, comment: { lines, fontSize: cFontSize, lineHeight } };
  });

  // One card around the band + every exam row (heights vary with comment
  // wrapping, so the total is computed from the laid-out rows).
  const rowsTotalH = layouts.reduce((acc, l) => acc + l.heightPt, 0);
  drawSectionCard(
    page, xPt, bodyTopPt + CARD_BAND_PT, sectionWidth,
    CARD_BAND_PT + rowsTotalH, 'Oral Exam Findings', fontBold
  );

  let cursorY = bodyTopPt;
  for (let i = 0; i < EXAM_ITEMS.length; i++) {
    const { key } = EXAM_ITEMS[i];
    const item = exam[key];
    const layout = layouts[i];
    const rowTopY = cursorY;
    const rowBottomY = cursorY - layout.heightPt;
    const rowMidY = (rowTopY + rowBottomY) / 2;
    const cbY = rowMidY - cbSize / 2;
    const labelY = rowMidY - fontSize / 2 + 1.5;

    const abnormal = item.status === 'abnormal';

    // Abnormal rows get the app's red wash; normal rows keep the zebra.
    // Inset so fills stay inside the card's rounded corners.
    if (abnormal) {
      page.drawRectangle({ x: xPt + 0.6, y: rowBottomY, width: sectionWidth - 1.2, height: layout.heightPt, color: PALETTE.dangerTint });
    } else if (i % 2 === 1) {
      page.drawRectangle({ x: xPt + 0.6, y: rowBottomY, width: sectionWidth - 1.2, height: layout.heightPt, color: PALETTE.rowAlt });
    }

    // Left buffer so the first checkbox doesn't sit flush against the
    // card frame — mirrors the app's padded radio cells.
    let glyphX = xPt + 7;
    drawCheckGlyph(page, glyphX, cbY, cbSize, item.status === 'normal');
    glyphX += cbSize + 4;
    page.drawText('N', { x: glyphX, y: labelY, size: fontSize, font, color: PALETTE.muted });
    glyphX += font.widthOfTextAtSize('N', fontSize) + 14;

    // Abnormal findings carry the clinical signal color so they scan
    // instantly on a dense page — same language as the app.
    drawCheckGlyph(page, glyphX, cbY, cbSize, abnormal, PALETTE.danger);
    glyphX += cbSize + 4;
    page.drawText('A', {
      x: glyphX, y: labelY, size: fontSize,
      font: abnormal ? fontBold : font,
      color: abnormal ? PALETTE.danger : PALETTE.muted,
    });
    glyphX += font.widthOfTextAtSize('A', fontSize) + 12;

    vlineLight(page, glyphX - 4, rowTopY - 2, rowBottomY + 2);

    const labelText = EXAM_PDF_LABELS[key] ?? key;
    page.drawText(labelText, {
      x: glyphX, y: labelY, size: fontSize,
      font: abnormal ? fontBold : font,
      color: abnormal ? PALETTE.danger : PALETTE.text,
    });

    if (layout.comment) {
      const { lines, fontSize: cSize, lineHeight } = layout.comment;
      const blockHeight = lines.length * lineHeight;
      // Center the block in the row, but never let its top rise above the
      // row top (a tall 2-line comment would otherwise clip into the row
      // above).
      const blockTopY = Math.min(rowMidY + blockHeight / 2, rowTopY - 2);
      for (let j = 0; j < lines.length; j++) {
        const baselineY = blockTopY - (j + 1) * lineHeight + (lineHeight - cSize) / 2;
        page.drawText(lines[j], { x: commentXPt, y: baselineY, size: cSize, font, color: PALETTE.text });
      }
    }

    cursorY = rowBottomY;
  }

  // Bottom edge in inches from the page top, so the caller can place the
  // arch grids dynamically beneath.
  return (pageHeight - cursorY) / PT_PER_IN;
}

// ------------------------------------------------------------ Tooth grid --

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

  drawCenteredText(page, 'Tooth',   x, x + labelW, baselineForRow(0, headerSize), headerSize, fontBold, headerText);
  drawCenteredText(page, 'Triadan', x, x + labelW, baselineForRow(1, headerSize), headerSize, fontBold, headerText);
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
    drawCenteredText(page, dataRow.label, x, x + labelW, baselineForRow(rowIdx, labelSize), labelSize, fontBold, PALETTE.muted);
    const fieldKey = SUFFIX_TO_FIELD[dataRow.suffix];
    for (let i = 0; i < layout.teeth.length; i++) {
      const tooth = layout.teeth[i];
      const td = toothData.find((t) => t.triadan === tooth.triadan);
      const value = td ? (td[fieldKey] ?? '') : '';
      if (!value) continue;
      const cellLeft = x + labelW + i * toothW;
      const cellRight = cellLeft + toothW;
      drawCenteredText(page, value, cellLeft, cellRight, baselineForRow(rowIdx, cellFontSize), cellFontSize, font, PALETTE.ink);
    }
  }
}

// ------------------------------------------------------- Treatment Report --

export function drawTreatmentReportField(
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

  // One card: title band + writing area in a single rounded frame. The
  // card's bottom edge stays at the old field bottom.
  const fieldY = pageHeight - (TREATMENT_REPORT.fieldYTopIn + TREATMENT_REPORT.fieldHeightIn) * PT_PER_IN;
  const cardH = titleYTopPt - fieldY;
  const bodyTop = drawSectionCard(
    page, xPt, titleYTopPt, fieldW, cardH,
    'Treatment & Surgery Report', fontBold
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
      page.drawText('… continued — full report is embedded in this file (load it back into the app).', {
        x: innerX, y: noteY, size: 7.5, font, color: PALETTE.muted,
      });
    } else {
      drawWrappedText(page, value, innerX, innerYTop, innerWidth,
        fontSize, lineHeight, font, PALETTE.ink);
    }
  }
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
  isVca: boolean
): number {
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
  const rows: Array<LR | Free> = [
    { kind: 'lr',   label: 'Infraorbital',      right: nerveBlocks.infraorbitalRight     || '', left: nerveBlocks.infraorbitalLeft     || '' },
    { kind: 'lr',   label: 'Inferior Alveolar', right: nerveBlocks.inferiorAlveolarRight || '', left: nerveBlocks.inferiorAlveolarLeft || '' },
    { kind: 'lr',   label: 'Mental',            right: nerveBlocks.mentalRight           || '', left: nerveBlocks.mentalLeft           || '' },
    { kind: 'free', label: 'Other',             value: nerveBlocks.other                 || '' },
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
  const totalH = rowH * (lrCount + 1) + otherRowH;

  // One card: title band + table inside a single rounded frame.
  const cardTop = yTop + 0.20 * PT_PER_IN;
  const bodyTop = drawSectionCard(
    page, x, cardTop, totalW, CARD_BAND_PT + totalH,
    'Anesthesia · Nerve Blocks', bold
  );

  const drug = nerveBlocks.drug?.trim() || (isVca ? 'Ropivacaine' : 'Bupivacaine');
  const headerLabel = `Nerve Block 0.5% ${drug}`;
  let headerLabelSize = headerSize;
  const headerMaxWidth = labelW - padX * 2;
  while (headerLabelSize > 6 && bold.widthOfTextAtSize(headerLabel, headerLabelSize) > headerMaxWidth) {
    headerLabelSize -= 0.25;
  }
  drawTableHeaderStrip(page, x, bodyTop - rowH, totalW, rowH, [
    { text: headerLabel, xPt: x,                    widthPt: labelW, align: 'left' },
    { text: 'RIGHT',     xPt: x + labelW,           widthPt: valueW, align: 'center' },
    { text: 'LEFT',      xPt: x + labelW + valueW,  widthPt: valueW, align: 'center' },
  ], bold, headerLabelSize);

  // Alternating row tints — L/R rows are rowH, the Other row is otherRowH.
  for (let i = 0; i < lrCount; i++) {
    if (i % 2 === 1) {
      page.drawRectangle({
        x: x + 0.6, y: bodyTop - rowH * (i + 2),
        width: totalW - 1.2, height: rowH, color: PALETTE.rowAlt,
      });
    }
  }
  const otherTopY = bodyTop - rowH * (lrCount + 1); // below header + L/R rows
  if (lrCount % 2 === 1) {
    page.drawRectangle({ x: x + 0.6, y: otherTopY - otherRowH, width: totalW - 1.2, height: otherRowH, color: PALETTE.rowAlt });
  }

  // Interior gridlines — the card frame is the outer border.
  for (let i = 1; i <= lrCount + 1; i++) {
    hlineLight(page, x, x + totalW, bodyTop - rowH * i);
  }
  const lrBottomY = bodyTop - rowH * (lrCount + 1);
  vlineLight(page, x + labelW,          bodyTop - rowH, lrBottomY);
  vlineLight(page, x + labelW + valueW, bodyTop - rowH, lrBottomY);

  // L/R rows.
  const baselineOffset = (rowH - bodySize) / 2 + 1.5;
  for (let i = 0; i < lrCount; i++) {
    const row = rows[i] as LR;
    const baselineY = bodyTop - rowH * (i + 2) + baselineOffset;
    page.drawText(row.label, { x: x + padX, y: baselineY, size: bodySize, font: regular, color: PALETTE.text });
    for (const [colIdx, raw] of [[1, row.right], [2, row.left]] as const) {
      if (!raw) continue;
      const text = `${raw} mL`;
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

  // Bottom edge in inches from the page top (card top → band → table).
  const { height: ph } = page.getSize();
  return (ph - (cardTop - CARD_BAND_PT - totalH)) / PT_PER_IN;
}

// -------------------------------------------------------------- Diagram --

export async function drawDiagramAt(
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

// ---------------------------------------------------------------- Footer --

export function drawFooter(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  pageNum: number,
  totalPages: number,
  generatedAt: string,
  identityLine?: string
): void {
  const { width: pageWidth } = page.getSize();
  const fontSize = 7;
  const ruleY = 0.40 * PT_PER_IN;

  page.drawLine({
    start: { x: 0.30 * PT_PER_IN, y: ruleY },
    end:   { x: pageWidth - 0.30 * PT_PER_IN, y: ruleY },
    thickness: 0.4, color: PALETTE.border,
  });

  page.drawText(`Generated ${generatedAt}`, {
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

  // "Page X of Y" — page number bold-emphasized in primary color.
  const pageNumStr = `${pageNum}`;
  const ofStr = ` of ${totalPages}`;
  const pageW = fontBold.widthOfTextAtSize(pageNumStr, fontSize);
  const ofW   = font.widthOfTextAtSize(ofStr, fontSize);
  const totalW = pageW + ofW + font.widthOfTextAtSize('Page ', fontSize);
  let cursor = pageWidth - 0.30 * PT_PER_IN - totalW;
  page.drawText('Page ', { x: cursor, y: 0.22 * PT_PER_IN, size: fontSize, font, color: PALETTE.muted });
  cursor += font.widthOfTextAtSize('Page ', fontSize);
  page.drawText(pageNumStr, { x: cursor, y: 0.22 * PT_PER_IN, size: fontSize, font: fontBold, color: PALETTE.primary });
  cursor += pageW;
  page.drawText(ofStr, { x: cursor, y: 0.22 * PT_PER_IN, size: fontSize, font, color: PALETTE.muted });
}

// Form parameter exists historically (older sections accepted a PDFForm
// that they wrote into). All sections are now non-interactive, but the
// signature for some callers is preserved as `_form: PDFForm` to avoid
// rippling changes through generateDentalChartPDF. Suppress unused.
export function _unusedFormSignaturePin(_: PDFForm): void { /* no-op */ }
