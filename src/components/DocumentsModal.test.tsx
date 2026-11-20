import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));

vi.mock('./PdfPreviewModal', () => ({ PdfPreviewModal: ({ open }: { open: boolean }) => <div data-open={String(open)}>chart-preview</div> }));
vi.mock('./OwnerReportModal', () => ({ OwnerReportModal: () => <div>owner-preview</div> }));
vi.mock('./RecordNotePanel', () => ({ RecordNotePanel: () => <div>note-panel</div> }));

import { DocumentsModal } from './DocumentsModal';

const chartSnapshot = { patientInfo: { patientName: 'Biscuit', date: '2026-11-11' } } as never;
const ownerReport = {
  snapshot: { patientInfo: { patientName: 'Biscuit', date: '2026-11-11' } } as never,
  branding: { practiceName: '', doctorName: '', logoUrl: '' },
  imageRoles: {}, chartId: '', practiceId: '', cloudActive: false, onEditWording: vi.fn(),
};

beforeEach(() => { flags.native = false; try { window.sessionStorage.clear(); } catch { /* ignore */ } });

describe('DocumentsModal', () => {
  it('shows only the clinical chart when the owner report is off', () => {
    render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('chart-preview')).toBeInTheDocument();
  });

  it('tabs between the clinical chart and the owner report', () => {
    render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} ownerReport={ownerReport} />);
    expect(screen.getByRole('tab', { name: 'Clinical chart' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Owner report' }));
    expect(screen.getByRole('tab', { name: 'Owner report' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('owner-preview')).toBeInTheDocument();
    expect(screen.getByText(/take home/)).toBeInTheDocument();
  });

  it('opens on the requested tab', () => {
    render(<DocumentsModal open onClose={vi.fn()} initialTab="owner" chartSnapshot={chartSnapshot} ownerReport={ownerReport} />);
    expect(screen.getByRole('tab', { name: 'Owner report' })).toHaveAttribute('aria-selected', 'true');
  });
});

const recordNote = {
  snapshot: { patientInfo: { patientName: 'Biscuit', date: '2026-11-11' } } as never,
  stored: null, onChange: vi.fn(), readOnly: false,
};

describe('DocumentsModal — record note tab', () => {
  it('opens a standalone note when the last selection was a dental PDF', () => {
    window.sessionStorage.setItem('documents.tab', 'chart');
    render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={null} recordNote={recordNote} />);
    expect(screen.getByRole('heading', { name: /Review and export.*Biscuit/ })).toBeInTheDocument();
    expect(screen.getByText('note-panel')).toBeVisible();
    expect(screen.queryByText('chart-preview')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('opens a standalone note in the native documents sheet', () => {
    flags.native = true;
    render(<DocumentsModal open onClose={vi.fn()} initialTab="chart" chartSnapshot={null} recordNote={recordNote} />);
    expect(screen.getByRole('dialog', { name: 'Documents' })).toHaveTextContent('Biscuit');
    expect(screen.getByText('note-panel')).toBeVisible();
    expect(screen.queryByText('chart-preview')).not.toBeInTheDocument();
  });

  it('has a record note tab even without the owner report', () => {
    render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} recordNote={recordNote} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    fireEvent.click(screen.getByRole('tab', { name: 'Record note' }));
    expect(screen.getByRole('tab', { name: 'Record note' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('note-panel')).toBeInTheDocument();
  });

  it('shows three tabs with the owner report', () => {
    render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} ownerReport={ownerReport} recordNote={recordNote} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Clinical chart', 'Owner report', 'Record note']);
  });

  it('remembers the record note tab', () => {
    const { unmount } = render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} recordNote={recordNote} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Record note' }));
    unmount();
    render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} recordNote={recordNote} />);
    expect(screen.getByRole('tab', { name: 'Record note' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('DocumentsModal — website chrome (unchanged)', () => {
  it('is the centred overlay with a header, × close and underline tabs; no iOS sheet', () => {
    const onClose = vi.fn();
    render(<DocumentsModal open onClose={onClose} chartSnapshot={chartSnapshot} ownerReport={ownerReport} />);
    expect(document.querySelector('.pdf-preview-overlay .pdf-preview-modal.documents-modal')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Review and export\s*· Biscuit · 2026-11-11/ })).toBeInTheDocument();
    expect(document.querySelector('.documents-modal__tabs')).not.toBeNull();
    expect(document.querySelector('.ios-sheet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close documents' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DocumentsModal — iOS app', () => {
  beforeEach(() => { flags.native = true; });

  it('is a sheet with a grabber and a close control, and a segmented control for the two documents', async () => {
    const onClose = vi.fn();
    render(<DocumentsModal open onClose={onClose} chartSnapshot={chartSnapshot} ownerReport={ownerReport} />);
    const sheet = screen.getByRole('dialog', { name: 'Documents' });
    expect(sheet).toHaveClass('ios-sheet');
    expect(document.querySelector('.ios-sheet__grabber')).not.toBeNull();
    expect(document.querySelector('.pdf-preview-overlay')).toBeNull();
    expect(document.querySelector('.ios-segmented')).not.toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Owner report' }));
    expect(screen.getByText('owner-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Escape closes once (the sheet handles it)', async () => {
    const onClose = vi.fn();
    render(<DocumentsModal open onClose={onClose} chartSnapshot={chartSnapshot} />);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

describe('DocumentsModal — web keyboard access', () => {
  it('contains Tab navigation and restores the opener on close', () => {
    const visible = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender } = render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} ownerReport={ownerReport} />);
    const close = screen.getByRole('button', { name: 'Close documents' });
    const chart = screen.getByRole('tab', { name: 'Clinical chart' });
    expect(close).toHaveFocus();
    chart.focus();
    fireEvent.keyDown(chart, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(chart).toHaveFocus();
    rerender(<DocumentsModal open={false} onClose={vi.fn()} chartSnapshot={chartSnapshot} ownerReport={ownerReport} />);
    expect(opener).toHaveFocus();
    opener.remove();
    visible.mockRestore();
  });

  it('uses one tab stop with Arrow, Home, and End selection', () => {
    render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} ownerReport={ownerReport} recordNote={recordNote} />);
    const chart = screen.getByRole('tab', { name: 'Clinical chart' });
    const owner = screen.getByRole('tab', { name: 'Owner report' });
    const note = screen.getByRole('tab', { name: 'Record note' });
    expect(chart).toHaveAttribute('tabindex', '0');
    expect(owner).toHaveAttribute('tabindex', '-1');
    chart.focus();
    fireEvent.keyDown(chart, { key: 'ArrowRight' });
    expect(owner).toHaveFocus();
    expect(owner).toHaveAttribute('aria-selected', 'true');
    expect(chart).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(owner, { key: 'End' });
    expect(note).toHaveFocus();
    fireEvent.keyDown(note, { key: 'ArrowRight' });
    expect(chart).toHaveFocus();
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    expect(note).toHaveFocus();
    fireEvent.keyDown(note, { key: 'Home' });
    expect(chart).toHaveFocus();
  });
});


it('tells the mounted native chart preview when Documents closes', () => {
  flags.native = true;
  const view = render(<DocumentsModal open onClose={vi.fn()} chartSnapshot={chartSnapshot} />);
  expect(screen.getByText('chart-preview')).toHaveAttribute('data-open', 'true');
  view.rerender(<DocumentsModal open={false} onClose={vi.fn()} chartSnapshot={chartSnapshot} />);
  expect(screen.getByText('chart-preview')).toHaveAttribute('data-open', 'false');
});
