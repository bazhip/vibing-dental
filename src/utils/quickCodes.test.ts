import { describe, expect, it } from 'vitest';
import type { DiagramComment } from '../types';
import { canonicalQuickCode, hasCode, normalizeQuickCodes, stampQuickCode, MAX_QUICK_CODES } from './quickCodes';

const id = () => 'new';

describe('canonicalQuickCode', () => {
  it('spells catalog codes as the catalog does', () => {
    expect(canonicalQuickCode(' t/sn ')).toBe('T/SN');
    expect(canonicalQuickCode('dt/p')).toBe('DT/P');
  });
  it('keeps a practice code as typed, without spaces', () => {
    expect(canonicalQuickCode('My Code')).toBe('MyCode');
  });
});

describe('normalizeQuickCodes', () => {
  it('drops non-strings, blanks and repeats and caps the list', () => {
    expect(normalizeQuickCodes(['T/SN', 't/sn', 3, '', ' ', 'T/SR'])).toEqual(['T/SN', 'T/SR']);
    const many = Array.from({ length: 20 }, (_, i) => `C${i}`);
    expect(normalizeQuickCodes(many)).toHaveLength(MAX_QUICK_CODES);
  });
});

describe('hasCode', () => {
  it('matches whole tokens only', () => {
    expect(hasCode('T/SN', 'T/SN')).toBe(true);
    expect(hasCode('FX, T/SN', 'T/SN')).toBe(true);
    expect(hasCode('T/SNX', 'T/SN')).toBe(false);
    expect(hasCode('DT/SN', 'T/SN')).toBe(false);
  });
});

describe('stampQuickCode', () => {
  it('adds a comment holding the code when the tooth has none', () => {
    expect(stampQuickCode([], 104, 'T/SN', id)).toEqual([{ id: 'new', text: 'T/SN', anchorTriadan: 104 }]);
  });

  it('appends to the tooth comment and drops its fitted size', () => {
    const c: DiagramComment = { id: 'a', text: 'FX', anchorTriadan: 104, width: 90, height: 50, x: 1, y: 2 };
    expect(stampQuickCode([c], 104, 'T/SN', id)).toEqual([{ id: 'a', text: 'FX T/SN', anchorTriadan: 104, x: 1, y: 2 }]);
  });

  it('takes the code back out on a second tap, keeping the other text', () => {
    const c: DiagramComment = { id: 'a', text: 'FX T/SN', anchorTriadan: 104 };
    expect(stampQuickCode([c], 104, 'T/SN', id)).toEqual([{ id: 'a', text: 'FX', anchorTriadan: 104 }]);
  });

  it('removes a comment the code was all of', () => {
    const c: DiagramComment = { id: 'a', text: 'T/SN', anchorTriadan: 104 };
    expect(stampQuickCode([c], 104, 'T/SN', id)).toEqual([]);
  });

  it('leaves mirrored grid cards alone', () => {
    const grid: DiagramComment = { id: 'grid-104', text: 'Mobility M1', anchorTriadan: 104 };
    expect(stampQuickCode([grid], 104, 'T/SN', id)).toEqual([grid, { id: 'new', text: 'T/SN', anchorTriadan: 104 }]);
  });

  it('only touches the tapped tooth', () => {
    const other: DiagramComment = { id: 'b', text: 'T/SN', anchorTriadan: 204 };
    expect(stampQuickCode([other], 104, 'T/SN', id)).toEqual([other, { id: 'new', text: 'T/SN', anchorTriadan: 104 }]);
  });
});
