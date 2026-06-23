import { PDFFont, PDFPage, rgb } from 'pdf-lib';
import { PALETTE, ACTIVE } from './styles';

/**
 * Pure drawing primitives + the variant-aware section-title and
 * table-header renderers. Reads style state via PALETTE / ACTIVE
 * (mutated up the stack by applyPdfStyle); never mutates them.
 *
 * "Primitive" = doesn't know about chart sections; just draws shapes
 * and text on a page.
 */

// ---------- Lines ---------------------------------------------------------
export const hlineLight = (page: PDFPage, x1: number, x2: number, y: number) =>
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.4, color: PALETTE.border });

export const vlineLight = (page: PDFPage, xv: number, y1: number, y2: number) =>
  page.drawLine({ start: { x: xv, y: y1 }, end: { x: xv, y: y2 }, thickness: 0.4, color: PALETTE.border });

export const hlineStrong = (page: PDFPage, x1: number, x2: number, y: number) =>
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: PALETTE.borderStrong });

export const vlineStrong = (page: PDFPage, xv: number, y1: number, y2: number) =>
  page.drawLine({ start: { x: xv, y: y1 }, end: { x: xv, y: y2 }, thickness: 0.6, color: PALETTE.borderStrong });

// ---------- Text helpers --------------------------------------------------

/** Word-wrap to fit `maxWidth` at the given `size`. Words wider than
 *  `maxWidth` break into their own line rather than overflow. */
export function wrapToWidth(
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

/** Find the largest font size at which `text` fits in <= maxLines lines.
 *  Hard-clips with ellipsis if even the minimum size needs more. */
export function fitTextToLines(
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

/** Single-line text, hard-clipped with an ellipsis if it overflows. */
export function drawClippedText(
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

/** Multi-paragraph text: split on \n, wrap each paragraph, draw each
 *  line. Returns y after the last line. */
export function drawWrappedText(
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
      // A blank paragraph still consumes a line of vertical space, so it
      // must count against maxLines or it can overflow a capped box.
      if (maxLines !== undefined && linesDrawn >= maxLines) break outer;
      cursorY -= lineHeight;
      linesDrawn++;
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

/** Centered text helper (used by tooth-grid headers etc.). */
export function drawCenteredText(
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
  page.drawText(text, { x: x1 + (x2 - x1 - w) / 2, y: baselineY, size, font, color });
}

/** Drawn (non-interactive) checkbox glyph. */
export function drawCheckGlyph(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  checked: boolean
): void {
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

/** YYYY-MM-DD HH:MM */
export function formatGeneratedAt(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()     ).padStart(2, '0');
  const hh   = String(d.getHours()    ).padStart(2, '0');
  const min  = String(d.getMinutes()  ).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

// ---------- Section title (variant dispatcher) ----------------------------

/**
 * Section heading. Dispatches to a variant based on
 * ACTIVE.sectionTitleVariant (set by applyPdfStyle). Returns the
 * y-coord just below the rendered title (whatever shape it takes).
 */
export function drawSectionTitle(
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

// ---------- Table header strip (variant dispatcher) -----------------------

export interface TableHeaderCell {
  text: string;
  xPt: number;
  widthPt: number;
  align?: 'left' | 'center';
}

/**
 * Header strip used by every table. Variants control whether there's a
 * fill, a colored rule under it, or nothing at all (just the cell text).
 */
export function drawTableHeaderStrip(
  page: PDFPage,
  xPt: number,
  yBottomPt: number,
  widthPt: number,
  heightPt: number,
  cells: TableHeaderCell[],
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
  } // 'none': just text, no fill / rule

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
