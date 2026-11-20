import { EXAM_ITEMS } from '../types';
import { DEFAULT_EXAM_LAYOUT, legacyExamLayout, parseExamLayout } from './examLayout';

test('the default Exam layout includes every original area and Diagnostics', () => {
  expect(DEFAULT_EXAM_LAYOUT).toEqual([
    ...EXAM_ITEMS.map(({ key: id }) => ({ id, kind: 'area' })),
    { id: 'gpDiagnostics', kind: 'text' },
  ]);
});

test('legacy area IDs and hidden preferences survive the first customization', () => {
  const layout = legacyExamLayout([{ id: 'x1', label: 'Lips' }, { id: 'x2', label: ' ' }], ['lymph']);
  expect(layout.map(field => field.id)).not.toContain('lymph');
  expect(layout.slice(-2)).toEqual([{ id: 'x1', kind: 'area', label: 'Lips' }, { id: 'gpDiagnostics', kind: 'text' }]);
  expect(parseExamLayout(layout)).toEqual(layout);
});

test('customized layouts preserve order, enforce field identities, and allow removal of every default', () => {
  const note = { id: 'exam-text-1', kind: 'text', label: 'Airway' };
  const layout = [note, { id: 'tongue', kind: 'area', label: '  Tongue and floor  ' }];
  expect(parseExamLayout(layout)).toEqual([note, { id: 'tongue', kind: 'area', label: 'Tongue and floor' }]);
  expect(parseExamLayout([])).toEqual([]);
  expect(parseExamLayout([note, note])).toBeUndefined();
  expect(parseExamLayout([{ ...note, label: '' }])).toBeUndefined();
  expect(parseExamLayout([{ id: 'gpDiagnostics', kind: 'area' }])).toBeUndefined();
  expect(parseExamLayout([{ id: 'tongue', kind: 'text' }])).toBeUndefined();
});

test('uses the same Unicode label limit as the practice database', () => {
  const label = '🦷'.repeat(60);
  const field = { id: 'exam-text-unicode', kind: 'text', label };
  expect(parseExamLayout([field])).toEqual([field]);
  expect(parseExamLayout([{ ...field, label: label + '🦷' }])).toBeUndefined();
});
