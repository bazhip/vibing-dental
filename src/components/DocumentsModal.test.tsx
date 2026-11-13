import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const flags = vi.hoisted(() => ({ native: false }));
vi.mock('../native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));

vi.mock('./PdfPreviewModal', () => ({ PdfPreviewModal: () => <div>chart-preview</div> }));
vi.mock('./OwnerReportModal', () => ({ OwnerReportModal: () => <div>owner-preview</div> }));

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

describe('DocumentsModal — website chrome (unchanged)', () => {
  it('is the centred overlay with a header, × close and underline tabs; no iOS sheet', () => {
    const onClose = vi.fn();
    render(<DocumentsModal open onClose={onClose} chartSnapshot={chartSnapshot} ownerReport={ownerReport} />);
    expect(document.querySelector('.pdf-preview-overlay .pdf-preview-modal.documents-modal')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Download PDFs\s*· Biscuit · 2026-11-11/ })).toBeInTheDocument();
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
