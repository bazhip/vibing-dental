import { toothDisplayName, toothWalkOrder, setToothNote, findToothNote, hasFindings } from './toothChart';
import { numberLabelPosition, spreadLabels, arcLabelPositions } from '../components/ToothDiagram';
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

describe('arcLabelPositions', () => {
  const box = (cx: number, cy: number) => ({ minX: cx - 6, maxX: cx + 6, minY: cy - 10, maxY: cy + 10, cx, cy });
  // cat-like upper incisors: 103 102 101 | 201 202 203, tightly packed
  const upper = [101, 102, 103, 201, 202, 203].map((t) => {
    const side = t < 200 ? -1 : 1;
    const pos = t % 100;
    return { triadan: t, bbox: box(345 + side * (pos * 13 - 6), 60 + pos * 2) };
  });
  const label = { w: 44, h: 24, gap: 12 };
  const overlapsAny = (pos: { x: number; y: number }, boxes: Array<{ minX: number; maxX: number; minY: number; maxY: number }>) =>
    boxes.some((b) =>
      pos.x + label.w / 2 > b.minX && pos.x - label.w / 2 < b.maxX &&
      pos.y + label.h / 2 > b.minY && pos.y - label.h / 2 < b.maxY);

  test('upper arc: tooth order left to right, evenly spaced, centre highest', () => {
    const p = arcLabelPositions(upper, -1, label);
    const order = [103, 102, 101, 201, 202, 203].map((t) => p.get(t)!);
    for (let i = 1; i < order.length; i++) {
      expect(order[i].x).toBeGreaterThan(order[i - 1].x);
      const d = Math.hypot(order[i].x - order[i - 1].x, order[i].y - order[i - 1].y);
      expect(d).toBeGreaterThanOrEqual(label.w); // never overlap
    }
    // symmetric arch, bulging up: the middle pair is highest, ends lowest
    expect(p.get(101)!.y).toBeCloseTo(p.get(201)!.y);
    expect(p.get(103)!.y).toBeCloseTo(p.get(203)!.y);
    expect(p.get(101)!.y).toBeLessThan(p.get(102)!.y);
    expect(p.get(102)!.y).toBeLessThan(p.get(103)!.y);
    // no label covers an incisor
    for (const pos of order) expect(overlapsAny(pos, upper.map((t) => t.bbox))).toBe(false);
    // the apex hugs the row: the middle labels sit right above the I1s
    expect(p.get(101)!.y + label.h / 2).toBeCloseTo(upper[0].bbox.minY - label.gap);
  });

  test('lower arc mirrors downward', () => {
    const lower = upper.map((t) => ({ triadan: t.triadan + 200, bbox: box(t.bbox.cx, 900) }));
    const p = arcLabelPositions(lower, 1, label);
    expect(p.get(301)!.y).toBeGreaterThan(p.get(303)!.y);
    for (const pos of p.values()) expect(overlapsAny(pos, lower.map((t) => t.bbox))).toBe(false);
  });

  test('arc ends clear obstacles such as the canines beside the incisors', () => {
    const canines = [box(250, 70), box(440, 70)].map((b) => ({ ...b, minY: 10, maxY: 130, minX: b.cx - 30, maxX: b.cx + 30 }));
    const p = arcLabelPositions(upper, -1, label, [...upper.map((t) => t.bbox), ...canines]);
    for (const pos of p.values()) expect(overlapsAny(pos, canines)).toBe(false);
  });
});

test('spreadLabels never moves fixed labels', () => {
  const out = spreadLabels([
    { x: 100, y: 50, w: 40, h: 20, fixed: true },
    { x: 110, y: 55, w: 40, h: 20 },
  ]);
  expect(out[0]).toEqual({ x: 100, y: 50 });
  const clear = Math.abs(out[1].x - 100) >= 40 || Math.abs(out[1].y - 50) >= 20;
  expect(clear).toBe(true);
});
