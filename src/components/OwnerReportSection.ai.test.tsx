import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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

  it('no AI button without AI; on a view-only chart it stays, locked, and explains', async () => {
    const { rerender } = render(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={() => {}} onPreview={() => {}} />);
    expect(screen.queryByRole('button', { name: /Write with AI/ })).not.toBeInTheDocument();
    rerender(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={() => {}} onPreview={() => {}} aiEnabled readOnly />);
    const ai = screen.getByRole('button', { name: /Write with AI/ });
    expect(ai).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(ai);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('View only — choose Edit chart to make changes'));
    expect(draftOwnerReport).not.toHaveBeenCalled();
  });

  it('Customize opens the report templates editor', () => {
    const onCustomize = vi.fn();
    render(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={() => {}} onPreview={() => {}} onCustomize={onCustomize} />);
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(onCustomize).toHaveBeenCalled();
  });
});

it('does not apply an AI response after the chart becomes locked', async () => {
  let finish!: (value: { intro: string; homecare: string }) => void;
  draftOwnerReport.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const change = vi.fn();
  const props = { snapshot: snap, overrides: {}, onOverrideChange: change, onPreview: vi.fn(), aiEnabled: true };
  const { rerender } = render(<OwnerReportSection {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Write with AI/ }));
  await waitFor(() => expect(draftOwnerReport).toHaveBeenCalled());
  rerender(<OwnerReportSection {...props} readOnly />);
  await act(async () => { finish({ intro: 'Late', homecare: 'Late' }); });
  expect(change).not.toHaveBeenCalled();
});

it('does not apply AI text after unmount', async () => {
  let finish!: (value: { intro: string; homecare: string }) => void;
  draftOwnerReport.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const change = vi.fn();
  const { unmount } = render(<OwnerReportSection snapshot={snap} overrides={{}} onOverrideChange={change} onPreview={vi.fn()} aiEnabled />);
  fireEvent.click(screen.getByRole('button', { name: /Write with AI/ }));
  await waitFor(() => expect(draftOwnerReport).toHaveBeenCalled());
  unmount();
  await act(async () => { finish({ intro: 'Late', homecare: 'Late' }); });
  expect(change).not.toHaveBeenCalled();
});

it('Undo does not overwrite report text edited after an AI draft', async () => {
  draftOwnerReport.mockResolvedValue({ intro: 'Draft', homecare: 'Tips' });
  const change = vi.fn();
  const props = { snapshot: snap, overrides: {}, onOverrideChange: change, onPreview: vi.fn(), aiEnabled: true };
  const { rerender } = render(<OwnerReportSection {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Write with AI/ }));
  await waitFor(() => expect(toast).toHaveBeenCalled());
  const undo = toast.mock.calls.find(([, options]) => options.action)?.[1].action.onClick;
  const changed = { ...snap, ownerReport: { intro: 'Later user edit', homecare: 'Tips' } };
  rerender(<OwnerReportSection {...props} snapshot={changed} overrides={changed.ownerReport} />);
  change.mockClear();
  undo();
  expect(change).not.toHaveBeenCalled();
});
