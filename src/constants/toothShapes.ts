/**
 * Tooth click-target geometry, positioned in the pixel space of the
 * occlusal-view PNG diagrams in /public/diagrams. The PNGs themselves
 * provide the visual tooth shapes; the SVG layer just provides hit
 * targets and renders fill/X overlays on top.
 *
 * Positions are eyeballed against the actual PNGs (canine 802×1140,
 * feline 690×1085) — adjust if a click area feels off.
 */

import { Species } from '../types';
import { CANINE_ADULT_ONLY_TOOTH_CULLS } from './canineDeciduousCulls';

export type ToothType = 'incisor' | 'canine' | 'premolar' | 'carnassial' | 'molar';

export interface ToothShape {
  triadan: number;
  label: string;
  type: ToothType;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number; // degrees, around (cx, cy)
  /** Optional hand-crafted hit/highlight shape that overrides the
   *  auto-detected subpath. Useful when the SVG outline traces a tooth
   *  as part of a compound (with no clean per-tooth boundary) — the
   *  auto-matcher then falls back to an ellipse that doesn't match
   *  the visible tooth. Both fields are required when set. */
  hitShape?: {
    /** SVG path `d` data, in the same coordinate system as the SVG. */
    d: string;
    /** Bbox of `d`, pre-computed because we can't run getBBox in here. */
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
  };
}

export interface SpeciesDiagram {
  imageSrc: string;
  width: number;
  height: number;
  /** Y of the R/L midline divider in PNG pixel coords. */
  midlineY: number;
  teeth: ToothShape[];
  /** Crop bounds in diagram coords — the y-range outside [minY, maxY] is
   *  decorative whitespace above the maxilla / below the mandible that
   *  gets cropped out of the rasterized PDF. The PNG natively has more
   *  vertical bleed than the actual tooth content. */
  cropBounds: { minY: number; maxY: number };
  /** Bboxes of vectorized hand-drawn artwork (the traced "Maxilla" /
   *  "Mandible" words, the R/L letters, the wobbly midline dashes) that
   *  get culled from the SVG outline at parse time. Subpaths whose bbox
   *  center falls inside any box are dropped and replaced by the crisp
   *  native equivalents below. Measured from the SVG files by script. */
  labelCulls: Array<{ minX: number; minY: number; maxX: number; maxY: number }>;
  /** Real-text replacements for the culled letterforms. */
  labels: Array<{ text: string; x: number; y: number; fontSize: number }>;
  /** Clean straight replacement for the hand-drawn midline dashes. */
  midlineDash: { x1: number; x2: number; y: number };
  /** Optional uniform rescale + lift of the mandibular arch, applied to
   *  outline subpaths (at parse time) and tooth anchors alike:
   *    x' = centerX + (x - centerX) * scale
   *    y' = targetY + (y - refY) * scale        (for content below belowY)
   *  Used by the deciduous chart, where culling the adult molars leaves
   *  the lower arch small and far from the midline. */
  mandibleRescale?: {
    belowY: number;
    centerX: number;
    scale: number;
    refY: number;
    targetY: number;
  };
}

/**
 * Helper for left/right pairs. The right-side tooth (Triadan 1xx, 4xx)
 * sits at (cx - sideOffset); left-side (2xx, 3xx) mirrors to (cx + sideOffset).
 */
function pair(
  centerX: number,
  rightTriadan: number,
  leftTriadan: number,
  label: string,
  type: ToothType,
  sideOffset: number,
  y: number,
  rx: number,
  ry: number,
  rotationRight = 0
): [ToothShape, ToothShape] {
  return [
    { triadan: rightTriadan, label, type, cx: centerX - sideOffset, cy: y, rx, ry, rotation: rotationRight },
    { triadan: leftTriadan, label, type, cx: centerX + sideOffset, cy: y, rx, ry, rotation: -rotationRight },
  ];
}

// ============================================================
// CANINE — SVG/PNG 802×1140 (occlusal view)
// Maxilla teeth center on x≈385; mandible teeth center on x≈397
// (the diagram has a slight horizontal shift between arches).
// R/L midline ≈ y=590.
// ============================================================
const CANINE_MAX_CX = 385;
const CANINE_MAND_CX = 397;
const CANINE_MIDLINE = 590;

