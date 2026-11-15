import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, ChartSnapshot, StoredRecordNote } from '../types';

const mocks = vi.hoisted(() => ({
  copy: vi.fn(async () => 'rich' as const),
}));
vi.mock('../utils/clipboard', () => ({ copyRichText: mocks.copy }));

import { RecordNotePanel } from './RecordNotePanel';

const snapshot: ChartSnapshot = {
  patientInfo: {
    patientName: 'Rex', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '',
    doctor: '', tech: '', date: '', complaint: '', treatmentReport: 'Done', recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  toothData: [], species: 'canine', logo: 'socal',
  preMarks: {}, preComments: [], preStrokes: [],
  postMarks: {}, postComments: [], postStrokes: [],
};

function setup(over: Partial<React.ComponentProps<typeof RecordNotePanel>> = {}) {
  const onChange = vi.fn();
  render(<RecordNotePanel snapshot={snapshot} stored={null} onChange={onChange} readOnly={false} {...over} />);
  return { onChange };
}

const textarea = () => screen.getByRole('textbox') as HTMLTextAreaElement;

describe('RecordNotePanel', () => {
  beforeEach(() => { mocks.copy.mockClear(); });

  it('shows the note generated from the chart', () => {
    setup();
    expect(textarea().value).toContain('DENTAL PROCEDURE');
    expect(textarea().value).toContain('Done');
  });

  it('editing stores an edited note', () => {
    const { onChange } = setup();
    fireEvent.change(textarea(), { target: { value: 'My note' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'My note', source: 'edited', lng: 'en' }));
  });

  it('shows a stored note, flags it stale and rebuilds from the chart', () => {
    const stored: StoredRecordNote = { text: 'Old note', source: 'edited', lng: 'en', basedOn: 'old' };
    const { onChange } = setup({ stored });
    expect(textarea().value).toBe('Old note');
    expect(screen.getByText(/chart changed since/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /rebuild from chart/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('copies html and plain text', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalled());
    const [html, text] = mocks.copy.mock.calls[0] as unknown as [string, string];
    expect(html).toContain('<strong>Dental procedure</strong>');
    expect(text).toContain('DENTAL PROCEDURE');
  });

  it('locked chart: copy only', async () => {
    const stored: StoredRecordNote = { text: 'Old', source: 'edited', lng: 'en', basedOn: 'old' };
    setup({ readOnly: true, stored });
    expect(textarea().readOnly).toBe(true);
    expect(screen.getByRole('button', { name: /rebuild from chart/i })).toBeDisabled();
    expect(screen.getByText(/unlock the chart/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalled());
  });


  it('editing a stale note keeps it stale', () => {
    const stored: StoredRecordNote = { text: 'Old note', source: 'edited', lng: 'en', basedOn: 'old' };
    const { onChange } = setup({ stored });
    fireEvent.change(textarea(), { target: { value: 'Old note, typo fixed' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ source: 'edited', basedOn: 'old' }));
  });



  it('has no AI polish (the note only restates the chart)', () => {
    // Even a host that still passes the old AI flag gets no Polish button.
    setup({ aiEnabled: true } as never);
    expect(screen.queryByRole('button', { name: /polish/i })).toBeNull();
  });
});
