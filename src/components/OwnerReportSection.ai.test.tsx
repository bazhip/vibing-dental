import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const draftOwnerReport = vi.fn();
vi.mock('../utils/ownerReportAi', () => ({ draftOwnerReport: (...a: unknown[]) => draftOwnerReport(...a) }));
const toast = vi.fn();
const confirmDialog = vi.fn(async (..._a: unknown[]) => true);
vi.mock('./ui/dialogs', () => ({ toast: (...a: unknown[]) => toast(...a), confirmDialog: (...a: unknown[]) => confirmDialog(...a) }));

const aiConsent = vi.hoisted(() => ({ ensure: vi.fn(async () => true) }));
vi.mock('../native/aiConsent', () => ({ ensureAiConsent: aiConsent.ensure }));

import { OwnerReportSection } from './OwnerReportSection';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, ChartSnapshot } from '../types';

const snap: ChartSnapshot = {
  patientInfo: {
    patientName: 'Bella', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
    date: '2026-11-12', complaint: '', treatmentReport: '', recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  toothData: [], species: 'canine', logo: 'socal',
  preMarks: {}, preComments: [], preStrokes: [], postMarks: {}, postComments: [], postStrokes: [],
};

beforeEach(() => {
  draftOwnerReport.mockReset(); toast.mockReset(); confirmDialog.mockClear();
  aiConsent.ensure.mockReset(); aiConsent.ensure.mockResolvedValue(true);
});

describe('OwnerReportSection — Write with AI and Customize', () => {
  it('fills the summary and home care with the draft', async () => {
    draftOwnerReport.mockResolvedValue({ intro: 'Bella did great.', homecare: 'Brush daily' });
    const onOverrideChange = vi.fn();
    render(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={onOverrideChange} onPreview={() => {}} aiEnabled />);
    fireEvent.click(screen.getByRole('button', { name: /Write with AI/ }));
    await waitFor(() => expect(onOverrideChange).toHaveBeenCalledWith('intro', 'Bella did great.'));
    expect(onOverrideChange).toHaveBeenCalledWith('homecare', 'Brush daily');
    expect(confirmDialog).not.toHaveBeenCalled(); // nothing hand-edited
  });

  it('asks before replacing hand-edited text, and does nothing if cancelled', async () => {
    confirmDialog.mockResolvedValueOnce(false);
    const onOverrideChange = vi.fn();
    render(<OwnerReportSection snapshot={snap} overrides={{ intro: 'My own words' }} onOverrideChange={onOverrideChange} onPreview={() => {}} aiEnabled />);
    fireEvent.click(screen.getByRole('button', { name: /Write with AI/ }));
    await waitFor(() => expect(confirmDialog).toHaveBeenCalled());
    expect(draftOwnerReport).not.toHaveBeenCalled();
    expect(onOverrideChange).not.toHaveBeenCalled();
  });

  it('a fast double-click writes one draft', async () => {
    draftOwnerReport.mockResolvedValue({ intro: 'Bella did great.', homecare: 'Brush daily' });
    const onOverrideChange = vi.fn();
    render(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={onOverrideChange} onPreview={() => {}} aiEnabled />);
    const button = screen.getByRole('button', { name: /Write with AI/ });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(onOverrideChange).toHaveBeenCalledWith('intro', 'Bella did great.'));
    expect(draftOwnerReport).toHaveBeenCalledTimes(1);
  });

  it('a fast double-click over edited text asks once and writes one draft', async () => {
    draftOwnerReport.mockResolvedValue({ intro: 'Bella did great.', homecare: 'Brush daily' });
    const onOverrideChange = vi.fn();
    render(<OwnerReportSection snapshot={snap} overrides={{ intro: 'My own words' }} onOverrideChange={onOverrideChange} onPreview={() => {}} aiEnabled />);
    const button = screen.getByRole('button', { name: /Write with AI/ });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(onOverrideChange).toHaveBeenCalledWith('intro', 'Bella did great.'));
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(draftOwnerReport).toHaveBeenCalledTimes(1);
  });

  it('app: declining the AI consent sends nothing', async () => {
    aiConsent.ensure.mockResolvedValue(false);
    const onOverrideChange = vi.fn();
    render(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={onOverrideChange} onPreview={() => {}} aiEnabled />);
    fireEvent.click(screen.getByRole('button', { name: /Write with AI/ }));
    await waitFor(() => expect(aiConsent.ensure).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(draftOwnerReport).not.toHaveBeenCalled();
  });

  it('no AI button without AI or on a view-only chart', () => {
    const { rerender } = render(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={() => {}} onPreview={() => {}} />);
    expect(screen.queryByRole('button', { name: /Write with AI/ })).not.toBeInTheDocument();
    rerender(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={() => {}} onPreview={() => {}} aiEnabled readOnly />);
    expect(screen.queryByRole('button', { name: /Write with AI/ })).not.toBeInTheDocument();
  });

  it('Customize opens the report templates editor', () => {
    const onCustomize = vi.fn();
    render(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={() => {}} onPreview={() => {}} onCustomize={onCustomize} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(onCustomize).toHaveBeenCalled();
  });
});
