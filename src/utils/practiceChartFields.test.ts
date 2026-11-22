import { describe, expect, it } from 'vitest';
import { EMPTY_PRACTICE_CHART_FIELDS, parsePracticeChartFieldConfig } from './practiceChartFields';

const field = { id: '11111111-1111-4111-8111-111111111111', label: 'Diet' };
const secondField = { id: '22222222-2222-4222-8222-222222222222', label: 'Activity' };
const choice = { ...field, inputType: 'dropdown', options: ['Dry', 'Wet'] };

function fieldList(count: number, guidance?: string) {
  return Array.from({ length: count }, (_, index) => ({
    ...field, id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`, guidance,
  }));
}

describe('parsePracticeChartFieldConfig', () => {
  it('accepts an empty library and page layout', () => {
    expect(parsePracticeChartFieldConfig({ fields: [], pages: {} })).toEqual(EMPTY_PRACTICE_CHART_FIELDS);
  });

  it('retains per-page snapshots independently of the reusable field definitions', () => {
    expect(parsePracticeChartFieldConfig({
      fields: [choice],
      pages: {
        exam: [{ ...field, label: '  Previous diet  ', guidance: 'Ask the owner.' }, secondField],
        patient: [{ ...choice, inputType: 'multiselectDropdown' }],
      },
    })).toEqual({
      fields: [choice],
      pages: {
        exam: [{ ...field, label: 'Previous diet', guidance: 'Ask the owner.' }, secondField],
        patient: [{ ...choice, inputType: 'multiselectDropdown' }],
      },
    });
  });

  it.each([
    { fields: [field, field], pages: {} },
    { fields: [], pages: { patient: [field, field] } },
    { fields: [], pages: { unknown: [field] } },
    { fields: [], pages: { exam: null } },
    { fields: [], pages: {}, unknown: 'value' },
    { fields: [{ ...field, id: 'diet' }], pages: {} },
    { fields: [{ ...field, label: '\u00a0\ufeff' }], pages: {} },
    { fields: [{ ...field, label: 'Diet\0' }], pages: {} },
    { fields: [{ ...field, label: 'Diet\uD800' }], pages: {} },
    { fields: [{ ...field, guidance: 'a'.repeat(1001) }], pages: {} },
    { fields: [{ ...field, value: 'patient data' }], pages: {} },
    { fields: [{ ...choice, options: undefined }], pages: {} },
    { fields: [{ ...choice, options: Array(1) }], pages: {} },
    { fields: [{ ...choice, options: ['Dry', 'Dry'] }], pages: {} },
    { fields: [{ ...choice, options: [' Dry'] }], pages: {} },
    { fields: [{ ...choice, options: ['Dry\nWet'] }], pages: {} },
    { fields: [{ ...choice, inputType: 'shortText' }], pages: {} },
    { fields: [{ ...field, inputType: 'number' }], pages: {} },
  ])('rejects malformed config %#', (config) => {
    expect(parsePracticeChartFieldConfig(config)).toBeUndefined();
  });

  it('bounds the library, each page, and the aggregate stored byte length', () => {
    expect(parsePracticeChartFieldConfig({ fields: fieldList(128), pages: { images: fieldList(24) } })).toBeDefined();
    expect(parsePracticeChartFieldConfig({ fields: fieldList(129), pages: {} })).toBeUndefined();
    expect(parsePracticeChartFieldConfig({ fields: [], pages: { anesthesia: fieldList(25) } })).toBeUndefined();
    expect(parsePracticeChartFieldConfig({ fields: fieldList(100, '🐾'.repeat(500)), pages: {} })).toBeUndefined();
  });
});
