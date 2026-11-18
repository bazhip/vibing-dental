import { ToothData, Species } from '../types';

/**
 * Full canine tooth data with triadan numbering system (42 teeth)
 * Organized by quadrants:
 * - 100s: Upper right (maxillary right)
 * - 200s: Upper left (maxillary left)
 * - 300s: Lower left (mandibular left)
 * - 400s: Lower right (mandibular right)
 */
export const CANINE_TOOTH_DATA: ToothData[] = [
  // Upper right quadrant (101-110)
  { tooth: 'I1', triadan: 101 },
  { tooth: 'I2', triadan: 102 },
  { tooth: 'I3', triadan: 103 },
  { tooth: 'C', triadan: 104 },
  { tooth: 'P1', triadan: 105 },
  { tooth: 'P2', triadan: 106 },
  { tooth: 'P3', triadan: 107 },
  { tooth: 'P4', triadan: 108 },
  { tooth: 'M1', triadan: 109 },
  { tooth: 'M2', triadan: 110 },

  // Lower right quadrant (401-411)
  { tooth: 'I1', triadan: 401 },
  { tooth: 'I2', triadan: 402 },
  { tooth: 'I3', triadan: 403 },
  { tooth: 'C', triadan: 404 },
  { tooth: 'P1', triadan: 405 },
  { tooth: 'P2', triadan: 406 },
  { tooth: 'P3', triadan: 407 },
  { tooth: 'P4', triadan: 408 },
  { tooth: 'M1', triadan: 409 },
  { tooth: 'M2', triadan: 410 },
  { tooth: 'M3', triadan: 411 },

  // Upper left quadrant (201-210)
  { tooth: 'I1', triadan: 201 },
  { tooth: 'I2', triadan: 202 },
  { tooth: 'I3', triadan: 203 },
  { tooth: 'C', triadan: 204 },
  { tooth: 'P1', triadan: 205 },
  { tooth: 'P2', triadan: 206 },
  { tooth: 'P3', triadan: 207 },
  { tooth: 'P4', triadan: 208 },
  { tooth: 'M1', triadan: 209 },
  { tooth: 'M2', triadan: 210 },

  // Lower left quadrant (301-311)
  { tooth: 'I1', triadan: 301 },
  { tooth: 'I2', triadan: 302 },
  { tooth: 'I3', triadan: 303 },
  { tooth: 'C', triadan: 304 },
  { tooth: 'P1', triadan: 305 },
  { tooth: 'P2', triadan: 306 },
  { tooth: 'P3', triadan: 307 },
  { tooth: 'P4', triadan: 308 },
  { tooth: 'M1', triadan: 309 },
  { tooth: 'M2', triadan: 310 },
  { tooth: 'M3', triadan: 311 },
];

/**
 * Feline tooth data with triadan numbering system (30 teeth)
 * Dental formula: I3/3, C1/1, P3/2, M1/1
 * Upper: no P1, no M2
 * Lower: no P1, no P2, no M2, no M3
 */
export const FELINE_TOOTH_DATA: ToothData[] = [
  // Upper right quadrant (101-109) - Missing P1(105), M2(110)
  { tooth: 'I1', triadan: 101 },
  { tooth: 'I2', triadan: 102 },
  { tooth: 'I3', triadan: 103 },
  { tooth: 'C', triadan: 104 },
  { tooth: 'P2', triadan: 106 },
  { tooth: 'P3', triadan: 107 },
  { tooth: 'P4', triadan: 108 },
  { tooth: 'M1', triadan: 109 },

  // Lower right quadrant (401-409) - Missing P1(405), P2(406), M2(410), M3(411)
  { tooth: 'I1', triadan: 401 },
  { tooth: 'I2', triadan: 402 },
  { tooth: 'I3', triadan: 403 },
  { tooth: 'C', triadan: 404 },
  { tooth: 'P3', triadan: 407 },
  { tooth: 'P4', triadan: 408 },
  { tooth: 'M1', triadan: 409 },

  // Upper left quadrant (201-209) - Missing P1(205), M2(210)
  { tooth: 'I1', triadan: 201 },
  { tooth: 'I2', triadan: 202 },
  { tooth: 'I3', triadan: 203 },
  { tooth: 'C', triadan: 204 },
  { tooth: 'P2', triadan: 206 },
  { tooth: 'P3', triadan: 207 },
  { tooth: 'P4', triadan: 208 },
  { tooth: 'M1', triadan: 209 },

  // Lower left quadrant (301-309) - Missing P1(305), P2(306), M2(310), M3(311)
  { tooth: 'I1', triadan: 301 },
  { tooth: 'I2', triadan: 302 },
  { tooth: 'I3', triadan: 303 },
  { tooth: 'C', triadan: 304 },
  { tooth: 'P3', triadan: 307 },
  { tooth: 'P4', triadan: 308 },
  { tooth: 'M1', triadan: 309 },
];

