import { describe, expect, it } from 'vitest';
import { matchField } from './matchField';

describe('matchField', () => {
  it('exact beats synonym', () => expect(matchField('History', ['Subjective', 'History'])).toBe('History'));
  it('synonyms', () => {
    expect(matchField('Subjective', ['History', 'Plan'])).toBe('History');
    expect(matchField('Objective', ['Physical Exam'])).toBe('Physical Exam');
    expect(matchField('Exam', ['Physical Exam'])).toBe('Physical Exam');
  });
  it('plural', () => {
    expect(matchField('Plans', ['Plan'])).toBe('Plan');
    expect(matchField('Plan', ['Plans'])).toBe('Plans');
    expect(matchField('Allergies', ['Allergy'])).toBe('Allergy');
  });
  it('leaf of compound', () =>
    expect(matchField('In Person', ['Client Communication > In Person'])).toBe('Client Communication > In Person'));
  it('synonym on the leaf', () =>
    expect(matchField('Subjective', ['Visit > History'])).toBe('Visit > History'));
  it('parent only when unique', () => {
    expect(matchField('Client Communication', ['Client Communication > In Person'])).toBe('Client Communication > In Person');
    expect(matchField('Plan', ['Plan/Schedule > A', 'Plan/Schedule > B'])).toBeNull();
  });
  it('punctuation and case', () => expect(matchField('physical exam:', ['Physical Exam'])).toBe('Physical Exam'));
  it('nothing', () => expect(matchField('Radiology', ['Plan'])).toBeNull());
});
