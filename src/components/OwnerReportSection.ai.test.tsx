import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { vi } from 'vitest';
import { OwnerReportSection } from './OwnerReportSection';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import type { OwnerReportOverrides } from '../types';

const mock = vi.hoisted(() => ({ draft: vi.fn(), confirm: vi.fn(), consent: vi.fn() }));
vi.mock('../utils/ownerReportAi', () => ({ draftOwnerReport: mock.draft }));
vi.mock('../native/aiConsent', () => ({ ensureAiConsent: mock.consent }));
vi.mock('./ui/dialogs', async original => ({
  ...await original<typeof import('./ui/dialogs')>(),
  confirmDialog: mock.confirm,
}));

beforeEach(() => {
  mock.draft.mockReset().mockResolvedValue({ intro: 'A fractured tooth was recorded at this visit.', homecare: 'Follow the documented instructions.' });
  mock.confirm.mockReset().mockResolvedValue(true);
  mock.consent.mockReset().mockResolvedValue(true);
});

function Report({ initial = {}, chartId = 'visit' }: { initial?: OwnerReportOverrides; chartId?: string }) {
  const [overrides, setOverrides] = React.useState(initial);
  const snapshot = { ...sampleOwnerReportSnapshot(), ownerReport: overrides };
  return <OwnerReportSection snapshot={snapshot} chartId={chartId} overrides={overrides}
    onOverrideChange={(field, value) => setOverrides(previous => ({ ...previous, [field]: value ?? undefined }))}
    onPreview={vi.fn()} onCustomize={vi.fn()} aiEnabled />;
}

it('writes a visit-based draft and restores it after later edits', async () => {
  render(<Report />);
  expect(mock.draft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Write with AI' }));
  const summary = screen.getByRole('textbox', { name: 'Opening summary' });
  await waitFor(() => expect(summary).toHaveValue('A fractured tooth was recorded at this visit.'));
  expect(screen.getByRole('textbox', { name: 'Home care advice' })).toHaveValue('Follow the documented instructions.');
  expect(mock.draft).toHaveBeenCalledOnce();
  fireEvent.change(summary, { target: { value: 'My draft' } });
  const restore = within(summary.closest('.owner-report__block') as HTMLElement).getByRole('button', { name: 'Restore generated' });
  fireEvent.click(restore);
  expect(summary).toHaveValue('A fractured tooth was recorded at this visit.');
});

it('keeps manual edits when the user cancels replacement', async () => {
  mock.confirm.mockResolvedValue(false);
  render(<Report initial={{ intro: 'Reviewed wording' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Write with AI' }));
  await waitFor(() => expect(mock.confirm).toHaveBeenCalledOnce());
  expect(mock.draft).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Opening summary' })).toHaveValue('Reviewed wording');
});

it('discards draft results after switching visits', async () => {
  let resolveDraft!: (draft: { intro: string }) => void;
  mock.draft.mockImplementationOnce(() => new Promise(resolve => { resolveDraft = resolve; }));
  const { rerender } = render(<Report />);
  fireEvent.click(screen.getByRole('button', { name: 'Write with AI' }));
  await waitFor(() => expect(mock.draft).toHaveBeenCalledOnce());
  rerender(<Report chartId="other-visit" />);
  await act(async () => resolveDraft({ intro: 'Another patient’s draft' }));
  expect(screen.getByRole('textbox', { name: 'Opening summary' })).not.toHaveValue('Another patient’s draft');
});
