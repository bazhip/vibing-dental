import { toothDisplayName, toothWalkOrder, setToothNote, findToothNote, hasFindings } from './toothChart';
import { numberLabelPosition, spreadLabels } from '../components/ToothDiagram';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import { DiagramComment } from '../types';

test('tooth names spell out side, jaw and tooth', () => {
  expect(toothDisplayName(108, 'P4')).toBe('Right maxillary 4th premolar');
  expect(toothDisplayName(204, 'C')).toBe('Left maxillary canine');
  expect(toothDisplayName(309, 'M1')).toBe('Left mandibular 1st molar');
  expect(toothDisplayName(401, 'I1')).toBe('Right mandibular 1st incisor');
  expect(toothDisplayName(504, 'c')).toBe('Right maxillary deciduous canine');
  expect(toothDisplayName(707, 'p3')).toBe('Left mandibular deciduous 3rd premolar');
});

test('walk order laps the mouth continuously', () => {
  const order = toothWalkOrder(TOOTH_DIAGRAMS.canine.teeth.map((t) => t.triadan));
  expect(order).toHaveLength(42);
  expect(order.slice(0, 3)).toEqual([110, 109, 108]);
  // upper right ends at the midline, upper left starts there
  expect(order.slice(9, 12)).toEqual([101, 201, 202]);
  expect(order.slice(19, 22)).toEqual([210, 311, 310]);
  expect(order.slice(30, 32)).toEqual([301, 401]);
  expect(order[41]).toBe(411);
});

test('walk order works for deciduous quadrants', () => {
  const order = toothWalkOrder(TOOTH_DIAGRAMS['canine-deciduous'].teeth.map((t) => t.triadan));
  expect(order[0]).toBe(508);
  expect(order[order.length - 1]).toBe(808);
});

describe('setToothNote', () => {
  const id = () => 'new';
  test('creates, re-texts (dropping fitted size), and removes', () => {
    let c: DiagramComment[] = [];
    c = setToothNote(c, 104, 'Fx', id);
    expect(c).toEqual([{ id: 'new', text: 'Fx', anchorTriadan: 104 }]);
    c = [{ ...c[0], width: 100, height: 40, x: 5, y: 6 }];
    c = setToothNote(c, 104, 'Fx crown', id);
    expect(c).toEqual([{ id: 'new', text: 'Fx crown', anchorTriadan: 104, x: 5, y: 6 }]);
    c = setToothNote(c, 104, '  ', id);
    expect(c).toEqual([]);
  });

  test('ignores mirrored grid cards and leaves other comments alone', () => {
    const grid: DiagramComment = { id: 'grid-104', text: 'Pocket 5', anchorTriadan: 104 };
    const other: DiagramComment = { id: 'x', text: 'other', anchorTriadan: 105 };
    expect(findToothNote([grid], 104)).toBeUndefined();
    const out = setToothNote([grid, other], 104, 'note', id);
    expect(out).toEqual([grid, other, { id: 'new', text: 'note', anchorTriadan: 104 }]);
  });

  test('returns the same array when nothing changes', () => {
    const c: DiagramComment[] = [{ id: 'a', text: 'same', anchorTriadan: 104 }];
    expect(setToothNote(c, 104, 'same', id)).toBe(c);
    expect(setToothNote([], 104, '', id)).toEqual([]);
  });
});

test('hasFindings looks only at measurement columns', () => {
  expect(hasFindings({ tooth: 'C', triadan: 104 })).toBe(false);
  expect(hasFindings({ tooth: 'C', triadan: 104, pocket: ' ' })).toBe(false);
  expect(hasFindings({ tooth: 'C', triadan: 104, pocket: '4' })).toBe(true);
});

describe('numberLabelPosition', () => {
  const box = (cx: number, cy: number, hw: number, hh: number) => ({
    minX: cx - hw, maxX: cx + hw, minY: cy - hh, maxY: cy + hh, cx, cy,
  });
  test('pushes the label outward, past the tooth edge', () => {
    // tooth straight above the arch centre → label above it
    const p = numberLabelPosition(box(100, 50, 10, 20), { x: 100, y: 500 }, 15);
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(50 - 20 - 15);
    // tooth to the right of centre → label to its right
    const q = numberLabelPosition(box(300, 500, 10, 20), { x: 100, y: 500 }, 15);
    expect(q.x).toBeCloseTo(300 + 10 + 15);
    expect(q.y).toBeCloseTo(500);
  });
});

test('spreadLabels separates overlapping labels and leaves clear ones alone', () => {
  const out = spreadLabels([
    { x: 100, y: 50, w: 40, h: 20 },
    { x: 110, y: 50, w: 40, h: 20 },
    { x: 400, y: 400, w: 40, h: 20 },
  ]);
  // no longer overlapping on at least one axis
  const clearX = Math.abs(out[1].x - out[0].x) >= 40;
  const clearY = Math.abs(out[1].y - out[0].y) >= 20;
  expect(clearX || clearY).toBe(true);
  expect(out[2]).toEqual({ x: 400, y: 400 });
});
