import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('./PdfPreviewModal', () => ({ PdfPreviewModal: () => <div>chart-preview</div> }));
vi.mock('./OwnerReportModal', () => ({ OwnerReportModal: () => <div>owner-preview</div> }));

import { DocumentsModal } from './DocumentsModal';

const chartSnapshot = { patientInfo: { patientName: 'Biscuit', date: '2026-11-11' } } as never;
const ownerReport = {
  snapshot: { patientInfo: { patientName: 'Biscuit', date: '2026-11-11' } } as never,
  branding: { practiceName: '', doctorName: '', logoUrl: '' },
  imageRoles: {}, chartId: '', practiceId: '', cloudActive: false, onEditWording: vi.fn(),
};

beforeEach(() => { try { window.sessionStorage.clear(); } catch { /* ignore */ } });

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
