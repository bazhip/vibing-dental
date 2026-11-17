import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExamForm } from './ExamForm';
import { EMPTY_EXAM_FINDINGS, ExamFindings, type CustomExamValue } from '../types';
import { customExamRows, setCustomExamValue } from '../utils/customExam';

function Harness() {
  const [exam, setExam] = React.useState<ExamFindings>(EMPTY_EXAM_FINDINGS);
  const [custom, setCustom] = React.useState<CustomExamValue[]>([]);
  const defs = [{ id: 'x1', label: 'Lips' }, { id: 'x2', label: 'Salivary duct openings' }];
  return (
    <>
      <ExamForm
        exam={exam}
        onStatusChange={(k, v) => setExam((e) => ({ ...e, [k]: { ...e[k], status: v } }))}
        onCommentChange={(k, v) => setExam((e) => ({ ...e, [k]: { ...e[k], comment: v } }))}
        customRows={customExamRows(defs, custom)}
        onCustomChange={(row, patch) => setCustom((prev) => setCustomExamValue(prev, row, patch))}
      />
      <output data-testid="custom">{JSON.stringify(custom)}</output>
    </>
  );
}
const custom = () => JSON.parse(screen.getByTestId('custom').textContent || '[]');

test('custom areas answer like the built-in ones and are saved with their label', () => {
  render(<Harness />);
  fireEvent.click(screen.getByLabelText('Salivary duct openings: abnormal'));
  fireEvent.change(screen.getByLabelText('Salivary duct openings: comment'), { target: { value: 'Ranula' } });
  expect(custom()).toEqual([{ id: 'x2', label: 'Salivary duct openings', status: 'abnormal', comment: 'Ranula' }]);
  // Tapping the chosen answer again clears it (and drops the unanswered area).
  fireEvent.click(screen.getByLabelText('Lips: normal'));
  fireEvent.click(screen.getByLabelText('Lips: normal'));
  expect(custom().map((c: CustomExamValue) => c.id)).toEqual(['x2']);
});

test('Mark all normal covers custom areas too', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Mark all normal' }));
  expect(custom()).toEqual([
    { id: 'x1', label: 'Lips', status: 'normal', comment: '' },
    { id: 'x2', label: 'Salivary duct openings', status: 'normal', comment: '' },
  ]);
  expect(screen.queryByRole('button', { name: /Mark/ })).toBeNull();
});

test('hidden empty rows stay out of bulk marking while saved findings remain visible', () => {
  const onStatusChange = vi.fn();
  const onCustomChange = vi.fn();
  const exam: ExamFindings = {
    ...EMPTY_EXAM_FINDINGS,
    tongue: { status: 'abnormal', comment: 'Ulcer' },
    palate: { status: '', comment: 'Observe at next visit' },
  };
  render(<ExamForm exam={exam} hiddenAreas={['extraoral', 'tongue', 'palate', 'empty', 'answered']}
    onStatusChange={onStatusChange} onCommentChange={vi.fn()} onCustomChange={onCustomChange}
    customRows={[
      { id: 'empty', label: 'Hidden blank', status: '', comment: '' },
      { id: 'answered', label: 'Saved custom', status: 'abnormal', comment: 'Swollen' },
    ]} />);
  expect(screen.queryByLabelText('Extraoral / facial: normal')).toBeNull();
  expect(screen.queryByText('Hidden blank')).toBeNull();
  expect(screen.getByLabelText('Tongue: comment')).toHaveValue('Ulcer');
  expect(screen.getByLabelText('Palate: normal')).toBeInTheDocument();
  expect(screen.getByLabelText('Saved custom: comment')).toHaveValue('Swollen');
  fireEvent.click(screen.getByRole('button', { name: 'Mark the rest normal' }));
  expect(onStatusChange.mock.calls.map(([key]) => key)).toEqual(['lymph', 'buccal', 'palate', 'pharynx']);
  expect(onCustomChange).not.toHaveBeenCalled();
});