/**
 * Deciduous canine (puppy) tooth data — 28 teeth per the AVDC Triadan
 * table (Floyd 1991): i1-i3, c, p2-p4 per quadrant in the 500s-800s.
 * There is no x05 (P1 has no deciduous precursor) and no molars.
 * Lowercase labels are the AVDC convention for deciduous teeth.
 */
export const CANINE_DECIDUOUS_TOOTH_DATA: ToothData[] = [
  // Upper right quadrant (501-508)
  { tooth: 'i1', triadan: 501 },
  { tooth: 'i2', triadan: 502 },
  { tooth: 'i3', triadan: 503 },
  { tooth: 'c',  triadan: 504 },
  { tooth: 'p2', triadan: 506 },
  { tooth: 'p3', triadan: 507 },
  { tooth: 'p4', triadan: 508 },

  // Lower right quadrant (801-808)
  { tooth: 'i1', triadan: 801 },
  { tooth: 'i2', triadan: 802 },
  { tooth: 'i3', triadan: 803 },
  { tooth: 'c',  triadan: 804 },
  { tooth: 'p2', triadan: 806 },
  { tooth: 'p3', triadan: 807 },
  { tooth: 'p4', triadan: 808 },

  // Upper left quadrant (601-608)
  { tooth: 'i1', triadan: 601 },
  { tooth: 'i2', triadan: 602 },
  { tooth: 'i3', triadan: 603 },
  { tooth: 'c',  triadan: 604 },
  { tooth: 'p2', triadan: 606 },
  { tooth: 'p3', triadan: 607 },
  { tooth: 'p4', triadan: 608 },

  // Lower left quadrant (701-708)
  { tooth: 'i1', triadan: 701 },
  { tooth: 'i2', triadan: 702 },
  { tooth: 'i3', triadan: 703 },
  { tooth: 'c',  triadan: 704 },
  { tooth: 'p2', triadan: 706 },
  { tooth: 'p3', triadan: 707 },
  { tooth: 'p4', triadan: 708 },
];

/**
 * Deciduous cat (kitten) tooth data — 26 teeth. Formula 2×(i3/3, c1/1,
 * p3/2): maxilla has dp2-dp4, mandible has only dp3-dp4 (no lower dp2).
 * No x05 and no molars. Lowercase labels per AVDC convention.
 */
export const FELINE_DECIDUOUS_TOOTH_DATA: ToothData[] = [
  // Upper right (501-508)
  { tooth: 'i1', triadan: 501 },
  { tooth: 'i2', triadan: 502 },
  { tooth: 'i3', triadan: 503 },
  { tooth: 'c',  triadan: 504 },
  { tooth: 'p2', triadan: 506 },
  { tooth: 'p3', triadan: 507 },
  { tooth: 'p4', triadan: 508 },
  // Lower right (801-808) — no p2 (806)
  { tooth: 'i1', triadan: 801 },
  { tooth: 'i2', triadan: 802 },
  { tooth: 'i3', triadan: 803 },
  { tooth: 'c',  triadan: 804 },
  { tooth: 'p3', triadan: 807 },
  { tooth: 'p4', triadan: 808 },
  // Upper left (601-608)
  { tooth: 'i1', triadan: 601 },
  { tooth: 'i2', triadan: 602 },
  { tooth: 'i3', triadan: 603 },
  { tooth: 'c',  triadan: 604 },
  { tooth: 'p2', triadan: 606 },
  { tooth: 'p3', triadan: 607 },
  { tooth: 'p4', triadan: 608 },
  // Lower left (701-708) — no p2 (706)
  { tooth: 'i1', triadan: 701 },
  { tooth: 'i2', triadan: 702 },
  { tooth: 'i3', triadan: 703 },
  { tooth: 'c',  triadan: 704 },
  { tooth: 'p3', triadan: 707 },
  { tooth: 'p4', triadan: 708 },
];

