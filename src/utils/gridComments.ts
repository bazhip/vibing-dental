import { DiagramComment, ToothData, ToothMarks } from '../types';
import { GRID_COLUMNS } from '../constants/columnDefinitions';

/**
 * Charting → Diagnosis mirroring. When the vet opts in (checkbox on the
 * Charting section), every tooth with grid findings gets an anchored
 * comment on the Diagnosis diagram — owners read the mouth picture far
 * more easily than the spreadsheet.
 *
 * Mirrored comments carry a reserved id prefix so they can be told
 * apart from hand-written ones: their text is regenerated from the grid
 * on every change, while a position the user dragged is kept. The
 * diagram shrink-wraps each card to its text (see ToothDiagram), and
 * undo history leaves them out (see useDiagramHistory).
 */

export const GRID_COMMENT_PREFIX = 'grid-';
const WHOLE_MOUTH_ID = `${GRID_COMMENT_PREFIX}whole-mouth`;

export const isGridComment = (c: DiagramComment) => c.id.startsWith(GRID_COMMENT_PREFIX);

const FINDING_COLUMNS = GRID_COLUMNS.filter((c) => c.editable);

const valueOf = (t: ToothData, key: keyof ToothData) => {
  const v = t[key];
  return typeof v === 'string' ? v.trim() : '';
};

/** Comment texts the grid currently implies: one per tooth with findings,
 *  plus a single free-floating "Whole mouth" card for any column scored
 *  identically on every present tooth (the header's set-all), so a
 *  whole-mouth calculus score doesn't repeat on 40 cards. */
export function gridCommentTexts(
  toothData: ToothData[],
  marks: ToothMarks,
  /** Which grid values to write (chart settings); all by default. */
  fields?: readonly string[],
): { perTooth: Map<number, string>; wholeMouth: string } {
  const columns = fields ? FINDING_COLUMNS.filter((c) => fields.includes(c.key)) : FINDING_COLUMNS;
  const present = toothData.filter((t) => marks[t.triadan] !== 'missing');
  const uniform = new Set<keyof ToothData>();
  const wholeParts: string[] = [];
  if (present.length > 1) {
    for (const col of columns) {
      const first = valueOf(present[0], col.key);
      if (first && present.every((t) => valueOf(t, col.key) === first)) {
        uniform.add(col.key);
        wholeParts.push(`${col.name} ${first}`);
      }
    }
  }
  const perTooth = new Map<number, string>();
  for (const t of present) {
    const parts = columns
      .filter((col) => !uniform.has(col.key) && valueOf(t, col.key))
      .map((col) => `${col.name} ${valueOf(t, col.key)}`);
    if (parts.length) perTooth.set(t.triadan, parts.join(' · '));
  }
  return { perTooth, wholeMouth: wholeParts.length ? `Whole mouth — ${wholeParts.join(' · ')}` : '' };
}

/** New text for a mirrored card. A fitted size belongs to the old text,
 *  so it's dropped and the diagram re-fits the card; position is kept. */
function retext(c: DiagramComment, text: string): DiagramComment {
  if (c.text === text) return c;
  const { width: _w, height: _h, ...rest } = c;
  return { ...rest, text };
}

/**
 * Reconcile the Diagnosis comments with the grid. Hand-written comments
 * pass through untouched; mirrored ones are added, re-texted or dropped
 * to match (all dropped when `enabled` is false). Returns `comments`
 * itself when nothing changed so callers can skip the state write — a
 * no-op write would still churn undo history and the dirty flag.
 */
export function syncGridComments(
  comments: DiagramComment[],
  toothData: ToothData[],
  marks: ToothMarks,
  enabled: boolean,
  wholeMouthSeat: { x: number; y: number },
  fields?: readonly string[],
): DiagramComment[] {
  const existing = new Map(comments.filter(isGridComment).map((c) => [c.id, c]));
  const desired: DiagramComment[] = [];
  if (enabled) {
    const { perTooth, wholeMouth } = gridCommentTexts(toothData, marks, fields);
    if (wholeMouth) {
      const prev = existing.get(WHOLE_MOUTH_ID);
      desired.push(prev
        ? retext(prev, wholeMouth)
        : { id: WHOLE_MOUTH_ID, text: wholeMouth, anchorTriadan: null, ...wholeMouthSeat });
    }
    for (const [triadan, text] of perTooth) {
      const id = `${GRID_COMMENT_PREFIX}${triadan}`;
      const prev = existing.get(id);
      desired.push(prev ? retext(prev, text) : { id, text, anchorTriadan: triadan });
    }
  }

  const unchanged =
    desired.length === existing.size &&
    desired.every((d) => existing.get(d.id)?.text === d.text);
  if (unchanged) return comments;
  return [...comments.filter((c) => !isGridComment(c)), ...desired];
}
