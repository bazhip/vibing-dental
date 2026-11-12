import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';

const snapshot = {
  patientInfo: {
    patientName: 'Bella', patientNumber: '1', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
    date: '2026-11-10', complaint: 'Old complaint', treatmentReport: '', recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  toothData: [], species: 'canine', logo: 'socal',
  preMarks: {}, preComments: [], preStrokes: [], postMarks: {}, postComments: [], postStrokes: [],
};
const revisions = [
  { id: 3, savedBy: 'u2', savedByName: 'Dr Kaser', startedAt: '2026-11-12T15:02:00Z', savedAt: '2026-11-12T15:40:00Z', note: '' },
  { id: 2, savedBy: 'u1', savedByName: 'Tim', startedAt: '2026-11-11T10:00:00Z', savedAt: '2026-11-11T10:00:20Z', note: '' },
  { id: 1, savedBy: 'u1', savedByName: 'Tim', startedAt: '2026-11-10T09:00:00Z', savedAt: '2026-11-10T09:00:00Z', note: 'baseline' },
];
const loadData = vi.fn(async () => snapshot);
vi.mock('../hooks/useChartHistory', () => ({ useChartHistory: () => ({ revisions, error: '', loadData, reload: vi.fn() }) }));
const confirmDialog = vi.fn(async (..._a: unknown[]) => true);
vi.mock('./ui/dialogs', () => ({ confirmDialog: (...a: unknown[]) => confirmDialog(...a), toast: vi.fn() }));

import { ChartHistoryModal, revisionWhen } from './ChartHistoryModal';

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});

describe('ChartHistoryModal', () => {
  it('lists who saved each version and when, newest first', () => {
    render(<ChartHistoryModal chartId="c1" onClose={() => {}} />);
    const rows = screen.getAllByRole('button', { pressed: false }).filter((b) => b.className.includes('chart-history__row'));
    expect(rows.map((r) => r.querySelector('.chart-history__who')?.textContent)).toEqual(['Dr KaserCurrent', 'Tim', 'Tim']);
    expect(screen.getByText(/Before history began/)).toBeInTheDocument();
  });

  it('shows an earlier version read-only and restores it after confirming', async () => {
    const onRestore = vi.fn(async () => true);
    render(<ChartHistoryModal chartId="c1" onClose={() => {}} onRestore={onRestore} />);
    fireEvent.click(screen.getAllByText('Tim')[0].closest('button')!);
    expect(await screen.findByText('Old complaint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalled());
    expect(confirmDialog).toHaveBeenCalled();
    expect((onRestore.mock.calls[0] as unknown[])[0]).toMatchObject({ patientInfo: { complaint: 'Old complaint' } });
  });

  it('no restore for the current version, or when the chart is view-only', async () => {
    const { unmount } = render(<ChartHistoryModal chartId="c1" onClose={() => {}} onRestore={vi.fn()} />);
    fireEvent.click(screen.getByText('Dr Kaser').closest('button')!);
    await screen.findByText('Old complaint');
    expect(screen.queryByRole('button', { name: 'Restore this version' })).not.toBeInTheDocument();
    unmount();
    render(<ChartHistoryModal chartId="c1" onClose={() => {}} />);
    fireEvent.click(screen.getAllByText('Tim')[0].closest('button')!);
    expect(await screen.findByText(/Choose Edit chart to restore/)).toBeInTheDocument();
  });

  it('formats merged editing sessions as a time range', () => {
    expect(revisionWhen({ startedAt: '2026-11-12T15:02:00Z', savedAt: '2026-11-12T15:02:30Z' })).not.toContain('–');
    expect(revisionWhen({ startedAt: '2026-11-12T15:02:00Z', savedAt: '2026-11-12T15:40:00Z' })).toContain('–');
  });
});
