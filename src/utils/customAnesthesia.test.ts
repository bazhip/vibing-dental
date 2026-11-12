import {
  blocksForForm, fieldsForForm, setBlockValue, setFieldValue, filledBlocks, fieldLines,
  normalizeBlockDefs, normalizeFieldDefs, normalizeCustomAnesthesia,
} from './customAnesthesia';

const defsB = [{ id: 'b1', label: 'Major palatine' }];
const defsF = [
  { id: 'f1', label: 'Premedication', type: 'text' as const },
  { id: 'f2', label: 'ET tube', type: 'number' as const, unit: 'mm' },
  { id: 'f3', label: 'IV catheter', type: 'checkbox' as const },
  { id: 'f4', label: 'ASA status', type: 'select' as const, options: ['I', 'II', 'III'] },
];

describe('custom anesthesia', () => {
  it('a chart shows your fields, plus anything someone else charted', () => {
    const chart = {
      blocks: [{ id: 'other-person', label: 'Middle mental', right: '0.1', left: '' }],
      fields: [{ id: 'theirs', label: 'Fluids', type: 'text' as const, value: 'LRS 5 mL/kg/h' }],
    };
    expect(blocksForForm(defsB, chart).map((b) => b.label)).toEqual(['Major palatine', 'Middle mental']);
    expect(fieldsForForm(defsF, chart).map((f) => f.value.label)).toEqual(['Premedication', 'ET tube', 'IV catheter', 'ASA status', 'Fluids']);
  });

  it('values carry their label; empty ones are dropped from the chart', () => {
    let chart = setFieldValue(undefined, { id: 'f2', label: 'ET tube', type: 'number', unit: 'mm', value: '7' });
    chart = setBlockValue(chart, { id: 'b1', label: 'Major palatine', right: '0.2', left: '' });
    expect(chart.fields).toEqual([{ id: 'f2', label: 'ET tube', type: 'number', unit: 'mm', value: '7' }]);
    chart = setFieldValue(chart, { id: 'f2', label: 'ET tube', type: 'number', unit: 'mm', value: '' });
    expect(chart.fields).toEqual([]);
    expect(chart.blocks).toHaveLength(1);
  });

  it('PDF lines read on their own', () => {
    const chart = {
      blocks: [{ id: 'b1', label: 'Major palatine', right: '0.2', left: '' }, { id: 'b2', label: 'Empty', right: '', left: '' }],
      fields: [
        { id: 'f2', label: 'ET tube', type: 'number' as const, unit: 'mm', value: '7' },
        { id: 'f3', label: 'IV catheter', type: 'checkbox' as const, value: 'yes' },
        { id: 'f4', label: 'ASA status', type: 'select' as const, value: 'II' },
      ],
    };
    expect(filledBlocks(chart).map((b) => b.label)).toEqual(['Major palatine']);
    expect(fieldLines(chart)).toEqual(['ET tube: 7 mm', 'IV catheter: Yes', 'ASA status: II']);
  });

  it('settings and chart data are read tolerantly', () => {
    expect(normalizeBlockDefs([{ id: 'a', label: 'X' }, { id: 'a', label: 'dup' }, { label: 'no id' }, 'junk'])).toEqual([{ id: 'a', label: 'X' }]);
    expect(normalizeFieldDefs([{ id: 'n', label: 'Dose', type: 'number', unit: 'mg/kg' }, { id: 's', label: 'Pick', type: 'select', options: ['a', '', 'b'] }, { id: 'w', label: 'W', type: 'weird' }]))
      .toEqual([{ id: 'n', label: 'Dose', type: 'number', unit: 'mg/kg' }, { id: 's', label: 'Pick', type: 'select', options: ['a', 'b'] }, { id: 'w', label: 'W', type: 'text' }]);
    expect(normalizeCustomAnesthesia(null)).toEqual({ blocks: [], fields: [] });
    expect(normalizeCustomAnesthesia({ blocks: [{ id: 'b', label: 'L', right: '1' }], fields: [{ id: 'f', type: 'checkbox', value: 'yes' }] }))
      .toEqual({ blocks: [{ id: 'b', label: 'L', right: '1', left: '' }], fields: [{ id: 'f', label: '', type: 'checkbox', value: 'yes' }] });
  });
});
