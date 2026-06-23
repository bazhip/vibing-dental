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

/**
 * Hand-crafted hit shape for canine M2 (410). The SVG's outline path
 * traces 410 + 409 as a single compound subpath, so the auto-matcher
 * has no clean per-tooth boundary to use — it falls back to an
 * inscribed ellipse covering the whole compound, which bleeds into
 * 409 territory. Tracing 410's outer perimeter by hand below restores
 * a tooth-shaped hover/click area. 310 (mirror left) gets the same
 * shape with X reflected around the mandibular midline.
 */
{
  // Reflection axis for deriving 310's hitShape from 410's traced path. The
  // shape is a faithful mirror of 410 (which fills correctly); only the
  // horizontal position needs calibrating. Bracketed from rendered builds:
  // 397 → ~24px too far right, 385 → too far left, 393.5 → still slightly
  // right. 389 is the interpolated midpoint (310 bbox center ≈ 583).
  // Calibrated against /public/diagrams/canine.png; nudge ±2 if needed.
  const CANINE_MIDLINE_X = 389;
  const t410d =
    'M 182.8 629.5 ' +
    'L 175.9 641.1 ' +
    'L 186.5 682 ' +
    'L 210.3 689.3 ' +
    'L 213.9 665.2 ' +
    'L 212.0 654.8 ' +
    'L 195.4 629.0 Z';
  const t410bbox = { minX: 175.9, minY: 629.0, maxX: 213.9, maxY: 689.3 };
  // Walk t410d and rebuild with x flipped (mirror around the
  // mandibular midline) to produce the matching shape for 310.
  const tokens = t410d.match(/[MLZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const flipped: string[] = [];
  let isX = false;
  for (const tok of tokens) {
    if (/^[MLZ]$/.test(tok)) {
      flipped.push(tok);
      isX = tok !== 'Z';
    } else {
      flipped.push(
        isX
          ? (2 * CANINE_MIDLINE_X - parseFloat(tok)).toFixed(1)
          : tok
      );
      isX = !isX;
    }
  }
  const t310d = flipped.join(' ');
  const t310bbox = {
    minX: 2 * CANINE_MIDLINE_X - t410bbox.maxX,
    maxX: 2 * CANINE_MIDLINE_X - t410bbox.minX,
    minY: t410bbox.minY,
    maxY: t410bbox.maxY,
  };

  for (const t of canineTeeth) {
    if (t.triadan === 410) t.hitShape = { d: t410d, bbox: t410bbox };
    if (t.triadan === 310) t.hitShape = { d: t310d, bbox: t310bbox };
  }
}

export const TOOTH_DIAGRAMS: Record<Species, SpeciesDiagram> = {
  canine: {
    imageSrc: '/diagrams/canine.png',
    width: 802,
    height: 1140,
    midlineY: CANINE_MIDLINE,
    teeth: canineTeeth,
    cropBounds: { minY: 30, maxY: 1145 },
  },
  feline: {
    imageSrc: '/diagrams/feline.png',
    width: 690,
    height: 1085,
    midlineY: FELINE_MIDLINE,
    teeth: felineTeeth,
    cropBounds: { minY: 12, maxY: 1090 },
  },
};