const canineTeeth: ToothShape[] = [
  // === MAXILLA ===
  // 6 small incisors at the very top center
  ...pair(CANINE_MAX_CX, 101, 201, 'I1', 'incisor', 15, 66, 14, 18),
  ...pair(CANINE_MAX_CX, 102, 202, 'I2', 'incisor', 48, 68, 16, 18),
  ...pair(CANINE_MAX_CX, 103, 203, 'I3', 'incisor', 85, 80, 20, 22),
  // Canines (large fangs flanking the incisors)
  ...pair(CANINE_MAX_CX, 104, 204, 'C', 'canine', 121, 128, 33, 58, -10),
  // P1 small premolar
  ...pair(CANINE_MAX_CX, 105, 205, 'P1', 'premolar', 126, 216, 14, 18),
  // P2, P3 progressively larger
  ...pair(CANINE_MAX_CX, 106, 206, 'P2', 'premolar', 143, 266, 21, 30),
  ...pair(CANINE_MAX_CX, 107, 207, 'P3', 'premolar', 175, 327, 25, 30),
  // P4 — the big maxillary carnassial
  ...pair(CANINE_MAX_CX, 108, 208, 'P4', 'carnassial', 215, 412, 43, 56),
  // M1 (large rounded), M2 (smaller and flatter behind M1)
  ...pair(CANINE_MAX_CX, 109, 209, 'M1', 'molar', 228, 508, 39, 37),
  ...pair(CANINE_MAX_CX, 110, 210, 'M2', 'molar', 212, 563, 38, 25),

  // === MANDIBLE ===
  // M3 (smallest, most posterior; just below midline)
  ...pair(CANINE_MAND_CX, 411, 311, 'M3', 'molar', 199, 605, 13, 17),
  // M2
  ...pair(CANINE_MAND_CX, 410, 310, 'M2', 'molar', 195, 645, 17, 27),
  // M1 — large lower carnassial
  ...pair(CANINE_MAND_CX, 409, 309, 'M1', 'carnassial', 180, 746, 27, 58),
  // P4–P1 progressively smaller forward along the arch
  ...pair(CANINE_MAND_CX, 408, 308, 'P4', 'premolar', 149, 842, 18, 30),
  ...pair(CANINE_MAND_CX, 407, 307, 'P3', 'premolar', 134, 907, 15, 32),
  ...pair(CANINE_MAND_CX, 406, 306, 'P2', 'premolar', 119, 968, 14, 29),
  ...pair(CANINE_MAND_CX, 405, 305, 'P1', 'premolar', 113, 1015, 9, 12),
  // Lower canine — large fang at the front of the mandibular arch
  ...pair(CANINE_MAND_CX, 404, 304, 'C', 'canine', 110, 1077, 32, 41, 10),
  // 6 lower incisors clustered between the canines
  ...pair(CANINE_MAND_CX, 403, 303, 'I3', 'incisor', 83, 1123, 14, 23),
  ...pair(CANINE_MAND_CX, 402, 302, 'I2', 'incisor', 51, 1124, 14, 19),
  ...pair(CANINE_MAND_CX, 401, 301, 'I1', 'incisor', 19, 1125, 12, 18),
];

// ============================================================
// FELINE — PNG 690×1085
// Center x ≈ 345, R/L midline ≈ y=540
// ============================================================
const FELINE_CX = 345;
const FELINE_MIDLINE = 540;

