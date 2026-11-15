import { describe, expect, it } from 'vitest';
import {
  CODES_BY_CODE, DENTAL_CODES, EQUINE_CODES, codeDefinition, codeGroupsFor, codesFor,
  codesMatchingPrefix, findCodesInText, searchCodes,
} from './dentalCodes';
import { collectUsedCodesByPage } from '../utils/pdf/sections';
import { EMPTY_EXAM_FINDINGS } from '../types';
import { canonicalQuickCode } from '../utils/quickCodes';

const codes = (list: { code: string }[]) => list.map((c) => c.code);

describe('equine codes', () => {
  it('are separate from the dog/cat catalog and unique', () => {
    const dogCat = new Set(codes(DENTAL_CODES));
    expect(codes(EQUINE_CODES).filter((c) => dogCat.has(c))).toEqual([]);
    expect(new Set(codes(EQUINE_CODES)).size).toBe(EQUINE_CODES.length);
  });

  it('only a horse chart offers them', () => {
    expect(codesFor('canine')).toBe(DENTAL_CODES);
    expect(codesFor('feline-deciduous')).toBe(DENTAL_CODES);
    expect(codes(codesFor('equine'))).toEqual(expect.arrayContaining(['CA/INF', 'D/V', 'XSS/RPL', 'PD2']));
    expect(codeGroupsFor('equine')[0].id).toBe('equine');
    expect(codeGroupsFor('canine').some((g) => g.id.startsWith('equine'))).toBe(false);
  });

  it('autocomplete and search follow the species', () => {
    expect(codes(codesMatchingPrefix('CA/', 8, 'equine'))).toContain('CA/INF');
    expect(codes(codesMatchingPrefix('CA/', 8, 'canine'))).toEqual([]);
    expect(codes(searchCodes('repulsion', 'en', 'equine'))).toEqual(expect.arrayContaining(['XSS/RPL', 'XSS/APX/RPL']));
    expect(searchCodes('repulsion', 'en', 'canine')).toEqual([]);
    expect(codes(searchCodes('diastème', 'fr', 'equine'))).toContain('D');
  });

  it('the PDF legend finds them on a horse chart only', () => {
    expect(codes(findCodesInText('CA/INF/M, D/V', 'equine'))).toEqual(['CA/INF/M', 'D/V']);
    expect(findCodesInText('CA/INF/M, D/V')).toEqual([]);
    // The one-letter D counts only standing alone, like X.
    expect(codes(findCodesInText('D', 'equine'))).toEqual(['D']);
    expect(findCodesInText('D6 pocket', 'equine')).toEqual([]);
    const base = {
      patientInfo: { complaint: '', treatmentReport: 'XSS/RPL 109', exam: EMPTY_EXAM_FINDINGS } as never,
      toothData: [], preCommentTexts: ['SHE'], postCommentTexts: [],
    };
    const horse = collectUsedCodesByPage({ ...base, species: 'equine' });
    expect(codes(horse.page1)).toEqual(['SHE']);
    expect(codes(horse.page2)).toEqual(['XSS/RPL']);
    const dog = collectUsedCodesByPage(base);
    expect(dog.page1).toEqual([]);
  });

  it('definitions and quick-code spelling work for them', () => {
    expect(CODES_BY_CODE['SIN/TRP'].kind).toBe('procedure');
    expect(codeDefinition('D/V', 'de')).toBe('Ventildiastema');
    expect(canonicalQuickCode('ca/inf')).toBe('CA/INF');
  });
});
