import { rootLabels, parseRootPockets, formatRootPockets, rootBoxes, pocketDepths, deepestPocket } from './pocket';

describe('rootLabels', () => {
  it('canine: single-rooted front teeth, two-rooted premolars, three-rooted upper P4 and molars', () => {
    expect(rootLabels('canine', 101)).toEqual([]);
    expect(rootLabels('canine', 104)).toEqual([]);
    expect(rootLabels('canine', 105)).toEqual([]);
    expect(rootLabels('canine', 106)).toEqual(['M', 'D']);
    expect(rootLabels('canine', 108)).toEqual(['MB', 'MP', 'D']);
    expect(rootLabels('canine', 209)).toEqual(['MB', 'DB', 'P']);
    expect(rootLabels('canine', 308)).toEqual(['M', 'D']);
    expect(rootLabels('canine', 409)).toEqual(['M', 'D']);
    expect(rootLabels('canine', 311)).toEqual([]);
  });

  it('feline: upper P2 single, P3 two, P4 three; lower P3–M1 two', () => {
    expect(rootLabels('feline', 106)).toEqual([]);
    expect(rootLabels('feline', 107)).toEqual(['M', 'D']);
    expect(rootLabels('feline', 208)).toEqual(['MB', 'MP', 'D']);
    expect(rootLabels('feline', 309)).toEqual(['M', 'D']);
  });

  it('deciduous quadrants use the same positions', () => {
    expect(rootLabels('canine-deciduous', 508)).toEqual(['MB', 'MP', 'D']);
    expect(rootLabels('canine-deciduous', 707)).toEqual(['M', 'D']);
  });
});

describe('per-root pocket values', () => {
  it('parses labelled values and leaves plain ones alone', () => {
    expect(parseRootPockets('M4 D6')).toEqual({ M: '4', D: '6' });
    expect(parseRootPockets('mb4 mp5 d6')).toEqual({ MB: '4', MP: '5', D: '6' });
    expect(parseRootPockets('5')).toBeNull();
    expect(parseRootPockets('4 5 4')).toBeNull();
    expect(parseRootPockets('')).toBeNull();
  });

  it('formats in root order and drops blanks', () => {
    expect(formatRootPockets(['MB', 'MP', 'D'], { D: '6', MB: '4' })).toBe('MB4 D6');
    expect(formatRootPockets(['M', 'D'], {})).toBe('');
  });

  it('places stored values in root boxes without losing anything', () => {
    expect(rootBoxes(['M', 'D'], 'M4 D6')).toEqual({ depths: { M: '4', D: '6' }, unplaced: '' });
    expect(rootBoxes(['M', 'D'], '4 6')).toEqual({ depths: { M: '4', D: '6' }, unplaced: '' }); // one per root: split
    expect(rootBoxes(['M', 'D'], '5')).toEqual({ depths: {}, unplaced: '5' }); // can't guess which root
    expect(rootBoxes(['MB', 'MP', 'D'], '4 5')).toEqual({ depths: {}, unplaced: '4 5' });
  });

  it('depths for checks and summaries', () => {
    expect(pocketDepths('M4 D6')).toEqual([4, 6]);
    expect(pocketDepths('4 5 4')).toEqual([4, 5, 4]);
    expect(deepestPocket('MB4 MP7 D6')).toBe(7);
    expect(deepestPocket('')).toBeNull();
  });
});

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { fitCellText } from './pdf/sections';
import { invalidReason } from './aiAutofill';
import { findCodesInText } from '../constants/dentalCodes';

describe('per-root pockets elsewhere', () => {
  it('PDF: shrinks, then falls back to depths in root order', async () => {
    const font = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
    expect(fitCellText('5', 20, font, 6.5)).toEqual({ text: '5', size: 6.5 });
    const tight = fitCellText('MB4 MP5 D6', 14, font, 6.5);
    expect(tight.text).toBe('4/5/6');
    expect(tight.size).toBeGreaterThanOrEqual(4.5);
  });

  it('dictation accepts per-root values and still range-checks each depth', () => {
    expect(invalidReason({ name: 'set_tooth_field', input: { triadan: 108, field: 'pocket', value: 'MB4 MP5 D6' } })).toBeNull();
    expect(invalidReason({ name: 'set_tooth_field', input: { triadan: 108, field: 'pocket', value: 'M4 D22' } })).toMatch(/outside/);
  });

  it('per-root tokens are not read as dental codes', () => {
    expect(findCodesInText('M4 D6').map((c) => c.code)).toEqual([]);
  });
});