/**
 * Equine (adult horse) tooth data — 44 positions, Triadan 01-11 per
 * quadrant: I1-I3, C (often absent in mares), P1 = the wolf tooth (05,
 * often absent), P2-P4, M1-M3. All positions are listed; a tooth that
 * isn't there is marked missing on the chart, as for the other species.
 */
export const EQUINE_TOOTH_DATA: ToothData[] = [
  // Upper right quadrant (101-111)
  { tooth: 'I1', triadan: 101 },
  { tooth: 'I2', triadan: 102 },
  { tooth: 'I3', triadan: 103 },
  { tooth: 'C', triadan: 104 },
  { tooth: 'P1', triadan: 105 },
  { tooth: 'P2', triadan: 106 },
  { tooth: 'P3', triadan: 107 },
  { tooth: 'P4', triadan: 108 },
  { tooth: 'M1', triadan: 109 },
  { tooth: 'M2', triadan: 110 },
  { tooth: 'M3', triadan: 111 },

  // Lower right quadrant (401-411)
  { tooth: 'I1', triadan: 401 },
  { tooth: 'I2', triadan: 402 },
  { tooth: 'I3', triadan: 403 },
  { tooth: 'C', triadan: 404 },
  { tooth: 'P1', triadan: 405 },
  { tooth: 'P2', triadan: 406 },
  { tooth: 'P3', triadan: 407 },
  { tooth: 'P4', triadan: 408 },
  { tooth: 'M1', triadan: 409 },
  { tooth: 'M2', triadan: 410 },
  { tooth: 'M3', triadan: 411 },

  // Upper left quadrant (201-211)
  { tooth: 'I1', triadan: 201 },
  { tooth: 'I2', triadan: 202 },
  { tooth: 'I3', triadan: 203 },
  { tooth: 'C', triadan: 204 },
  { tooth: 'P1', triadan: 205 },
  { tooth: 'P2', triadan: 206 },
  { tooth: 'P3', triadan: 207 },
  { tooth: 'P4', triadan: 208 },
  { tooth: 'M1', triadan: 209 },
  { tooth: 'M2', triadan: 210 },
  { tooth: 'M3', triadan: 211 },

  // Lower left quadrant (301-311)
  { tooth: 'I1', triadan: 301 },
  { tooth: 'I2', triadan: 302 },
  { tooth: 'I3', triadan: 303 },
  { tooth: 'C', triadan: 304 },
  { tooth: 'P1', triadan: 305 },
  { tooth: 'P2', triadan: 306 },
  { tooth: 'P3', triadan: 307 },
  { tooth: 'P4', triadan: 308 },
  { tooth: 'M1', triadan: 309 },
  { tooth: 'M2', triadan: 310 },
  { tooth: 'M3', triadan: 311 },
];

/** Adult rabbit: upper I1/I2 (peg), P2–P4, M1–M3;
 * lower I1, P3/P4, M1–M3. All 28 teeth are continuously growing. */
export const RABBIT_TOOTH_DATA: ToothData[] = [1, 4, 2, 3].flatMap(q => {
  const positions = q === 1 || q === 2 ? [1, 2, 6, 7, 8, 9, 10, 11] : [1, 7, 8, 9, 10, 11];
  return positions.map(pos => ({
    tooth: pos <= 2 ? `I${pos}` : pos < 9 ? `P${pos - 4}` : `M${pos - 8}`,
    triadan: q * 100 + pos,
  }));
});

/**
 * Get initial tooth data based on species
 */
export function getInitialToothData(species: Species): ToothData[] {
  if (species === 'canine') return CANINE_TOOTH_DATA;
  if (species === 'canine-deciduous') return CANINE_DECIDUOUS_TOOTH_DATA;
  if (species === 'feline-deciduous') return FELINE_DECIDUOUS_TOOTH_DATA;
  if (species === 'equine') return EQUINE_TOOTH_DATA;
  if (species === 'rabbit') return RABBIT_TOOTH_DATA;
  return FELINE_TOOTH_DATA;
}

/**
 * Legacy export for backward compatibility
 * Defaults to canine
 */
export const INITIAL_TOOTH_DATA = CANINE_TOOTH_DATA;
