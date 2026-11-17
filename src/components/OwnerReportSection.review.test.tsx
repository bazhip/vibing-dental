import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { confirmDialog } from './ui/dialogs';
import { vi } from 'vitest';
import { OwnerReportSection } from './OwnerReportSection';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import { ownerReportReviewBasis } from '../utils/ownerReport';
vi.mock('./ui/dialogs', async (original) => ({ ...(await original<typeof import('./ui/dialogs')>()), confirmDialog: vi.fn(async () => true) }));

it('requires explicit review and returns to draft when clinical information changes', async () => {
  const snapshot = { ...sampleOwnerReportSnapshot(), ownerReport: {} };
  const change = vi.fn();
  const props = { snapshot, overrides: snapshot.ownerReport, onOverrideChange: change, onPreview: vi.fn() };
  const { rerender } = render(<OwnerReportSection {...props} />);
  expect(screen.getByText('Draft — review required')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm review and completion' }));
  await waitFor(() => expect(change).toHaveBeenCalledWith('reviewedBasis', ownerReportReviewBasis(snapshot)));
  const reviewed = { ...snapshot, ownerReport: { reviewedBasis: ownerReportReviewBasis(snapshot) } };
  rerender(<OwnerReportSection {...props} snapshot={reviewed} overrides={reviewed.ownerReport} />);
  expect(screen.getByText('Reviewed and complete')).toBeInTheDocument();
  rerender(<OwnerReportSection {...props} snapshot={{ ...reviewed, patientInfo: { ...reviewed.patientInfo, complaint: 'Changed' } }} overrides={reviewed.ownerReport} />);
  expect(screen.getByText('Draft — review required')).toBeInTheDocument();
});

it('does not confirm a read-only visit', () => {
  const snapshot = { ...sampleOwnerReportSnapshot(), ownerReport: {} };
  render(<OwnerReportSection snapshot={snapshot} overrides={{}} onOverrideChange={vi.fn()} onPreview={vi.fn()} readOnly />);
  expect(screen.getByRole('button', { name: 'Confirm review and completion' })).toBeDisabled();
});

it('does not confirm a report after the section unmounts', async () => {
  let finish!: (confirmed: boolean) => void;
  vi.mocked(confirmDialog).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const snapshot = sampleOwnerReportSnapshot();
  const change = vi.fn();
  const { unmount } = render(<OwnerReportSection snapshot={snapshot} overrides={{}} onOverrideChange={change} onPreview={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm review and completion' }));
  await waitFor(() => expect(finish).toBeDefined());
  unmount();
  await act(async () => { finish(true); });
  expect(change).not.toHaveBeenCalled();
});
