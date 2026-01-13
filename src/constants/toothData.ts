import { ToothData } from '../types';

/**
 * Default tooth data with triadan numbering system
 * Organized by quadrants:
 * - 100s: Upper right (maxillary right)
 * - 200s: Upper left (maxillary left)
 * - 300s: Lower left (mandibular left)
 * - 400s: Lower right (mandibular right)
 */
export const INITIAL_TOOTH_DATA: ToothData[] = [
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

  // Empty row for spacing
  { tooth: ' ', triadan: 0 },
];
