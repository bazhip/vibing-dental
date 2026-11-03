import { syncGridComments, gridCommentTexts } from './gridComments';
import { getInitialToothData } from '../constants';
import { DiagramComment, ToothData } from '../types';

const SEAT = { x: 10, y: 20 };

function teeth(edit: (rows: ToothData[]) => void = () => {}): ToothData[] {
  const rows = getInitialToothData('feline').map((t) => ({ ...t }));
  edit(rows);
  return rows;
}
const row = (rows: ToothData[], triadan: number) => rows.find((r) => r.triadan === triadan)!;

test('one anchored comment per tooth with findings', () => {
  const data = teeth((r) => {
    row(r, 104).pocket = '5';
    row(r, 104).mobility = '2';
    row(r, 309).furcation = 'F1';
  });
  const out = syncGridComments([], data, {}, true, SEAT);
  expect(out).toEqual([
    { id: 'grid-104', text: 'Mobility 2 · Pocket 5', anchorTriadan: 104 },
    { id: 'grid-309', text: 'Furcation F1', anchorTriadan: 309 },
  ]);
});

test('uniform whole-mouth scores collapse into one free comment', () => {
  const data = teeth((r) => {
    for (const t of r) t.calculus = '2';
    row(r, 104).pocket = '5';
  });
  const { perTooth, wholeMouth } = gridCommentTexts(data, {});
  expect(wholeMouth).toBe('Whole mouth — Calculus 2');
  expect([...perTooth]).toEqual([[104, 'Pocket 5']]);
  const out = syncGridComments([], data, {}, true, SEAT);
  expect(out[0]).toEqual({ id: 'grid-whole-mouth', text: wholeMouth, anchorTriadan: null, x: 10, y: 20 });
});

test('missing teeth are ignored, including for whole-mouth detection', () => {
  const data = teeth((r) => {
    for (const t of r) if (t.triadan !== 101) t.calculus = '1';
  });
  const { perTooth, wholeMouth } = gridCommentTexts(data, { 101: 'missing' });
  expect(wholeMouth).toBe('Whole mouth — Calculus 1');
  expect(perTooth.size).toBe(0);
});

test('keeps hand-written comments and dragged positions; re-texts mirrored ones', () => {
  const mine: DiagramComment = { id: 'c1', text: 'CCF — extract', anchorTriadan: 105 };
  const moved: DiagramComment = { id: 'grid-104', text: 'Pocket 3', anchorTriadan: 104, x: 50, y: 60 };
  const data = teeth((r) => { row(r, 104).pocket = '6'; });
  const out = syncGridComments([mine, moved], data, {}, true, SEAT);
  expect(out).toEqual([mine, { ...moved, text: 'Pocket 6' }]);
});

test('returns the same array when nothing changed', () => {
  const data = teeth((r) => { row(r, 104).pocket = '5'; });
  const once = syncGridComments([], data, {}, true, SEAT);
  expect(syncGridComments(once, data, {}, true, SEAT)).toBe(once);
});

test('disabling removes only mirrored comments', () => {
  const mine: DiagramComment = { id: 'c1', text: 'note', anchorTriadan: null };
  const data = teeth((r) => { row(r, 104).pocket = '5'; });
  const on = syncGridComments([mine], data, {}, true, SEAT);
  expect(syncGridComments(on, data, {}, false, SEAT)).toEqual([mine]);
});

test('re-texting a mirrored card drops its fitted size so it refits', () => {
  const fitted: DiagramComment = { id: 'grid-104', text: 'Pocket 3', anchorTriadan: 104, width: 120, height: 60 };
  const data = teeth((r) => { row(r, 104).pocket = '6'; });
  const [out] = syncGridComments([fitted], data, {}, true, SEAT);
  expect(out).toEqual({ id: 'grid-104', text: 'Pocket 6', anchorTriadan: 104 });
});
