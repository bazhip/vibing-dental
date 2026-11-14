import React from 'react';
import { useTranslation } from 'react-i18next';
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
import { isNativeApp } from '../native/platform';
import { Icon } from '../ios/icons';
import { isGridComment } from '../utils/gridComments';
import { stampQuickCode } from '../utils/quickCodes';
// Pure helpers extracted from this component for testability.
import {
  layoutComments,
  COMMENT_W,
  COMMENT_H,
  type ToothBBox,
} from './toothDiagram/layoutComments';
import { fitCommentForExport } from '../utils/svgToPng';
import {
  loadParsedDiagram,
  type ParsedDiagram,
  type SvgSubpath,
} from './toothDiagram/parseSvg';
import { createPenFilter } from './toothDiagram/penFilter';

// SF Symbol names (not text).
const XMARK_ICON = 'xmark';

// One filter for the whole session: once Apple Pencil has drawn on any
// diagram, finger/palm touches stop drawing on all of them.
const penFilter = createPenFilter();

const MISSING_FILL_CLASS = 'tooth-group__missing-fill';
const HOVER_CLASS = 'tooth-group__hover';

/** The diagram's built-in text labels, keyed by the text the species data carries. */
const LABEL_KEYS = {
  Maxilla: 'diagram.label.maxilla',
  Mandible: 'diagram.label.mandible',
  R: 'diagram.label.right',
  L: 'diagram.label.left',
} as const;

/** 'stamp' adds (or takes back out) `stampCode` on the tapped tooth's comment. */
export type DiagramTool = 'mark' | 'comment' | 'draw' | 'stamp';

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
  /** The quick code the stamp tool adds (tool 'stamp'). */
  stampCode?: string | null;
  strokeColor: string;
  strokeWidth: number;
  /** Triadans that are locked from user edits — used by the post-surgery
   *  diagram to enforce that teeth missing pre-surgery stay missing. */
  lockedTriadans?: Set<number>;
  /** Constrains which marks this diagram can toggle through. */
  markMode?: MarkMode;
  /** Tooth to flash briefly (AI autofill just edited it). */
  highlightTriadan?: number | null;
  /** View-only (saved visit not unlocked): no marking, drawing or note edits;
   *  zoom and reading still work. */
  readOnly?: boolean;
  /** Label every tooth with its Triadan number (screen only — stripped
   *  from the PDF export). */
  showNumbers?: boolean;
  /** Select mode (By-tooth charting): a tooth click/Enter calls this
   *  instead of marking or commenting. Works on read-only charts too, so
   *  a locked chart can still be browsed tooth by tooth. */
  onToothSelect?: (triadan: number) => void;
  /** Tooth outlined as the current selection (select mode). */
  selectedTriadan?: number | null;
  /** Per-tooth status tints: `charted` (has findings or notes) and
   *  `planned` (flagged for extraction, not yet done). */
  toothFlags?: Record<number, { charted?: boolean; planned?: boolean }>;
}

/** Where a tooth's number label sits: just outside the tooth, pushed
 *  away from the arch centre (the midline, at the diagram's centre x) so
 *  numbers ring the outside of the arch instead of covering neighbours.
 *  Exported for tests. */
export function numberLabelPosition(
  bbox: ToothBBox,
  archCenter: { x: number; y: number },
  gap: number
): { x: number; y: number } {
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  let dx = cx - archCenter.x;
  let dy = cy - archCenter.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const halfW = (bbox.maxX - bbox.minX) / 2;
  const halfH = (bbox.maxY - bbox.minY) / 2;
  // Distance from the centre to the bbox edge along (dx, dy).
  const toEdge = Math.min(
    Math.abs(dx) > 1e-6 ? halfW / Math.abs(dx) : Infinity,
    Math.abs(dy) > 1e-6 ? halfH / Math.abs(dy) : Infinity
  );
  return { x: cx + dx * (toEdge + gap), y: cy + dy * (toEdge + gap) };
}

/**
 * Front-teeth numbers on a clean arc. Incisors are too tightly packed
 * for a number beside each one, so the front labels go in tooth order
 * (104 103 102 101 | 201 202 203 204) evenly spaced along an arc just
 * outside the row — bulging up for the maxilla, down for the mandible,
 * following the shape of the arch. Pure; exported for tests.
 *
 * `teeth` are one jaw's front teeth (incisors + canines, any order); `outward` is -1 when the
 * outside of the arch is up (maxilla), +1 when it's down (mandible).
 * `obstacles` are tooth boxes no label may cover (default: `teeth`).
 */
