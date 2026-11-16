import { TOOTH_GRID_LAYOUTS } from '../constants/chartLayout';
import type { Species } from '../types';
import { toothDisplayName } from './toothChart';

/** Diagram label (e.g. "P4") for every Triadan number in any chart. */
const ABBR = new Map<number, string>();
for (const layout of Object.values(TOOTH_GRID_LAYOUTS)) {
  for (const tooth of [...layout.maxilla.teeth, ...layout.mandible.teeth]) {
    if (!ABBR.has(tooth.triadan)) ABBR.set(tooth.triadan, tooth.abbr);
  }
}

/** Teeth an image can be pinned to on a chart of this species, in
 *  Triadan order (quadrant 1, 2, 3, 4; front to back). */
export function imageTeeth(species: Species): number[] {
  const layout = TOOTH_GRID_LAYOUTS[species] ?? TOOTH_GRID_LAYOUTS.canine;
  return [...layout.maxilla.teeth, ...layout.mandible.teeth].map((t) => t.triadan).sort((a, b) => a - b);
}

/** "108 · Right maxillary 4th premolar" in the active language; just the
 *  number for a Triadan no chart knows. */
export function imageToothLabel(triadan: number, lng?: string): string {
  const abbr = ABBR.get(triadan);
  return abbr ? `${triadan} · ${toothDisplayName(triadan, abbr, lng)}` : String(triadan);
}
