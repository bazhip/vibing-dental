import { DiagramComment, ToothData } from '../types';
import { GRID_COLUMNS } from '../constants/columnDefinitions';
import { isGridComment } from './gridComments';
import i18n from '../i18n';

/**
 * Helpers for By-tooth charting (click a tooth on the diagram, chart it
 * in a side panel). Pure so they can be unit-tested.
 */

const TYPE_KEYS = { i: 'incisor', c: 'canine', p: 'premolar', m: 'molar' } as const;
const ORDINAL_KEYS = ['1', '2', '3', '4'] as const;

/** Tooth name in `lng` (the active language by default) from its Triadan
 *  number and diagram label, e.g. 108 + "P4" → "Right maxillary 4th
 *  premolar". Spelled out so the person charting can double-check they're
 *  on the tooth they meant. Each language has its own word order and
 *  agreement, so the whole phrase is one catalog template. */
export function toothDisplayName(triadan: number, label: string, lng: string = i18n.language): string {
  const t = i18n.getFixedT(lng, 'chart');
  const quadrant = Math.floor(triadan / 100);
  const deciduous = quadrant >= 5;
  const q = deciduous ? quadrant - 4 : quadrant;
  const side = t(q === 1 || q === 4 ? 'toothName.side.right' : 'toothName.side.left');
  const jaw = t(q === 1 || q === 2 ? 'toothName.jaw.maxillary' : 'toothName.jaw.mandibular');
  const m = /^([icpm])(\d)?$/i.exec(label.trim());
  let tooth = label;
  if (m) {
    const type = t(`toothName.type.${TYPE_KEYS[m[1].toLowerCase() as keyof typeof TYPE_KEYS]}`);
    const n = ORDINAL_KEYS.find((k) => k === m[2]);
    tooth = n ? t('toothName.ordinalTooth', { ordinal: t(`toothName.ordinal.${n}`), type }) : type;
  }
  const name = t(deciduous ? 'toothName.deciduous' : 'toothName.permanent', { side, jaw, tooth });
  // Some languages put the tooth first; the name still starts with a capital.
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Walk order for Previous/Next: one continuous lap of the mouth —
 *  upper right back-to-front, upper left front-to-back, lower left
 *  back-to-front, lower right front-to-back (110…101, 201…210, 311…301,
 *  401…411), the way a tech calls teeth out around the arches. */
export function toothWalkOrder(triadans: number[]): number[] {
  const rank = (t: number) => {
    const q = Math.floor(t / 100);
    const pos = t % 100;
    const qq = q >= 5 ? q - 4 : q;
    // Quadrants 1 and 3 run distal→mesial (high → low position).
    const lapIndex = [0, 0, 1, 2, 3][qq] ?? 4;
    const within = qq === 1 || qq === 3 ? 100 - pos : pos;
    return lapIndex * 1000 + within;
  };
  return [...triadans].sort((a, b) => rank(a) - rank(b));
}

/** Measurement columns charted per tooth (everything editable in the grid). */
export const FINDING_COLUMNS = GRID_COLUMNS.filter((c) => c.editable);

/** True when a grid row has any measurement entered. */
export function hasFindings(row: ToothData | undefined): boolean {
  if (!row) return false;
  return FINDING_COLUMNS.some((c) => {
    const v = row[c.key];
    return typeof v === 'string' && v.trim() !== '';
  });
}

/** The hand-written note anchored to a tooth (mirrored grid cards are
 *  generated, not notes, so they're skipped). */
export function findToothNote(comments: DiagramComment[], triadan: number): DiagramComment | undefined {
  return comments.find((c) => c.anchorTriadan === triadan && !isGridComment(c));
}

/**
 * Set a tooth's note text on a diagram's comment list: creates the
 * anchored comment on first text, re-texts it after (dropping the fitted
 * size so the diagram re-fits the card — its position is kept), and
 * removes it once emptied. Returns `comments` itself when nothing changed.
 */
export function setToothNote(
  comments: DiagramComment[],
  triadan: number,
  text: string,
  makeId: () => string = () => `c${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
): DiagramComment[] {
  const existing = findToothNote(comments, triadan);
  if (!existing) {
    if (!text.trim()) return comments;
    return [...comments, { id: makeId(), text, anchorTriadan: triadan }];
  }
  if (!text.trim()) return comments.filter((c) => c.id !== existing.id);
  if (existing.text === text) return comments;
  const { width: _w, height: _h, ...rest } = existing;
  return comments.map((c) => (c.id === existing.id ? { ...rest, text } : c));
}
