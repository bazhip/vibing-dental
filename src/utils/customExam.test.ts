import { describe, expect, it } from 'vitest';
import { answeredCustomExam, customExamRows, normalizeCustomExam, normalizeExamAreaDefs, setCustomExamValue, MAX_CUSTOM_EXAM_AREAS } from './customExam';
import type { CustomExamValue } from '../types';

describe('normalizeExamAreaDefs', () => {
  it('keeps unique ids, trims, caps the list', () => {
    expect(normalizeExamAreaDefs([{ id: 'a', label: ' Lips ' }, { id: 'a', label: 'dup' }, { label: 'no id' }, 'x'])).toEqual([{ id: 'a', label: 'Lips' }]);
    expect(normalizeExamAreaDefs(Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, label: 'L' })))).toHaveLength(MAX_CUSTOM_EXAM_AREAS);
    expect(normalizeExamAreaDefs('nope')).toEqual([]);
  });
});

describe('normalizeCustomExam', () => {
  it('keeps answered, labelled entries only', () => {
    expect(normalizeCustomExam([
      { id: 'a', label: 'Lips', status: 'normal', comment: '' },
      { id: 'b', label: 'Ducts', status: '', comment: '' },
      { id: 'c', label: '', status: 'normal', comment: '' },
      { id: 'd', label: 'Floor', status: 'bogus', comment: 'swollen' },
    ])).toEqual([
      { id: 'a', label: 'Lips', status: 'normal', comment: '' },
      { id: 'd', label: 'Floor', status: '', comment: 'swollen' },
    ]);
  });
});

describe('customExamRows', () => {
  it('lists named definitions with their answers, then answers whose definition was removed', () => {
    const values: CustomExamValue[] = [
      { id: 'a', label: 'Old lips name', status: 'abnormal', comment: 'Ulcer' },
      { id: 'gone', label: 'Removed area', status: 'normal', comment: '' },
    ];
    expect(customExamRows([{ id: 'a', label: 'Lips' }, { id: 'b', label: 'Ducts' }, { id: 'c', label: ' ' }], values)).toEqual([
      { id: 'a', label: 'Lips', status: 'abnormal', comment: 'Ulcer' },
      { id: 'b', label: 'Ducts', status: '', comment: '' },
      { id: 'gone', label: 'Removed area', status: 'normal', comment: '' },
    ]);
  });
});

describe('setCustomExamValue', () => {
  const row: CustomExamValue = { id: 'a', label: 'Lips', status: '', comment: '' };
  it('adds, updates and drops an emptied answer', () => {
    const one = setCustomExamValue([], row, { status: 'abnormal' });
    expect(one).toEqual([{ id: 'a', label: 'Lips', status: 'abnormal', comment: '' }]);
    const two = setCustomExamValue(one, row, { comment: 'Ulcer' });
    expect(two).toEqual([{ id: 'a', label: 'Lips', status: 'abnormal', comment: 'Ulcer' }]);
    expect(setCustomExamValue([{ id: 'a', label: 'Lips', status: 'normal', comment: '' }], row, { status: '' })).toEqual([]);
  });
  it('captures the current label', () => {
    expect(setCustomExamValue([{ id: 'a', label: 'Old', status: 'normal', comment: '' }], row, { status: 'abnormal' })[0].label).toBe('Lips');
  });
});

describe('answeredCustomExam', () => {
  it('drops unanswered and unlabelled entries', () => {
    expect(answeredCustomExam([
      { id: 'a', label: 'Lips', status: 'normal', comment: '' },
      { id: 'b', label: 'Ducts', status: '', comment: ' ' },
    ])).toHaveLength(1);
    expect(answeredCustomExam(undefined)).toEqual([]);
  });
});
