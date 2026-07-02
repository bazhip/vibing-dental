import React from 'react';
import {
  Species,
  ToothMark,
  ToothMarks,
  DiagramComment,
  DiagramStroke,
  StrokePoint,
} from '../types';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import { CodeField } from './CodeField';
// Pure helpers extracted from this component for testability.
import {
  layoutComments,
  COMMENT_W,
  COMMENT_H,
  type ToothBBox,
} from './toothDiagram/layoutComments';
import {
  loadParsedDiagram,
  type ParsedDiagram,
  type SvgSubpath,
} from './toothDiagram/parseSvg';

export type DiagramTool = 'mark' | 'comment' | 'draw';

/** Which marks the user can cycle through on this diagram.
 *   - "missing-only": pre-surgery — toggles between clear and "missing".
 *   - "extracted-only": post-surgery — toggles between clear and "extracted".
 *   - "all": cycles clear → missing → extracted → clear (legacy / general).
 */
export type MarkMode = 'missing-only' | 'extracted-only' | 'all';

export function cycleMark(
  current: ToothMark | undefined,
  mode: MarkMode = 'all'
): ToothMark | undefined {
  if (mode === 'missing-only') return current === 'missing' ? undefined : 'missing';
  if (mode === 'extracted-only') return current === 'extracted' ? undefined : 'extracted';
  if (current === undefined) return 'missing';
  if (current === 'missing') return 'extracted';
  return undefined;
}

// SVG viewBox is padded out past the diagram's natural bbox in every
// direction so anchored comments and dragged free comments have somewhere
// to live (and the pad scales with diagram size, so feline / canine both
// get reasonable space).
const SIDE_PAD_RATIO = 0.30;
const TOP_PAD_RATIO = 0.10;
const BOTTOM_PAD_RATIO = 0.10;
const COMMENT_MIN_W = 90;
const COMMENT_MIN_H = 50;

interface ToothDiagramProps {
  species: Species;
  toothMarks: ToothMarks;
  onToothMarksChange: (marks: ToothMarks) => void;
  comments: DiagramComment[];
  onCommentsChange: (comments: DiagramComment[]) => void;
  strokes: DiagramStroke[];
  onStrokesChange: (strokes: DiagramStroke[]) => void;
  tool: DiagramTool;
  strokeColor: string;
  strokeWidth: number;
  /** Triadans that are locked from user edits — used by the post-surgery
   *  diagram to enforce that teeth missing pre-surgery stay missing. */
  lockedTriadans?: Set<number>;
  /** Constrains which marks this diagram can toggle through. */
  markMode?: MarkMode;
}

// Pure SVG-parser + comment-layout helpers live in `./toothDiagram/*` —
// extraction makes them testable in isolation.

export interface CommentExport {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  text: string;
}

export interface ToothDiagramHandle {
  getSvgElement: () => SVGSVGElement | null;
  /** Snapshot of laid-out comment boxes, used by the PDF exporter to render
   *  the comments as native SVG text in the cloned export SVG. */
  getCommentExports: () => CommentExport[];
  /** ViewBox parameters so the exporter can use the same crop. */
  getViewBox: () => { x: number; y: number; w: number; h: number };
}