export function arcLabelPositions(
  teeth: Array<{ triadan: number; bbox: ToothBBox }>,
  outward: 1 | -1,
  label: { w: number; h: number; gap: number },
  obstacles: ToothBBox[] = teeth.map((t) => t.bbox)
): Map<number, { x: number; y: number }> {
  const out = new Map<number, { x: number; y: number }>();
  const n = teeth.length;
  if (n === 0) return out;
  const sorted = [...teeth].sort((a, b) => a.bbox.cx - b.bbox.cx);
  const centerX = sorted.reduce((sum, t) => sum + t.bbox.cx, 0) / n;
  // Apex sits just past the outermost incisor edge.
  const edge = outward < 0
    ? Math.min(...sorted.map((t) => t.bbox.minY))
    : Math.max(...sorted.map((t) => t.bbox.maxY));
  const apexY = edge + outward * (label.gap + label.h / 2);
  // Neighbouring labels sit one label-width (plus padding) apart along
  // the arc; the sweep widens with the label count (~100° for the eight
  // front teeth) so the ends curve down alongside the canines.
  const step = label.w + 6;
  const sweep = 0.25 * (n - 1); // radians, end to end
  const radius = n > 1 ? ((n - 1) * step) / sweep : 1;
  const centerY = apexY - outward * radius;
  const pts = sorted.map((t, i) => {
    const theta = ((i - (n - 1) / 2) * step) / radius;
    return {
      triadan: t.triadan,
      x: centerX + radius * Math.sin(theta),
      y: centerY + outward * radius * Math.cos(theta),
    };
  });
  // The arc dips toward the teeth at its ends — push the whole arc
  // outward until no label overlaps (or crowds) a tooth it sits over.
  let shift = 0;
  for (const p of pts) {
    for (const b of obstacles) {
      if (p.x + label.w / 2 <= b.minX || p.x - label.w / 2 >= b.maxX) continue;
      const need = outward < 0
        ? p.y + label.h / 2 - (b.minY - label.gap)  // label bottom vs tooth top
        : b.maxY + label.gap - (p.y - label.h / 2); // tooth bottom vs label top
      shift = Math.max(shift, need);
    }
  }
  for (const p of pts) out.set(p.triadan, { x: p.x, y: p.y + outward * shift });
  return out;
}

/** Nudge overlapping labels apart. Each label is a w×h box centred on
 *  its point; overlapping pairs are pushed apart along the axis that
 *  overlaps least, a few relaxation passes. `fixed` labels (the incisor
 *  arc) never move — anything overlapping one takes the whole push.
 *  Pure; exported for tests. */
export function spreadLabels(
  points: Array<{ x: number; y: number; w: number; h: number; fixed?: boolean }>,
  iterations = 12
): Array<{ x: number; y: number }> {
  const out = points.map((p) => ({ ...p }));
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        if (a.fixed && b.fixed) continue;
        moved = true;
        // Share of the push each label takes (all of it if the other is fixed).
        const aShare = a.fixed ? 0 : b.fixed ? 1 : 0.5;
        const bShare = 1 - aShare;
        if (ox < oy) {
          const dir = a.x <= b.x ? 1 : -1;
          a.x -= (ox + 1) * aShare * dir;
          b.x += (ox + 1) * bShare * dir;
        } else {
          const dir = a.y <= b.y ? 1 : -1;
          a.y -= (oy + 1) * aShare * dir;
          b.y += (oy + 1) * bShare * dir;
        }
      }
    }
    if (!moved) break;
  }
  return out.map(({ x, y }) => ({ x, y }));
}

