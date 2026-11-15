import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getInitialToothData } from './toothData';
import { TOOTH_DIAGRAMS } from './toothShapes';
import { TOOTH_GRID_LAYOUTS } from './chartLayout';
import { rootLabels } from '../utils/pocket';

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

describe('equine chart', () => {
  const data = getInitialToothData('equine');
  const triadans = sorted(data.map((t) => t.triadan));

  it('has 44 positions, 01-11 in each quadrant', () => {
    const expected = [1, 2, 3, 4].flatMap((q) => Array.from({ length: 11 }, (_, i) => q * 100 + i + 1));
    expect(triadans).toEqual(sorted(expected));
    expect(data.find((t) => t.triadan === 105)?.tooth).toBe('P1'); // wolf tooth
  });

  it('the diagram and both PDF grids cover the same teeth', () => {
    expect(sorted(TOOTH_DIAGRAMS.equine.teeth.map((t) => t.triadan))).toEqual(triadans);
    const { maxilla, mandible } = TOOTH_GRID_LAYOUTS.equine;
    expect(sorted([...maxilla.teeth, ...mandible.teeth].map((t) => t.triadan))).toEqual(triadans);
  });

  it('every tooth has a closed hit shape inside the artwork', () => {
    const { width, height, teeth } = TOOTH_DIAGRAMS.equine;
    for (const t of teeth) {
      expect(t.hitShape?.d, String(t.triadan)).toMatch(/^M .* Z$/);
      const b = t.hitShape!.bbox;
      expect(b.minX).toBeGreaterThanOrEqual(0);
      expect(b.maxX).toBeLessThanOrEqual(width);
      expect(b.minY).toBeGreaterThanOrEqual(0);
      expect(b.maxY).toBeLessThanOrEqual(height);
    }
  });

  it('patient right is drawn on the viewer’s left, maxilla above the midline', () => {
    const { teeth, midlineY } = TOOTH_DIAGRAMS.equine;
    const at = (n: number) => teeth.find((t) => t.triadan === n)!;
    expect(at(108).cx).toBeLessThan(at(208).cx);
    expect(at(408).cx).toBeLessThan(at(308).cx);
    expect(at(111).cy).toBeLessThan(midlineY);
    expect(at(411).cy).toBeGreaterThan(midlineY);
  });

  it('artwork is one path in the format parseSvg reads', () => {
    const svg = readFileSync(join(__dirname, '../../public/diagrams/equine.svg'), 'utf8');
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toMatch(/viewBox="0 0 482 1276"/);
    expect(svg).not.toMatch(/<text|#E2001A/i);
  });

  it('one pocket box per tooth', () => {
    for (const t of triadans) expect(rootLabels('equine', t)).toEqual([]);
  });
});