const felineTeeth: ToothShape[] = [
  // === MAXILLA ===
  // 6 tiny incisors clustered tightly at top center
  ...pair(FELINE_CX, 101, 201, 'I1', 'incisor', 9, 32, 6, 9),
  ...pair(FELINE_CX, 102, 202, 'I2', 'incisor', 24, 36, 7, 10),
  ...pair(FELINE_CX, 103, 203, 'I3', 'incisor', 41, 44, 9, 12),
  // Canines — prominent fangs flanking the incisors
  ...pair(FELINE_CX, 104, 204, 'C', 'canine', 100, 105, 22, 55, -10),
  // P2 — small round, just behind canine (no P1 in cats)
  ...pair(FELINE_CX, 106, 206, 'P2', 'premolar', 150, 200, 12, 16),
  // P3 — elongated curved oval
  ...pair(FELINE_CX, 107, 207, 'P3', 'premolar', 162, 275, 18, 32),
  // P4 carnassial — large multi-rooted
  ...pair(FELINE_CX, 108, 208, 'P4', 'carnassial', 178, 365, 26, 48),
  // M1 — tiny round, sits laterally just behind P4 (cx offsets ~233/242 in the SVG)
  ...pair(FELINE_CX, 109, 209, 'M1', 'molar', 237, 432, 12, 14),

  // === MANDIBLE ===
  // M1 lower carnassial — large multi-rooted, the back-most mandible tooth
  ...pair(FELINE_CX, 409, 309, 'M1', 'carnassial', 187, 736, 22, 46),
  // P4 — oval (no P1, P2 in cats lower)
  ...pair(FELINE_CX, 408, 308, 'P4', 'premolar', 150, 828, 22, 40),
  // P3 — smaller oval
  ...pair(FELINE_CX, 407, 307, 'P3', 'premolar', 114, 907, 17, 32),
  // Lower canine — large fang. cy is the canine center; the tooth extends well above and below it.
  ...pair(FELINE_CX, 404, 304, 'C', 'canine', 76, 1030, 17, 52, 10),
  // 6 lower incisors clustered between the canines
  ...pair(FELINE_CX, 403, 303, 'I3', 'incisor', 47, 1031, 9, 16),
  ...pair(FELINE_CX, 402, 302, 'I2', 'incisor', 30, 1034, 8, 14),
  ...pair(FELINE_CX, 401, 301, 'I1', 'incisor', 11, 1038, 7, 12),
];

// No per-tooth hitShape overrides are needed: canine.svg's historically
// fused 410+409 stroke was split into proper per-tooth outline loops
// directly in the SVG (see the repo history for the extraction script),
// so every tooth — including 310/410/409 — resolves through the same
// subpath auto-matching in ToothDiagram.

// Shared decor for both canine dentitions (adult + deciduous reuse the
// same artwork).
const CANINE_LABEL_CULLS = [
  { minX: 325, minY: 424, maxX: 427, maxY: 456 },  // "Maxilla" letterforms
  { minX: 316, minY: 708, maxX: 448, maxY: 742 },  // "Mandible" letterforms
  { minX: 70,  minY: 554, maxX: 108, maxY: 603 },  // "R"
  { minX: 659, minY: 557, maxX: 695, maxY: 605 },  // "L"
  { minX: 100, minY: 578, maxX: 665, maxY: 590 },  // wobbly midline dashes
];
const CANINE_LABELS = [
  // Both words sit on one shared center axis — the midpoint of the
  // midline (383.5) — so they center-justify against each other and
  // the drawing as a whole.
  { text: 'Maxilla',  x: 383.5, y: 440, fontSize: 26 },
  { text: 'Mandible', x: 383.5, y: 725, fontSize: 26 },
  { text: 'R', x: 89,  y: 583, fontSize: 34 },
  { text: 'L', x: 677, y: 583, fontSize: 34 },
];
const CANINE_MIDLINE_DASH = { x1: 116, x2: 651, y: 583 };

/** Adult teeth with no deciduous precursor: P1s, upper M1-M2, lower M1-M3.
 *  A puppy chart shows neither their anchors nor their artwork. */
const ADULT_ONLY_TRIADANS = new Set([
  105, 205, 305, 405,
  109, 110, 209, 210,
  309, 310, 311, 409, 410, 411,
]);

// With the adult lower molars culled, the deciduous mandibular arch would
// start ~230px below the midline (vs ~115 for the maxilla) and read
// smaller. Scale it up and lift it so both arches sit the same distance
// from the dashed line at a comparable visual scale. The same numbers are
// applied to the outline subpaths at parse time (ToothDiagram).
const CANINE_DECIDUOUS_MANDIBLE_RESCALE = {
  belowY: 700,           // everything below this (post-cull) is the lower arch
  centerX: CANINE_MAND_CX,
  scale: 1.25,
  refY: 812,             // current arch top (p4 upper edge)…
  targetY: 698,          // …moves here: midline (583) + the maxilla's 115px gap
};