const NUMBER_FONT = 22;

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
  stampCode = null,
  strokeColor,
  strokeWidth,
  lockedTriadans,
  highlightTriadan,
  markMode = 'all',
  readOnly = false,
  showNumbers = false,
  onToothSelect,
  selectedTriadan = null,
  toothFlags,
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
  const { t } = useTranslation('chart');
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
  // straight dashed line. Everything downstream (tooth matching, outline
  // render) consumes this cleaned version.
  const parsed = React.useMemo<ParsedDiagram | null>(() => {
    if (!rawParsed) return null;
    const culls = diagram.labelCulls;
    if (!culls.length) return rawParsed;
    const subpaths = rawParsed.subpaths.filter((sp) => {
      const cx = (sp.minX + sp.maxX) / 2;
      const cy = (sp.minY + sp.maxY) / 2;
      return !culls.some(
        (b) => cx >= b.minX && cx <= b.maxX && cy >= b.minY && cy <= b.maxY
      );
    });
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

  // Mid-gesture comment position/size, committed to the parent once on
  // pointerup — the liveStroke pattern. Writing parent state per
  // pointermove re-rendered (and re-serialized) the whole chart for
  // every pixel of a drag.
  const [liveCommentPatch, setLiveCommentPatch] = React.useState<{
    id: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  } | null>(null);

  const positionedComments = React.useMemo(() => {
    const laid = layoutComments(comments, diagram, bboxByTriadan);
    if (!liveCommentPatch) return laid;
    return laid.map((p) =>
      p.comment.id === liveCommentPatch.id
        ? {
            ...p,
            x: liveCommentPatch.x ?? p.x,
            y: liveCommentPatch.y ?? p.y,
            w: liveCommentPatch.width ?? p.w,
            h: liveCommentPatch.height ?? p.h,
          }
        : p
    );
  }, [comments, diagram, bboxByTriadan, liveCommentPatch]);

  // Tooth-number label positions: outside each tooth, de-overlapped.
  const numberLabels = React.useMemo(() => {
    if (!parsed || !showNumbers) return null;
    const archCenter = { x: diagram.width / 2, y: diagram.midlineY };
    const labelW = 3 * NUMBER_FONT * 0.6 + 4; // Triadan numbers are 3 digits
    const labelH = NUMBER_FONT + 2;
    // Front teeth: one arc per jaw. Everything else: beside its tooth.
    const arcPos = new Map<number, { x: number; y: number }>();
    for (const outward of [-1, 1] as const) {
      const jaw = diagram.teeth
        .filter((t) => (outward < 0 ? t.cy < diagram.midlineY : t.cy >= diagram.midlineY))
        .map((t) => ({ triadan: t.triadan, type: t.type, bbox: renderInfoByTriadan.get(t.triadan)?.bbox }))
        .filter((t): t is { triadan: number; type: typeof t.type; bbox: ToothBBox } => !!t.bbox);
      // The front of the mouth — incisors and canines — reads as one arc
      // (104 103 102 101 | 201 202 203 204); a canine label beside its
      // tooth would collide with the ends of an incisor-only arc.
      const front = jaw.filter((t) => t.type === 'incisor' || t.type === 'canine');
      arcLabelPositions(front, outward, { w: labelW, h: labelH, gap: 12 })
        .forEach((pos, triadan) => arcPos.set(triadan, pos));
    }
    const seeds: Array<{ triadan: number; x: number; y: number; w: number; h: number; fixed?: boolean }> = [];
    for (const tooth of diagram.teeth) {
      const info = renderInfoByTriadan.get(tooth.triadan);
      if (!info) continue;
      const onArc = arcPos.get(tooth.triadan);
      const pos = onArc ?? numberLabelPosition(info.bbox, archCenter, 16);
      seeds.push({ triadan: tooth.triadan, ...pos, w: labelW, h: labelH, fixed: !!onArc });
    }
    const spread = spreadLabels(seeds);
    return seeds.map((s, i) => ({ triadan: s.triadan, ...spread[i] }));
  }, [parsed, showNumbers, diagram, renderInfoByTriadan]);

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
      getCommentExports: () => {
        // Re-fit every card to the PDF's font (on-screen sizes come from
        // the browser font at the current zoom), then lay them out again
        // so the gutter stacks pack and align around the PDF sizes.
        // Hand-dragged cards keep their position.
        const gutterMax = sidePad - 2 * 6;
        const fitted = comments.map((c) => {
          const tooth = c.anchorTriadan != null ? diagram.teeth.find((t) => t.triadan === c.anchorTriadan) : undefined;
          const label = tooth ? `${tooth.label} (${tooth.triadan})` : '';
          const { w, h } = fitCommentForExport(c.text, label, tooth ? gutterMax : Math.max(gutterMax, c.width ?? COMMENT_W));
          return { ...c, width: w, height: h };
        });
        return layoutComments(fitted, diagram, bboxByTriadan, { exactSizes: true }).map((p) => ({
          id: p.comment.id,
          x: p.x,
          y: p.y,
          w: p.w,
          h: p.h,
          label: p.anchor ? p.anchor.label : '',
          text: p.comment.text,
        }));
      },
      getViewBox: () => ({
        x: viewBoxX,
        y: viewBoxY,
        w: viewBoxWidth,
        h: viewBoxHeight,
      }),
    }),
    [positionedComments, comments, diagram, bboxByTriadan, sidePad, viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight]
  );

  const handleToothClick = (triadan: number, e: React.SyntheticEvent) => {
    if (onToothSelect) {
      e.stopPropagation();
      onToothSelect(triadan);
      return;
    }
    if (readOnly) return;
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
    } else if (tool === 'stamp' && stampCode) {
      // Arrives with text, so it doesn't grab focus (no keyboard on a tablet).
      onCommentsChange(stampQuickCode(comments, triadan, stampCode, () => `c${Date.now()}_${Math.random().toString(36).slice(2, 7)}`));
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

  // Comments that arrive without being typed — mirrored from the Charting
  // grid, or added by voice autofill — never get focus, so the on-blur fit
  // never runs for them. Fit any with text but no size (new, or re-texted)
  // once the diagram is visible; the side stacks then re-pack around the
  // real heights. Measurement needs real layout, so a hidden section just
  // waits for its next render. Skips the comment being typed in (that one
  // fits as you type). Runs after every render but exits immediately when
  // there's nothing to fit.
  React.useEffect(() => {
    if (commentInteractingRef.current) return;
    const focused = document.activeElement;
    const pending = comments.filter((c) => {
      if (c.width != null && c.height != null) return false;
      if (isGridComment(c)) return true;
      if (!c.text.trim()) return false;
      const el = wrapperRef.current?.querySelector(`.diagram-comment[data-comment-id="${c.id}"]`);
      return !(el && focused && el.contains(focused));
    });
    if (pending.length === 0) return;
    const sizes = new Map<string, { newW: number; newH: number }>();
    for (const c of pending) {
      const el = wrapperRef.current?.querySelector(
        `.diagram-comment[data-comment-id="${c.id}"]`
      ) as HTMLElement | null;
      const size = el && measureCommentSize(c.id, el, c.text);
      if (size) sizes.set(c.id, size);
    }
    if (sizes.size === 0) return;
    onCommentsChange(
      comments.map((c) => {
        const size = sizes.get(c.id);
        return size ? { ...c, width: size.newW, height: size.newH } : c;
      })
    );
  });

  const handleCommentDelete = (id: string) => {
    onCommentsChange(comments.filter((c) => c.id !== id));
  };

  // Auto-focus the textarea of a comment the user just added (the comment
  // tool creates it empty) so they can start typing. Comments that arrive
  // with text — loaded with the chart, mirrored from the grid, added by
  // voice autofill — must not grab focus: that stole the caret, scrolled
  // the page to a hidden diagram, and left the focused card un-fitted.
  // The textareas live in the HTML overlay (sibling of the SVG, not inside
  // it), so we search the wrapper element.
  const knownCommentIdsRef = React.useRef<Set<string>>(new Set(comments.map((c) => c.id)));
  React.useEffect(() => {
    const previous = knownCommentIdsRef.current;
    const current = new Set<string>();
    comments.forEach((c) => {
      current.add(c.id);
      if (!previous.has(c.id) && !c.text) {
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
    // Track locally, render via liveCommentPatch, and commit to the
    // parent ONCE on pointerup — per-move parent commits re-rendered the
    // whole chart for every pixel.
    let lastX = initialX;
    let lastY = initialY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      const cur = getSvgPointFromXY(ev.clientX, ev.clientY);
      if (!cur) return;
      const nx = initialX + (cur.x - startSvg.x);
      const ny = initialY + (cur.y - startSvg.y);
      lastX = Math.min(Math.max(minX, nx), maxX);
      lastY = Math.min(Math.max(minY, ny), maxY);
      moved = true;
      setLiveCommentPatch({ id, x: lastX, y: lastY });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      gestureCleanupRef.current = null;
      if (moved) {
        onCommentsChange(
          commentsRef.current.map((c) => (c.id === id ? { ...c, x: lastX, y: lastY } : c))
        );
      }
      setLiveCommentPatch(null);
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

    // Same one-commit-on-pointerup buffering as the drag handler above.
    let lastW = initialW;
    let lastH = initialH;
    let resized = false;
    const onMove = (ev: PointerEvent) => {
      const cur = getSvgPointFromXY(ev.clientX, ev.clientY);
      if (!cur) return;
      lastW = Math.max(COMMENT_MIN_W, initialW + (cur.x - startSvg.x));
      lastH = Math.max(COMMENT_MIN_H, initialH + (cur.y - startSvg.y));
      resized = true;
      setLiveCommentPatch({ id, width: lastW, height: lastH });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      gestureCleanupRef.current = null;
      if (resized) {
        onCommentsChange(
          commentsRef.current.map((c) => (c.id === id ? { ...c, width: lastW, height: lastH } : c))
        );
      }
      setLiveCommentPatch(null);
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

  // The pointer that started the live stroke; other pointers (e.g. a palm
  // landing mid-stroke) can't extend or end it.
  const strokePointerIdRef = React.useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'draw' || readOnly) return;
    if (!penFilter.accept(e.pointerType)) return;
    if (liveStroke) return;
    const p = getSvgPoint(e);
    if (!p) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    strokePointerIdRef.current = e.pointerId;
    const id = `s${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const arch: 'maxilla' | 'mandible' = p.y < diagram.midlineY ? 'maxilla' : 'mandible';
    setLiveStroke({ id, arch, color: strokeColor, width: strokeWidth, points: [p] });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool !== 'draw' || !liveStroke) return;
    if (!penFilter.accept(e.pointerType)) return;
    if (strokePointerIdRef.current !== null && e.pointerId !== strokePointerIdRef.current) return;
    const p = getSvgPoint(e);
    if (!p) return;
    setLiveStroke((s) => (s ? { ...s, points: [...s.points, p] } : s));
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (strokePointerIdRef.current !== null && e.pointerId !== strokePointerIdRef.current) return;
    strokePointerIdRef.current = null;
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
    <div className={`tooth-diagram-wrapper${readOnly ? ' tooth-diagram-wrapper--readonly' : ''}`} ref={wrapperRef}>
    <svg
      ref={svgRef}
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
      className="tooth-diagram"
      role="group"
      aria-label={
        onToothSelect
          ? t('diagram.aria.select')
          : markMode === 'extracted-only'
          ? t('diagram.aria.extracted')
          : markMode === 'missing-only'
          ? t('diagram.aria.missing')
          : t('diagram.aria.default')
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
          {l.text in LABEL_KEYS ? t(LABEL_KEYS[l.text as keyof typeof LABEL_KEYS]) : l.text}
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

          const locked = lockedTriadans?.has(tooth.triadan) ?? false;
          const flags = toothFlags?.[tooth.triadan];
          const selected = selectedTriadan === tooth.triadan;
          return (
            <g
              key={tooth.triadan}
              className="tooth-group"
              data-mark={mark || 'none'}
              data-selected={selected ? 'true' : undefined}
              data-charted={flags?.charted ? 'true' : undefined}
              data-planned={flags?.planned ? 'true' : undefined}
              // Measured centre, for exports that place markers on teeth
              // (the owner report's numbered pins).
              data-triadan={tooth.triadan}
              data-cx={bbox.cx}
              data-cy={bbox.cy}
              // No hover tint while drawing — the crosshair + strokes are
              // the feedback there, and a tooth highlight is just noise.
              data-hovered={tool !== 'draw' && hoveredTriadan === tooth.triadan ? 'true' : 'false'}
              data-ai-highlight={highlightTriadan === tooth.triadan ? 'true' : undefined}
              // Keyboard path: the diagram is the ONLY place a tooth can
              // be marked extracted, so each tooth is a focusable toggle
              // — pointer users see no difference.
              role="button"
              tabIndex={0}
              aria-pressed={onToothSelect ? selected : !!mark}
              aria-disabled={(!onToothSelect && locked) || undefined}
              aria-label={t('diagram.tooth.label', {
                triadan: tooth.triadan,
                details: [
                  mark === 'missing' ? t('diagram.tooth.markedMissing') : mark === 'extracted' ? t('diagram.tooth.markedExtracted') : '',
                  flags?.planned ? t('diagram.tooth.planned') : '',
                  !onToothSelect && locked ? t('diagram.tooth.locked') : '',
                ].join(''),
              })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToothClick(tooth.triadan, e);
                }
              }}
              onPointerEnter={() => setHoveredTriadan(tooth.triadan)}
              onPointerLeave={() =>
                setHoveredTriadan((cur) => (cur === tooth.triadan ? null : cur))
              }
              onClick={(e) => handleToothClick(tooth.triadan, e)}
              style={{ cursor: tool === 'draw' ? 'crosshair' : 'pointer' }}
            >
              {/* Solid fill for "missing" — bottom layer. */}
              {mark === 'missing' && renderShape(MISSING_FILL_CLASS)}

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
              {renderShape(HOVER_CLASS)}
            </g>
          );
        })}

      {/* Always-on Triadan numbers (optional). Screen-only: the export
          strips [data-export-skip] so PDFs keep the clean template look. */}
      {numberLabels && (
        <g className="tooth-numbers" data-export-skip="true" pointerEvents="none">
          {numberLabels.map(({ triadan, x, y }) => {
            const selected = selectedTriadan === triadan;
            return (
              <text
                key={triadan}
                x={x}
                y={y}
                fontSize={selected ? NUMBER_FONT * 1.2 : NUMBER_FONT}
                fontWeight={selected ? 800 : 600}
                fontFamily='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                textAnchor="middle"
                dominantBaseline="central"
                className={`tooth-number${selected ? ' tooth-number--selected' : ''}`}
              >
                {triadan}
              </text>
            );
          })}
        </g>
      )}

      {/* Hover tooltip: floats just above the hovered tooth with its
          label + Triadan number (e.g. "C · 104"). Drawn in SVG coords so
          it scales with the diagram; flips below the tooth near the top
          edge and clamps horizontally so it never leaves the viewBox. */}
      {hoveredTriadan != null && tool !== 'draw' && (() => {
        const t = diagram.teeth.find((x) => x.triadan === hoveredTriadan);
        const info = renderInfoByTriadan.get(hoveredTriadan);
        if (!t || !info) return null;
        const { bbox } = info;
        const label = `${t.label.toUpperCase()} · ${t.triadan}`;
        const fs = 19;
        const padX = 9;
        const padY = 5;
        const w = label.length * fs * 0.56 + padX * 2;
        const h = fs + padY * 2;
        const cx = (bbox.minX + bbox.maxX) / 2;
        let top = bbox.minY - h - 9;
        if (top < viewBoxY + 2) top = bbox.maxY + 9; // flip below near top edge
        const x = Math.max(
          viewBoxX + 2,
          Math.min(cx - w / 2, viewBoxX + viewBoxWidth - w - 2)
        );
        return (
          <g className="tooth-tooltip" data-export-skip="true" pointerEvents="none">
            <rect x={x} y={top} width={w} height={h} rx={6} className="tooth-tooltip__bg" />
            <text
              x={x + w / 2}
              y={top + h / 2 + 1}
              fontSize={fs}
              fontWeight={600}
              fontFamily='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              textAnchor="middle"
              dominantBaseline="central"
              className="tooth-tooltip__text"
            >
              {label}
            </text>
          </g>
        );
      })()}

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
          className={`diagram-comment${anchor ? '' : ' diagram-comment--unanchored'}${isGridComment(comment) ? ' diagram-comment--mirrored' : ''}`}
          title={isGridComment(comment) ? t('diagram.comment.fromGrid') : undefined}
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
              {isGridComment(comment) && <span className="diagram-comment__badge">{t('grid.title')}</span>}
              <button
                type="button"
                className="diagram-comment__delete"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => handleCommentDelete(comment.id)}
                aria-label={t('diagram.comment.delete')}
              >
                {isNativeApp() ? <Icon name={XMARK_ICON} size={12} /> : '✕'}
              </button>
            </div>
          )}
          {!anchor && (
            <button
              type="button"
              className="diagram-comment__delete diagram-comment__delete--floating"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => handleCommentDelete(comment.id)}
              aria-label={t('diagram.comment.delete')}
            >
              {isNativeApp() ? <Icon name={XMARK_ICON} size={12} /> : '✕'}
            </button>
          )}
          <CodeField
            multiline
            className="diagram-comment__text"
            placeholder={t('diagram.comment.placeholder')}
            value={comment.text}
            readOnly={readOnly || isGridComment(comment)}
            onChange={(text) => handleCommentEdit(comment.id, text)}
            data-comment-id={comment.id}
          />
          <div
            className="diagram-comment__resize"
            onPointerDown={(e) => handleCommentResizeStart(comment.id, e)}
            aria-label={t('diagram.comment.resize')}
          />
        </div>
      ))}
    </div>
    </div>
  );
});

ToothDiagram.displayName = 'ToothDiagram';
