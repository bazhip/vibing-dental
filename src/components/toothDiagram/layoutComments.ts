import { DiagramComment } from '../../types';
import { SpeciesDiagram } from '../../constants/toothShapes';

/**
 * Pure layout pass for diagram comments. Two cases:
 *
 *   1. **User-positioned** comments (those with explicit `x` / `y`) keep
 *      their stored coordinates verbatim.
 *   2. **Anchored without explicit position** comments stack vertically
 *      in the side gutter (left whitespace if the anchor is on the
 *      patient's right side; right whitespace otherwise) so they don't
 *      cover the diagram itself.
 *
 * Free-floating comments without any anchor or position fall back to a
 * sensible default near the bottom-center.
 */

const SIDE_PAD_RATIO = 0.30;
export const COMMENT_W = 300;
/** Minimum card height: tooth label + two lines of text (18px font /
 *  22px lines / 8px padding). Cards without a user-set height grow to
 *  fit their text via `autoCommentHeight` so the export never clips;
 *  stored (drag-resized) heights are kept verbatim. */
export const COMMENT_H = 96;

// Text metrics mirrored from svgToPng's comment renderer — keep in sync.
const FONT_SIZE = 18;
const LINE_HEIGHT = 22;
const PADDING = 8;
const LABEL_HEIGHT = 22;
const MAX_AUTO_H = 292; // label + 12 lines — beyond this, resize by hand

/** Estimate the height needed to show all of `text` at width `w`, using
 *  the same ~0.55em/char wrap heuristic as the SVG exporter. */
export function autoCommentHeight(text: string, w: number): number {
  const maxWidth = w - PADDING * 2;
  const charsPerLine = Math.max(8, Math.floor(maxWidth / (FONT_SIZE * 0.55)));
  let lines = 0;
  for (const paragraph of (text || '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) { lines += 1; continue; }
    let current = 0;
    let paraLines = 1;
    for (const word of words) {
      const add = (current === 0 ? 0 : 1) + word.length;
      if (current + add > charsPerLine && current > 0) {
        paraLines += 1;
        current = word.length;
      } else {
        current += add;
      }
    }
    lines += paraLines;
  }
  const needed = PADDING * 2 + LABEL_HEIGHT + lines * LINE_HEIGHT;
  return Math.min(MAX_AUTO_H, Math.max(COMMENT_H, needed));
}
const COMMENT_GAP = 6;
const COMMENT_MARGIN_X = 6;

export interface ToothBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
}

export interface PositionedComment {
  comment: DiagramComment;
  x: number;
  y: number;
  w: number;
  h: number;
  anchor: { x: number; y: number; label: string } | null;
}

export function layoutComments(
  comments: DiagramComment[],
  diagram: SpeciesDiagram,
  bboxByTriadan: Map<number, ToothBBox>
): PositionedComment[] {
  const placed: PositionedComment[] = [];
  const leftStack: PositionedComment[] = [];
  const rightStack: PositionedComment[] = [];

  const sidePad = diagram.width * SIDE_PAD_RATIO;
  const midline = diagram.width / 2;

  for (const c of comments) {
    const w = c.width ?? COMMENT_W;
    // Never shorter than the text needs: stored heights (hand resizes,
    // or undersized values written by older versions) still win when
    // LARGER, but a box that would hide its own text grows to fit —
    // on screen and in the PDF export, which reads these same boxes.
    const h = Math.max(c.height ?? 0, autoCommentHeight(c.text, w));

    let anchor: PositionedComment['anchor'] = null;
    let anchorX = -1;
    let anchorY = -1;
    if (c.anchorTriadan != null) {
      const tooth = diagram.teeth.find((t) => t.triadan === c.anchorTriadan);
      if (tooth) {
        const bb = bboxByTriadan.get(tooth.triadan);
        anchorX = bb ? bb.cx : tooth.cx;
        anchorY = bb ? bb.cy : tooth.cy;
        anchor = { x: anchorX, y: anchorY, label: `${tooth.label} (${tooth.triadan})` };
      }
    }

    if (typeof c.x === 'number' && typeof c.y === 'number') {
      // User-positioned (free comments always have x/y; anchored comments
      // get them once dragged).
      placed.push({ comment: c, x: c.x, y: c.y, w, h, anchor });
      continue;
    }

    if (anchor) {
      // Right-side teeth (anchorX < midline) → left whitespace
      // (negative x in the viewBox); left-side teeth → right whitespace.
      const onRight = anchorX < midline;
      const x = onRight
        ? -sidePad + COMMENT_MARGIN_X
        : diagram.width + COMMENT_MARGIN_X;
      const target: PositionedComment = {
        comment: c,
        x,
        y: anchorY - h / 2,
        w,
        h,
        anchor,
      };
      (onRight ? leftStack : rightStack).push(target);
    } else {
      // Free comment without a stored position — drop near bottom-center.
      placed.push({
        comment: c,
        x: diagram.width / 2 - w / 2,
        y: diagram.height - h - 8,
        w,
        h,
        anchor: null,
      });
    }
  }

  // Each side stack is sorted top-down and packed without overlap.
  for (const stack of [leftStack, rightStack]) {
    stack.sort((a, b) => a.y - b.y);
    let nextMinY = 0;
    for (const item of stack) {
      item.y = Math.max(item.y, nextMinY);
      nextMinY = item.y + item.h + COMMENT_GAP;
      placed.push(item);
    }
  }

  return placed;
}
