import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));

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

beforeEach(() => { flags.native = false; });

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

describe('ChartHistoryModal chrome', () => {
  it('website: the centred modal with a × close, as before; no iOS sheet', () => {
    const onClose = vi.fn();
    render(<ChartHistoryModal chartId="c1" onClose={onClose} label="Bella · Nov 12, 2026" />);
    expect(document.querySelector('.ai-settings-overlay .ai-settings-modal.chart-history')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'History — Bella · Nov 12, 2026' })).toBeInTheDocument();
    expect(document.querySelector('.ios-sheet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('app: a sheet with a grabber and close control; Escape closes once', async () => {
    flags.native = true;
    const onClose = vi.fn();
    render(<ChartHistoryModal chartId="c1" onClose={onClose} label="Bella · Nov 12, 2026" />);
    const sheet = screen.getByRole('dialog', { name: 'Chart history' });
    expect(sheet).toHaveClass('ios-sheet');
    expect(document.querySelector('.ios-sheet__grabber')).not.toBeNull();
    expect(document.querySelector('.ai-settings-overlay')).toBeNull();
    expect(screen.getByText('Bella · Nov 12, 2026')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('app: picking a version shows it with Restore', async () => {
    flags.native = true;
    render(<ChartHistoryModal chartId="c1" onClose={() => {}} onRestore={vi.fn(async () => true)} />);
    fireEvent.click(screen.getAllByText('Tim')[0].closest('button')!);
    expect(await screen.findByText('Old complaint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore this version' })).toBeInTheDocument();
  });
});