// Deciduous anchors reuse the adult positions (same artwork) with the
// Triadan quadrant shifted +400 (1xx→5xx … 4xx→8xx) and lowercase labels,
// per the AVDC deciduous convention (i1-i3, c, p2-p4; no x05). Mandible
// anchors get the same rescale as the artwork.
const canineDeciduousTeeth: ToothShape[] = canineTeeth
  .filter((t) => !ADULT_ONLY_TRIADANS.has(t.triadan))
  .map((t) => {
    const base = { ...t, triadan: t.triadan + 400, label: t.label.toLowerCase() };
    const r = CANINE_DECIDUOUS_MANDIBLE_RESCALE;
    if (t.cy <= r.belowY) return base;
    return {
      ...base,
      cx: r.centerX + (t.cx - r.centerX) * r.scale,
      cy: r.targetY + (t.cy - r.refY) * r.scale,
      rx: t.rx * r.scale,
      ry: t.ry * r.scale,
    };
  });

export const TOOTH_DIAGRAMS: Record<Species, SpeciesDiagram> = {
  canine: {
    imageSrc: '/diagrams/canine.png',
    width: 802,
    height: 1140,
    midlineY: CANINE_MIDLINE,
    teeth: canineTeeth,
    cropBounds: { minY: 30, maxY: 1145 },
    labelCulls: CANINE_LABEL_CULLS,
    labels: CANINE_LABELS,
    midlineDash: CANINE_MIDLINE_DASH,
  },
  'canine-deciduous': {
    imageSrc: '/diagrams/canine.png',
    width: 802,
    height: 1140,
    midlineY: CANINE_MIDLINE,
    teeth: canineDeciduousTeeth,
    cropBounds: { minY: 30, maxY: 1145 },
    // Cull the adult-only teeth's artwork on top of the usual label culls,
    // so the drawing shows only the 28 deciduous-position teeth.
    labelCulls: [...CANINE_LABEL_CULLS, ...CANINE_ADULT_ONLY_TOOTH_CULLS],
    labels: [
      { text: 'Maxilla',  x: 383.5, y: 440, fontSize: 26 },
      // The lifted mandible arch starts at y≈698, so the word sits in the
      // gap between the midline and the arch.
      { text: 'Mandible', x: 383.5, y: 645, fontSize: 26 },
      { text: 'R', x: 89,  y: 583, fontSize: 34 },
      { text: 'L', x: 677, y: 583, fontSize: 34 },
    ],
    midlineDash: CANINE_MIDLINE_DASH,
    mandibleRescale: CANINE_DECIDUOUS_MANDIBLE_RESCALE,
  },
  feline: {
    imageSrc: '/diagrams/feline.png',
    width: 690,
    height: 1085,
    midlineY: FELINE_MIDLINE,
    teeth: felineTeeth,
    cropBounds: { minY: 12, maxY: 1090 },
    labelCulls: [
      { minX: 292, minY: 328, maxX: 395, maxY: 362 },  // "Maxilla" letterforms
      { minX: 276, minY: 684, maxX: 410, maxY: 716 },  // "Mandible" letterforms
      { minX: -2,  minY: 522, maxX: 37,  maxY: 571 },  // "R"
      { minX: 657, minY: 517, maxX: 693, maxY: 566 },  // "L"
      { minX: 35,  minY: 531, maxX: 660, maxY: 548 },  // wobbly midline dashes
    ],
    labels: [
      { text: 'Maxilla',  x: FELINE_CX, y: 345, fontSize: 26 },
      { text: 'Mandible', x: FELINE_CX, y: 700, fontSize: 26 },
      { text: 'R', x: 20,  y: 540, fontSize: 34 },
      { text: 'L', x: 672, y: 540, fontSize: 34 },
    ],
    midlineDash: { x1: 48, x2: 645, y: 540 },
  },
};
