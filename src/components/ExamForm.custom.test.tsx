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

const outerSubmit = vi.fn();
function AddHarness({ areas = [] }: { areas?: { id: string; label: string }[] }) {
  const [defs, setDefs] = React.useState(areas);
  return <form onSubmit={(e) => { e.preventDefault(); outerSubmit(); }}>
    <ExamForm exam={EMPTY_EXAM_FINDINGS} onStatusChange={() => {}} onCommentChange={() => {}}
      customRows={customExamRows(defs)} customAreas={defs} hiddenAreas={['tongue', ...areas.map((a) => a.id)]}
      onCustomChange={() => {}}
      onAddArea={(label) => setDefs([...defs, { id: 'added', label }])} />
    <output data-testid="definitions">{JSON.stringify(defs)}</output>
  </form>;
}

test('inline area addition trims the name and Enter adds without submitting the chart', () => {
  render(<AddHarness />);
  fireEvent.click(screen.getByRole('button', { name: /Add area/ }));
  const input = screen.getByRole('textbox', { name: 'Exam area 1 name' });
  expect(input).toHaveAttribute('maxlength', '60');
  fireEvent.change(input, { target: { value: '  Lips  ' } });
  expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);
  expect(outerSubmit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Lips: normal')).not.toBeChecked();
  expect(JSON.parse(screen.getByTestId('definitions').textContent!)).toEqual([{ id: 'added', label: 'Lips' }]);
  expect(screen.queryByRole('textbox')).toBeNull();
});

test('inline editor rejects blanks and hidden built-in or custom duplicates and can cancel', () => {
  render(<AddHarness areas={[{ id: 'hidden', label: 'Lips' }]} />);
  fireEvent.click(screen.getByRole('button', { name: /Add area/ }));
  const input = screen.getByRole('textbox');
  for (const value of ['   ', ' tongue ', ' LIPS ']) {
    fireEvent.change(input, { target: { value } });
    expect(screen.getByRole('button', { name: /Add area/ })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
  }
  expect(screen.getByRole('alert')).toHaveTextContent('This area is already in your exam.');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(JSON.parse(screen.getByTestId('definitions').textContent!)).toHaveLength(1);
});

test('inline editor enforces the personal area cap', () => {
  render(<AddHarness areas={Array.from({ length: 8 }, (_, i) => ({ id: String(i), label: `Area ${i}` }))} />);
  expect(screen.queryByRole('button', { name: /Add area/ })).toBeNull();
  expect(screen.getByText('Limit reached. Remove an item to add another.')).toBeInTheDocument();
});

test('adding an area is a preference, so it works on a locked chart too', () => {
  render(<div className="lock-wrap--locked"><AddHarness /></div>);
  fireEvent.click(screen.getByRole('button', { name: /Add area/ }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lips' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(JSON.parse(screen.getByTestId('definitions').textContent!)).toEqual([expect.objectContaining({ label: 'Lips' })]);
  expect(screen.getByRole('button', { name: /Add area/ }).closest('[data-lock-exempt]')).not.toBeNull();
});
