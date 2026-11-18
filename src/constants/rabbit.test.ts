import { describe, expect, it } from 'vitest';
import { getInitialToothData } from './toothData';
import { TOOTH_DIAGRAMS } from './toothShapes';
import { TOOTH_GRID_LAYOUTS } from './chartLayout';
import { rootLabels } from '../utils/pocket';
import { combineSpecies, speciesBase } from '../utils/species';

const expected = [101, 102, 106, 107, 108, 109, 110, 111, 201, 202, 206, 207, 208, 209, 210, 211,
  301, 307, 308, 309, 310, 311, 401, 407, 408, 409, 410, 411];
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

describe('rabbit chart', () => {
  it('has the 28 adult teeth, including both palatal peg incisors and no canines', () => {
    const teeth = getInitialToothData('rabbit');
    expect(sorted(teeth.map(t => t.triadan))).toEqual(expected);
    expect(teeth.find(t => t.triadan === 102)?.tooth).toBe('I2');
    expect(teeth.find(t => t.triadan === 407)?.tooth).toBe('P3');
  });

  it('retains rabbit identity and switches a deciduous chart to permanent', () => {
    expect(speciesBase('rabbit')).toBe('rabbit');
    expect(combineSpecies('rabbit', 'deciduous')).toBe('rabbit');
  });

  it('covers exactly the adult teeth in the diagram and PDF grids', () => {
    expect(TOOTH_DIAGRAMS.rabbit).toBeDefined();
    expect(sorted(TOOTH_DIAGRAMS.rabbit.teeth.map(t => t.triadan))).toEqual(expected);
    const { maxilla, mandible } = TOOTH_GRID_LAYOUTS.rabbit;
    expect(maxilla.teeth).toHaveLength(16);
    expect(mandible.teeth).toHaveLength(12);
    expect(sorted([...maxilla.teeth, ...mandible.teeth].map(t => t.triadan))).toEqual(expected);
  });

  it('places patient right on viewer left and peg incisors behind the main incisors', () => {
    expect(TOOTH_DIAGRAMS.rabbit).toBeDefined();
    const { teeth, midlineY } = TOOTH_DIAGRAMS.rabbit;
    const at = (id: number) => teeth.find(t => t.triadan === id)!;
    expect(at(106).cx).toBeLessThan(at(206).cx);
    expect(at(407).cx).toBeLessThan(at(307).cx);
    expect(at(111).cy).toBeLessThan(midlineY);
    expect(at(411).cy).toBeGreaterThan(midlineY);
    expect(at(102).cy).toBeGreaterThan(at(101).cy);
    expect(at(102).rx * at(102).ry).toBeLessThan(at(101).rx * at(101).ry);
  });

  it('labels the palatal pegs beside the teeth, separately from the main incisor labels', () => {
    const labels = TOOTH_DIAGRAMS.rabbit.numberLabelPositions!;
    expect(labels).toBeDefined();
    expect(labels[102]!.y).toBeGreaterThan(labels[101]!.y);
    expect(labels[202]!.y).toBeGreaterThan(labels[201]!.y);
    expect(labels[102]!.x).toBeLessThan(labels[101]!.x);
    expect(labels[202]!.x).toBeGreaterThan(labels[201]!.x);
  });

  it('has a separate bounded closed selection outline for every tooth', () => {
    expect(TOOTH_DIAGRAMS.rabbit).toBeDefined();
    const { width, height, teeth } = TOOTH_DIAGRAMS.rabbit;
    for (const tooth of teeth) {
      expect(tooth.hitShape?.d, String(tooth.triadan)).toMatch(/^M .* Z$/);
      const b = tooth.hitShape!.bbox;
      expect(b.minX).toBeGreaterThanOrEqual(0);
      expect(b.maxX).toBeLessThanOrEqual(width);
      expect(b.minY).toBeGreaterThanOrEqual(0);
      expect(b.maxY).toBeLessThanOrEqual(height);
    }
  });

  it('does not offer dog/cat divided-root pocket fields for rootless rabbit teeth', () => {
    for (const id of expected) expect(rootLabels('rabbit', id), String(id)).toEqual([]);
  });
});