export const ToothDiagram = React.forwardRef<ToothDiagramHandle, ToothDiagramProps>(({
  species,
  toothMarks,
  onToothMarksChange,
  comments,
  onCommentsChange,
  strokes,
  onStrokesChange,
  tool,
  strokeColor,
  strokeWidth,
  lockedTriadans,
  markMode = 'all',
}, ref) => {
  const svgRef = React.useRef<SVGSVGElement>(null);
  // Wraps both the SVG and the HTML comment overlay; used by the
  // auto-focus effect to locate a freshly-added comment's textarea.
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  // The stroke being drawn right now. Kept in local state (not committed to
  // the parent per pointermove) so drawing doesn't re-render the whole chart
  // per point or flood the undo history with one snapshot per point — the
  // finished stroke is committed once on pointer-up as a single undo step.
  const [liveStroke, setLiveStroke] = React.useState<DiagramStroke | null>(null);
  const [rawParsed, setRawParsed] = React.useState<ParsedDiagram | null>(null);
  const [hoveredTriadan, setHoveredTriadan] = React.useState<number | null>(null);

  // Imperative handle deferred to after layout/viewBox computations below
  // (so the values are in scope) — see useImperativeHandle further down.

  const diagram = TOOTH_DIAGRAMS[species];
  const svgUrl = diagram.imageSrc.replace(/\.png$/i, '.svg');

  React.useEffect(() => {
    let cancelled = false;
    setRawParsed(null);
    loadParsedDiagram(svgUrl)
      .then((p) => {
        if (!cancelled) setRawParsed(p);
      })
      .catch((err) => {
        console.error('Failed to load diagram SVG', err);
      });
    return () => {
      cancelled = true;
    };
  }, [svgUrl]);

  // Cull the hand-drawn label letterforms and wobbly midline dashes from the
  // traced outline (their bboxes live in diagram.labelCulls) — they render
  // blurry at app scale and are replaced below with native SVG text and a
  // straight dashed line. If the diagram declares a mandibleRescale (the
  // deciduous chart), the lower-arch subpaths are then uniformly scaled and
  // lifted to match the tooth anchors, which carry the same transform.
  // Everything downstream (tooth matching, outline render) consumes this
  // cleaned version.
  const parsed = React.useMemo<ParsedDiagram | null>(() => {
    if (!rawParsed) return null;
    const culls = diagram.labelCulls;
    let subpaths = rawParsed.subpaths;
    if (culls.length) {
      subpaths = subpaths.filter((sp) => {
        const cx = (sp.minX + sp.maxX) / 2;
        const cy = (sp.minY + sp.maxY) / 2;
        return !culls.some(
          (b) => cx >= b.minX && cx <= b.maxX && cy >= b.minY && cy <= b.maxY
        );
      });
    }
    const r = diagram.mandibleRescale;
    if (r) {
      const tx = (x: number) => r.centerX + (x - r.centerX) * r.scale;
      const ty = (y: number) => r.targetY + (y - r.refY) * r.scale;
      subpaths = subpaths.map((sp) => {
        if ((sp.minY + sp.maxY) / 2 <= r.belowY) return sp;
        // All path data in these SVGs uses absolute M/L/C/Z commands, so
        // coordinates are strictly alternating x,y pairs between letters.
        const tokens = sp.d.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g) ?? [];
        let isX = true;
        const out: string[] = [];
        for (const tok of tokens) {
          if (/^[A-Za-z]$/.test(tok)) {
            out.push(tok);
            isX = true;
          } else {
            out.push((isX ? tx(parseFloat(tok)) : ty(parseFloat(tok))).toFixed(2));
            isX = !isX;
          }
        }
        return {
          d: out.join(' '),
          minX: tx(sp.minX), maxX: tx(sp.maxX),
          minY: ty(sp.minY), maxY: ty(sp.maxY),
          cx: tx(sp.cx), cy: ty(sp.cy),
        };
      });
    }
    if (subpaths === rawParsed.subpaths) return rawParsed;
    return { subpaths, outlineD: subpaths.map((s) => s.d).join(' ') };
  }, [rawParsed, diagram]);

  // Assign each subpath to closest tooth anchor, but only if it's actually
  // within that tooth's neighborhood. Subpaths that aren't close to any tooth
  // (e.g. "Maxilla" text, R/L midline dashes) stay unassigned and only render
  // in the static base layer.
  const subpathsByTriadan = React.useMemo(() => {
    const map = new Map<number, number[]>();
    if (!parsed) return map;
    parsed.subpaths.forEach((sp, i) => {
      let closestTriadan = -1;
      let minDist = Infinity;
      for (const t of diagram.teeth) {
        const dx = sp.cx - t.cx;
        const dy = sp.cy - t.cy;
        const d = dx * dx + dy * dy;
        const threshold = Math.max(40, Math.max(t.rx, t.ry) * 2);
        if (d < threshold * threshold && d < minDist) {
          minDist = d;
          closestTriadan = t.triadan;
        }
      }
      if (closestTriadan < 0) return;
      const list = map.get(closestTriadan);
      if (list) list.push(i);
      else map.set(closestTriadan, [i]);
    });
    return map;
  }, [parsed, diagram]);

  // For each tooth, the largest subpath by bbox area = the outer outline.
  // Used as the tooth-shaped fill for "missing" and as the bbox for the X
  // overlay and hit area.
  //
  // Some traced SVGs (e.g. the cat's central incisors) include a single
  // "compound" subpath whose bbox covers multiple teeth — that subpath
  // would otherwise win the largest-area pick and make hover/clicks bleed
  // across teeth. Skip any subpath whose bbox clearly contains a different
  // tooth's anchor.
  const outerSubpathByTriadan = React.useMemo(() => {
    const map = new Map<number, number>();
    if (!parsed) return map;
    const COMPOUND_MARGIN = 5;
    subpathsByTriadan.forEach((indices, triadan) => {
      let maxArea = -1;
      let outerIdx = -1;
      for (const i of indices) {
        const sp = parsed.subpaths[i];
        const isCompound = diagram.teeth.some(
          (other) =>
            other.triadan !== triadan &&
            sp.minX + COMPOUND_MARGIN <= other.cx &&
            other.cx <= sp.maxX - COMPOUND_MARGIN &&
            sp.minY + COMPOUND_MARGIN <= other.cy &&
            other.cy <= sp.maxY - COMPOUND_MARGIN
        );
        if (isCompound) continue;
        const area = (sp.maxX - sp.minX) * (sp.maxY - sp.minY);
        if (area > maxArea) {
          maxArea = area;
          outerIdx = i;
        }
      }
      if (outerIdx >= 0) map.set(triadan, outerIdx);
    });
    return map;
  }, [parsed, subpathsByTriadan, diagram]);

  // Per-tooth render shape — picks the cleanest available representation:
  //   (a) the SVG outer subpath, if one is large enough on its own;
  //   (b) the compound-minus-cutouts shape (compound subpath + neighbouring
  //       teeth's outers, rendered with evenodd), for teeth that exist as
  //       negative space inside a multi-tooth compound (e.g. canine M2 right);
  //   (c) an ellipse derived from the anchor's cx/cy/rx/ry, as a last resort.
  // The bbox returned is for the *visible* tooth area only — for (b) it's the
  // strip of the compound on the anchor's side of the cutout(s), so the X
  // overlay lands on M2 instead of spanning M2+M1.
  type RenderShape =
    | { kind: 'path'; d: string; fillRule?: 'evenodd' | 'nonzero' }
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

  interface RenderInfo {
    shape: RenderShape;
    bbox: ToothBBox;
  }

  const renderInfoByTriadan = React.useMemo(() => {
    const map = new Map<number, RenderInfo>();
    if (!parsed) return map;

    const bboxOf = (sp: SvgSubpath): ToothBBox => ({
      minX: sp.minX, minY: sp.minY, maxX: sp.maxX, maxY: sp.maxY,
      cx: sp.cx, cy: sp.cy,
    });

    for (const t of diagram.teeth) {
      // (0) Hand-crafted hit shape from toothShapes.ts wins over the
      // auto-matcher. Used for teeth where the SVG outline traces a
      // compound boundary with neighbours and the auto-fallback would
      // pick an ellipse covering the whole compound.
      if (t.hitShape) {
        const { d, bbox: b } = t.hitShape;
        map.set(t.triadan, {
          shape: { kind: 'path', d },
          bbox: {
            minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY,
            cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2,
          },
        });
        continue;
      }

      // (a) Direct outer subpath, if it's a reasonable size for this tooth.
      const outerIdx = outerSubpathByTriadan.get(t.triadan);
      if (outerIdx !== undefined) {
        const sp = parsed.subpaths[outerIdx];
        const area = (sp.maxX - sp.minX) * (sp.maxY - sp.minY);
        const expected = t.rx * t.ry * 4;
        if (area >= 200 && area >= expected * 0.3) {
          map.set(t.triadan, {
            shape: { kind: 'path', d: sp.d },
            bbox: bboxOf(sp),
          });
          continue;
        }
      }

      // (b) Compound-minus-cutouts. Find the largest subpath whose bbox
      // contains this tooth's anchor — that's the compound. Then collect any
      // neighbouring teeth's outer subpaths whose bboxes are inside the
      // compound — those are the cutouts.
      let compoundIdx = -1;
      let compoundArea = -1;
      for (let i = 0; i < parsed.subpaths.length; i++) {
        const sp = parsed.subpaths[i];
        if (sp.minX <= t.cx && t.cx <= sp.maxX &&
            sp.minY <= t.cy && t.cy <= sp.maxY) {
          const area = (sp.maxX - sp.minX) * (sp.maxY - sp.minY);
          if (area > compoundArea) {
            compoundArea = area;
            compoundIdx = i;
          }
        }
      }

      if (compoundIdx >= 0) {
        const compound = parsed.subpaths[compoundIdx];
        const cutouts: SvgSubpath[] = [];
        for (const other of diagram.teeth) {
          if (other.triadan === t.triadan) continue;
          const otherIdx = outerSubpathByTriadan.get(other.triadan);
          if (otherIdx === undefined) continue;
          const otherSp = parsed.subpaths[otherIdx];
          if (otherSp.minX >= compound.minX && otherSp.maxX <= compound.maxX &&
              otherSp.minY >= compound.minY && otherSp.maxY <= compound.maxY) {
            cutouts.push(otherSp);
          }
        }

        if (cutouts.length > 0) {
          // Trim the compound's bbox by each cutout. For each cutout, decide
          // whether it sits on the anchor's x-axis (horizontally adjacent —
          // e.g. cat I1 left + I1 right inside a single compound) or y-axis
          // (vertically stacked — e.g. M2 above M1 in the dog mandible) by
          // whichever offset is larger.
          let minX = compound.minX, maxX = compound.maxX;
          let minY = compound.minY, maxY = compound.maxY;
          for (const cutout of cutouts) {
            const dx = t.cx - cutout.cx;
            const dy = t.cy - cutout.cy;
            if (Math.abs(dx) > Math.abs(dy)) {
              if (dx < 0) maxX = Math.min(maxX, cutout.minX);
              else        minX = Math.max(minX, cutout.maxX);
            } else {
              if (dy < 0) maxY = Math.min(maxY, cutout.minY);
              else        minY = Math.max(minY, cutout.maxY);
            }
          }
          // The compound subpath in this SVG is typically a *stroke trace*
          // (one path that loops around both edges of the outline), so
          // filling it produces only a thin ring — the interior is a hole.
          // Use a solid ellipse inscribed in the trimmed bbox instead, so
          // the entire tooth area is clickable and tints uniformly on hover.
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          map.set(t.triadan, {
            shape: {
              kind: 'ellipse',
              cx,
              cy,
              rx: (maxX - minX) / 2,
              ry: (maxY - minY) / 2,
            },
            bbox: { minX, minY, maxX, maxY, cx, cy },
          });
          continue;
        }
      }

      // (c) Last resort: anchor ellipse.
      map.set(t.triadan, {
        shape: { kind: 'ellipse', cx: t.cx, cy: t.cy, rx: t.rx, ry: t.ry },
        bbox: {
          minX: t.cx - t.rx, minY: t.cy - t.ry,
          maxX: t.cx + t.rx, maxY: t.cy + t.ry,
          cx: t.cx, cy: t.cy,
        },
      });
    }

    return map;
  }, [parsed, outerSubpathByTriadan, diagram]);

  // Comment connectors anchor to the same display bbox.
  const bboxByTriadan = React.useMemo(() => {
    const map = new Map<number, ToothBBox>();
    renderInfoByTriadan.forEach((info, triadan) => map.set(triadan, info.bbox));
    return map;
  }, [renderInfoByTriadan]);

  const positionedComments = React.useMemo(
    () => layoutComments(comments, diagram, bboxByTriadan),
    [comments, diagram, bboxByTriadan]
  );

  const sidePad = diagram.width * SIDE_PAD_RATIO;
  const topPad = diagram.height * TOP_PAD_RATIO;
  const bottomPad = diagram.height * BOTTOM_PAD_RATIO;
  const viewBoxX = -sidePad;
  const viewBoxY = -topPad;
  const viewBoxWidth = diagram.width + 2 * sidePad;
  const viewBoxHeight = diagram.height + topPad + bottomPad;

  React.useImperativeHandle(
    ref,
    () => ({
      getSvgElement: () => svgRef.current,
      getCommentExports: () =>
        positionedComments.map((p) => ({
          id: p.comment.id,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          label: p.anchor ? p.anchor.label : '',
          text: p.comment.text,
        })),
      getViewBox: () => ({
        x: viewBoxX,
        y: viewBoxY,
        w: viewBoxWidth,
        h: viewBoxHeight,
      }),
    }),
    [positionedComments, viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight]
  );

  const handleToothClick = (triadan: number, e: React.MouseEvent) => {
    if (tool === 'draw') return;
    e.stopPropagation();
    if (tool === 'mark') {
      // Marks are locked for pre-missing teeth in the post diagram —
      // they're already gone, can't be re-extracted today. Comments
      // (annotations on the empty socket etc.) are still allowed below.
      if (lockedTriadans?.has(triadan)) return;
      const next = cycleMark(toothMarks[triadan], markMode);
      const updated = { ...toothMarks };
      if (next) updated[triadan] = next;
      else delete updated[triadan];
      onToothMarksChange(updated);
    } else if (tool === 'comment') {
      // One comment per tooth. If a comment for this tooth already
      // exists, an empty one gets removed (toggle off) and a non-empty
      // one is left alone (so a stray click doesn't blow away typed
      // notes or stack a duplicate).
      const existing = comments.find((c) => c.anchorTriadan === triadan);
      if (existing) {
        if (existing.text.trim() === '') {
          onCommentsChange(comments.filter((c) => c.id !== existing.id));
        }
        return;
      }
      const id = `c${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      onCommentsChange([...comments, { id, text: '', anchorTriadan: triadan }]);
    }
  };

  const handleCommentEdit = (id: string, text: string) => {
    // Resize the box to fit as the user types, so all text stays visible.
    // Text edit + dimension change go in ONE state write — measuring
    // separately (e.g. on input) would race the text update and clobber it
    // (onCommentsChange takes an array, not a functional updater).
    let dims: { width: number; height: number } | null = null;
    if (!commentInteractingRef.current) {
      const ta = wrapperRef.current?.querySelector(`[data-comment-id="${id}"]`);
      const boxEl = ta?.closest('.diagram-comment') as HTMLElement | null;
      if (boxEl) {
        const size = measureCommentSize(id, boxEl, text);
        if (size) dims = { width: size.newW, height: size.newH };
      }
    }
    onCommentsChange(
      comments.map((c) => (c.id === id ? { ...c, text, ...dims } : c))
    );
  };

  // True while the user is mid-drag or mid-resize on a comment. We use it
  // to suppress auto-shrink in that window — the textarea loses focus
  // when the user touches the resize handle, and we don't want to fight
  // the resize they just performed.
  const commentInteractingRef = React.useRef(false);

  // Live view of the comments array for the drag/resize document-level
  // pointermove handlers. Those handlers are installed once at gesture
  // start; mapping over a captured `comments` would rebuild state from a
  // stale snapshot and silently drop any edit (typed text, AI autofill)
  // that landed mid-gesture.
  const commentsRef = React.useRef(comments);
  commentsRef.current = comments;

  // Removes the document-level listeners of the in-flight drag/resize
  // gesture, if any — called on unmount so a gesture interrupted by
  // unmount doesn't leak pointermove/pointerup handlers on `document`.
  const gestureCleanupRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    return () => {
      gestureCleanupRef.current?.();
    };
  }, []);

  /**
   * Measure the box a comment's content wants to occupy.
   *   - Width: wraps long body text to a comfortable reading column (so it
   *     never stretches into one giant line), always tries to fit the
   *     header, and is clamped to the room left before the overlay's right
   *     edge (so right-gutter comments stay on-canvas).
   *   - Height: the wrapped body height measured AT THAT FINAL width — this
   *     is the fix for the clipping bug, where height used to be measured at
   *     the un-capped single-line width and then the box was capped narrower,
   *     hiding the wrapped overflow.
   * Returns viewBox-unit width/height, or null if it can't measure yet.
   */
  const measureCommentSize = (
    id: string,
    boxEl: HTMLElement,
    text: string
  ): { newW: number; newH: number } | null => {
    if (!boxEl.isConnected) return null;
    const textarea = boxEl.querySelector('textarea') as HTMLTextAreaElement | null;
    if (!textarea) return null;
    const overlayEl = boxEl.parentElement;
    if (!overlayEl) return null;
    const overlayRect = overlayEl.getBoundingClientRect();
    if (overlayRect.width <= 0 || overlayRect.height <= 0) return null;
    const pxToVbX = viewBoxWidth / overlayRect.width;
    const pxToVbY = viewBoxHeight / overlayRect.height;

    const taCs = getComputedStyle(textarea);
    const boxCs = getComputedStyle(boxEl);
    const padX = parseFloat(boxCs.paddingLeft) + parseFloat(boxCs.paddingRight);
    const padY = parseFloat(boxCs.paddingTop) + parseFloat(boxCs.paddingBottom);
    const borderX = parseFloat(boxCs.borderLeftWidth) + parseFloat(boxCs.borderRightWidth);
    const borderY = parseFloat(boxCs.borderTopWidth) + parseFloat(boxCs.borderBottomWidth);
    const fontPx = parseFloat(taCs.fontSize) || 15;
    const lineHeightPx = parseFloat(taCs.lineHeight) || fontPx * 1.25;

    const fontStyle =
      `font-family:${taCs.fontFamily};font-size:${taCs.fontSize};` +
      `font-weight:${taCs.fontWeight};line-height:${taCs.lineHeight};` +
      `letter-spacing:${taCs.letterSpacing}`;

    // Longest unwrapped line (respects manual newlines the user typed).
    let maxLinePx = 0;
    const lineMeasurer = document.createElement('div');
    lineMeasurer.style.cssText =
      `position:absolute;visibility:hidden;top:-9999px;left:-9999px;white-space:pre;padding:0;border:0;margin:0;${fontStyle}`;
    document.body.appendChild(lineMeasurer);
    try {
      for (const line of text.split('\n')) {
        lineMeasurer.textContent = line || ' ';
        if (lineMeasurer.scrollWidth > maxLinePx) maxLinePx = lineMeasurer.scrollWidth;
      }
    } finally {
      lineMeasurer.remove();
    }

    const header = boxEl.querySelector('.diagram-comment__header') as HTMLElement | null;
    const headerH = header ? header.offsetHeight : 0;
    const labelEl  = header?.querySelector('.diagram-comment__label')  as HTMLElement | null;
    const deleteEl = header?.querySelector('.diagram-comment__delete') as HTMLElement | null;
    const labelW  = labelEl  ? labelEl.scrollWidth  : 0;
    const deleteW = deleteEl ? deleteEl.offsetWidth : 0;
    const headerNaturalPx = labelW + deleteW + (labelW > 0 ? 12 : 0);

    // Width budget: never past the overlay's right edge (room to the right
    // of the box's laid-out left edge). Anchored comments have no stored x
    // until dragged, so use the laid-out position.
    const positioned = positionedComments.find((p) => p.comment.id === id);
    const effectiveX = positioned ? positioned.x : viewBoxX;
    const maxWVb = Math.max(70 * pxToVbX, diagram.width + sidePad - effectiveX);
    const maxAvailInnerPx = Math.max(40, maxWVb / pxToVbX - padX - borderX);

    // Keep the box within the side gutter (~30% of the diagram width) so it
    // wraps into a narrow column there instead of growing across the teeth.
    // Short text still stays compact at its natural width.
    const gutterInnerPx = Math.max(60, sidePad / pxToVbX - padX - borderX);
    let innerPx = Math.min(maxLinePx, gutterInnerPx, maxAvailInnerPx);
    innerPx = Math.max(innerPx, Math.min(headerNaturalPx, gutterInnerPx, maxAvailInnerPx), 50);
    innerPx = Math.min(innerPx + 4, maxAvailInnerPx); // +4 caret room, re-clamp

    // Height at the FINAL inner width.
    let textHeightPx = lineHeightPx;
    if (text.trim().length > 0) {
      const wrapMeasurer = document.createElement('div');
      wrapMeasurer.style.cssText =
        `position:absolute;visibility:hidden;top:-9999px;left:-9999px;width:${innerPx}px;` +
        `white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word;padding:0;border:0;margin:0;${fontStyle}`;
      wrapMeasurer.textContent = text;
      document.body.appendChild(wrapMeasurer);
      try {
        textHeightPx = wrapMeasurer.scrollHeight;
      } finally {
        wrapMeasurer.remove();
      }
    }

    const newBoxWidthPx = innerPx + padX + borderX;
    const newBoxHeightPx = headerH + textHeightPx + padY + borderY + 2;
    const newW = Math.max(70 * pxToVbX, Math.min(maxWVb, newBoxWidthPx * pxToVbX));
    const newH = Math.max(30 * pxToVbY, newBoxHeightPx * pxToVbY);
    return { newW, newH };
  };

  // Final fit when focus leaves the comment (text already committed, so no
  // race with edits). Pre-empted during a manual drag/resize.
  const autosizeComment = (id: string, boxEl: HTMLElement) => {
    if (commentInteractingRef.current) return;
    const textarea = boxEl.querySelector('textarea') as HTMLTextAreaElement | null;
    const size = measureCommentSize(id, boxEl, textarea ? textarea.value : '');
    if (!size) return;
    onCommentsChange(
      comments.map((c) =>
        c.id === id ? { ...c, width: size.newW, height: size.newH } : c
      )
    );
  };

  const handleCommentDelete = (id: string) => {
    onCommentsChange(comments.filter((c) => c.id !== id));
  };

  // Auto-focus the textarea of a freshly-added comment so the user can
  // just start typing. The textareas live in the HTML overlay (sibling of
  // the SVG, not inside it), so we search the wrapper element.
  const knownCommentIdsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const previous = knownCommentIdsRef.current;
    const current = new Set<string>();
    comments.forEach((c) => {
      current.add(c.id);
      if (!previous.has(c.id)) {
        // Defer one frame so the new textarea is in the DOM before we
        // try to focus it.
        requestAnimationFrame(() => {
          const ta = wrapperRef.current?.querySelector(
            `textarea[data-comment-id="${c.id}"]`
          ) as HTMLTextAreaElement | null;
          ta?.focus();
        });
      }
    });
    knownCommentIdsRef.current = current;
  }, [comments]);

  // Drawing handlers
  const getSvgPointFromXY = (clientX: number, clientY: number): StrokePoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const p = pt.matrixTransform(inv);
    return { x: p.x, y: p.y };
  };
  const getSvgPoint = (e: React.PointerEvent): StrokePoint | null =>
    getSvgPointFromXY(e.clientX, e.clientY);

  // Comment dragging — used by all comments. The drag handle is the
  // header bar of each comment box. While dragging we install global
  // pointermove / pointerup listeners on the document so the drag survives
  // the cursor leaving the small drag handle.
  const handleCommentDragStart = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    commentInteractingRef.current = true;
    const startSvg = getSvgPointFromXY(e.clientX, e.clientY);
    const target = comments.find((c) => c.id === id);
    if (!startSvg || !target) return;
    const positioned = positionedComments.find((p) => p.comment.id === id);
    const initialX = target.x ?? positioned?.x ?? 0;
    const initialY = target.y ?? positioned?.y ?? 0;
    const w = target.width ?? positioned?.w ?? COMMENT_W;
    const h = target.height ?? positioned?.h ?? COMMENT_H;

    const minX = -sidePad;
    const maxX = diagram.width + sidePad - w;
    const minY = -topPad;
    const maxY = diagram.height + bottomPad - h;
    const onMove = (ev: PointerEvent) => {
      const cur = getSvgPointFromXY(ev.clientX, ev.clientY);
      if (!cur) return;
      const nx = initialX + (cur.x - startSvg.x);
      const ny = initialY + (cur.y - startSvg.y);
      const cx = Math.min(Math.max(minX, nx), maxX);
      const cy = Math.min(Math.max(minY, ny), maxY);
      onCommentsChange(
        commentsRef.current.map((c) => (c.id === id ? { ...c, x: cx, y: cy } : c))
      );
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      gestureCleanupRef.current = null;
      // Clear after a frame so a focusout fired during the drag (e.g.
      // because the textarea released focus) doesn't sneak in an
      // autosize before we've reset the flag.
      requestAnimationFrame(() => {
        commentInteractingRef.current = false;
      });
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    gestureCleanupRef.current = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  };

  // Comment resizing via the bottom-right corner handle.
  const handleCommentResizeStart = (id: string, e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    commentInteractingRef.current = true;
    const startSvg = getSvgPointFromXY(e.clientX, e.clientY);
    const target = comments.find((c) => c.id === id);
    const positioned = positionedComments.find((p) => p.comment.id === id);
    if (!startSvg || !target || !positioned) return;
    const initialW = target.width ?? positioned.w;
    const initialH = target.height ?? positioned.h;

    const onMove = (ev: PointerEvent) => {
      const cur = getSvgPointFromXY(ev.clientX, ev.clientY);
      if (!cur) return;
      const w = Math.max(COMMENT_MIN_W, initialW + (cur.x - startSvg.x));
      const h = Math.max(COMMENT_MIN_H, initialH + (cur.y - startSvg.y));
      onCommentsChange(
        commentsRef.current.map((c) => (c.id === id ? { ...c, width: w, height: h } : c))
      );
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      gestureCleanupRef.current = null;
      requestAnimationFrame(() => {
        commentInteractingRef.current = false;
      });
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    gestureCleanupRef.current = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'draw') return;
    const p = getSvgPoint(e);
    if (!p) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const id = `s${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const arch: 'maxilla' | 'mandible' = p.y < diagram.midlineY ? 'maxilla' : 'mandible';
    setLiveStroke({ id, arch, color: strokeColor, width: strokeWidth, points: [p] });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'draw' || !liveStroke) return;
    const p = getSvgPoint(e);
    if (!p) return;
    setLiveStroke((s) => (s ? { ...s, points: [...s.points, p] } : s));
  };

  const handlePointerUp = () => {
    if (liveStroke && liveStroke.points.length > 0) {
      onStrokesChange([...strokes, liveStroke]);
    }
    setLiveStroke(null);
  };

  // Convert SVG-coord (x, y, w, h) into wrapper-relative percentages
  // for the HTML comment overlay.
  const toOverlayPct = (x: number, y: number, w: number, h: number) => ({
    left: `${((x - viewBoxX) / viewBoxWidth) * 100}%`,
    top: `${((y - viewBoxY) / viewBoxHeight) * 100}%`,
    width: `${(w / viewBoxWidth) * 100}%`,
    height: `${(h / viewBoxHeight) * 100}%`,
  });

  return (
    <div className="tooth-diagram-wrapper" ref={wrapperRef}>
    <svg
      ref={svgRef}
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
      className="tooth-diagram"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ touchAction: tool === 'draw' ? 'none' : 'auto' }}
    >
      {/* Static base: the first `<path>` element's d attribute, drawn
          with evenodd so paired outer/inner outlines render as the
          original SVG intends (outline ring), including non-tooth
          elements like text labels and the R/L midline. Subsequent
          paths in the source SVG (if any) are treated as hit-shape
          overrides and intentionally NOT drawn here. */}
      {parsed && (
        <path
          d={parsed.outlineD}
          fillRule="evenodd"
          className="tooth-diagram__outline"
        />
      )}

      {/* Crisp native replacements for the culled hand-drawn artwork:
          a straight dashed midline and real-text labels. Styling uses
          presentation attributes (not CSS classes) so the cloned SVG
          rasterizes identically in the PDF export. */}
      <line
        x1={diagram.midlineDash.x1}
        y1={diagram.midlineDash.y}
        x2={diagram.midlineDash.x2}
        y2={diagram.midlineDash.y}
        stroke="#1a202c"
        strokeWidth={3.5}
        strokeDasharray="24 12"
        strokeLinecap="round"
        pointerEvents="none"
      />
      {diagram.labels.map((l) => (
        <text
          key={`${l.text}-${l.x}`}
          x={l.x}
          y={l.y}
          fontSize={l.fontSize}
          fontWeight={600}
          fontFamily='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
          fill="#1a202c"
          textAnchor="middle"
          dominantBaseline="central"
          pointerEvents="none"
        >
          {l.text}
        </text>
      ))}

      {/* Per-tooth click groups + mark overlays (rendered above outlines). */}
      {parsed &&
        diagram.teeth.map((tooth) => {
          const info = renderInfoByTriadan.get(tooth.triadan);
          if (!info) return null;
          const mark = toothMarks[tooth.triadan];
          const { shape, bbox } = info;

          const renderShape = (className: string) =>
            shape.kind === 'ellipse' ? (
              <ellipse
                cx={shape.cx}
                cy={shape.cy}
                rx={shape.rx}
                ry={shape.ry}
                className={className}
              />
            ) : (
              <path
                d={shape.d}
                fillRule={shape.fillRule}
                className={className}
              />
            );

          return (
            <g
              key={tooth.triadan}
              className="tooth-group"
              data-mark={mark || 'none'}
              data-hovered={hoveredTriadan === tooth.triadan ? 'true' : 'false'}
              onPointerEnter={() => setHoveredTriadan(tooth.triadan)}
              onPointerLeave={() =>
                setHoveredTriadan((cur) => (cur === tooth.triadan ? null : cur))
              }
              onClick={(e) => handleToothClick(tooth.triadan, e)}
              style={{ cursor: tool === 'draw' ? 'crosshair' : 'pointer' }}
            >
              {/* Solid fill for "missing" — bottom layer. */}
              {mark === 'missing' && renderShape('tooth-group__missing-fill')}

              {/* X overlay for "extracted". */}
              {mark === 'extracted' && (
                <g pointerEvents="none">
                  <line
                    x1={bbox.minX} y1={bbox.minY} x2={bbox.maxX} y2={bbox.maxY}
                    stroke="#c53030" strokeWidth={5} strokeLinecap="round"
                  />
                  <line
                    x1={bbox.minX} y1={bbox.maxY} x2={bbox.maxX} y2={bbox.minY}
                    stroke="#c53030" strokeWidth={5} strokeLinecap="round"
                  />
                </g>
              )}

              {/* Hit area + hover tint. */}
              {renderShape('tooth-group__hover')}
            </g>
          );
        })}

      {/* User-drawn strokes (committed + the one being drawn right now) */}
      {(liveStroke ? [...strokes, liveStroke] : strokes).map((s) => {
        if (s.points.length === 0) return null;
        const d = s.points
          .map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
          .join(' ');
        return (
          <path
            key={s.id}
            d={d}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width * 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        );
      })}

      {/* Dashed connector lines from each anchored comment to its tooth. */}
      <g className="diagram-comments">
        {positionedComments.map(({ comment, x, y, w, h, anchor }) => {
          if (!anchor) return null;
          const boxCenterX = x + w / 2;
          const targetX = anchor.x < boxCenterX ? x : x + w;
          return (
            <line
              key={`line_${comment.id}`}
              x1={anchor.x}
              y1={anchor.y}
              x2={targetX}
              y2={y + h / 2}
              stroke="#a0aec0"
              strokeWidth={1.5}
              strokeDasharray="6,5"
              pointerEvents="none"
            />
          );
        })}
      </g>
    </svg>

    {/* Comment boxes are rendered as plain HTML on top of the SVG, positioned
        with viewBox-derived percentages. (Browsers don't reliably scale
        <foreignObject> HTML to match the SVG's viewBox, so a comment can
        end up far from where its dashed line lands. Plain HTML over the
        wrapper sidesteps that.) */}
    <div className="diagram-comments-overlay">
      {positionedComments.map(({ comment, x, y, w, h, anchor }) => (
        <div
          key={comment.id}
          className={`diagram-comment${anchor ? '' : ' diagram-comment--unanchored'}`}
          data-comment-id={comment.id}
          style={toOverlayPct(x, y, w, h)}
          // For free comments (no header), the whole shell acts as the
          // drag handle — but only when the pointer lands on the shell
          // itself, not the textarea / delete / resize children. That way
          // typing and child controls keep working normally.
          onPointerDown={
            anchor
              ? undefined
              : (e) => {
                  if (e.target !== e.currentTarget) return;
                  handleCommentDragStart(comment.id, e);
                }
          }
          // React onBlur on a container is a delegated `focusout` and
          // gives us `relatedTarget` — when focus actually leaves the
          // whole comment (and we're not mid drag/resize), auto-shrink
          // to fit content.
          onBlur={(e) => {
            const next = e.relatedTarget as Node | null;
            if (next && e.currentTarget.contains(next)) return;
            const boxEl = e.currentTarget;
            // Defer a tick so React commits any pending text edit first.
            requestAnimationFrame(() => autosizeComment(comment.id, boxEl));
          }}
        >
          {anchor && (
            <div
              className="diagram-comment__header"
              onPointerDown={(e) => handleCommentDragStart(comment.id, e)}
            >
              <span className="diagram-comment__label">{anchor.label}</span>
              <button
                type="button"
                className="diagram-comment__delete"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => handleCommentDelete(comment.id)}
                aria-label="Delete comment"
              >
                ✕
              </button>
            </div>
          )}
          {!anchor && (
            <button
              type="button"
              className="diagram-comment__delete diagram-comment__delete--floating"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => handleCommentDelete(comment.id)}
              aria-label="Delete comment"
            >
              ✕
            </button>
          )}
          <CodeField
            multiline
            className="diagram-comment__text"
            placeholder="Notes..."
            value={comment.text}
            onChange={(text) => handleCommentEdit(comment.id, text)}
            data-comment-id={comment.id}
          />
          <div
            className="diagram-comment__resize"
            onPointerDown={(e) => handleCommentResizeStart(comment.id, e)}
            aria-label="Resize comment"
          />
        </div>
      ))}
    </div>
    </div>
  );
});

ToothDiagram.displayName = 'ToothDiagram';
