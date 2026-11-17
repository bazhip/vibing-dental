import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PimsDrafts } from './PimsDrafts';
import type { ClinicalDraft, DraftBackend, DraftContext } from '../../utils/pims/drafts';

const source = { chart_id: 'chart', practice_id: 'practice', patient_name: 'Milo', patient_number: 'P-1',
  chart_date: '2026-11-16', updated_at: '2026-11-16T12:00:00Z', hash: 'a'.repeat(64), data: {} };
const draft: ClinicalDraft = { id: 'draft', chart_id: 'chart', practice_id: 'practice', kind: 'history', language: 'en',
  body: '108: 4.5 mm', source_hash: source.hash, source, version: 1, reviewed_version: null, reviewed_at: null, reviewed_by: null };
function backend() {
  return { context: vi.fn().mockResolvedValue({ source, drafts: [draft] }),
    write: vi.fn().mockResolvedValue({ ...draft, version: 2, reviewed_version: 2, reviewed_by: 'vet', reviewed_at: source.updated_at }),
    export: vi.fn().mockResolvedValue({ ...draft, version: 2, reviewed_version: 2, reviewed_by: 'vet', reviewed_at: source.updated_at }),
  } satisfies DraftBackend;
}
const open = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Prepare history or radiology notes' }));
  await screen.findByLabelText('Review and edit the notes');
};
beforeEach(() => vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
describe('clinical draft workflow', () => {
  it('requires explicit review and blocks exporting unsaved edits', async () => {
    const api = backend();
    render(<PimsDrafts chartId="chart" backend={api} />);
    await open();
    expect(screen.getByRole('button', { name: 'Copy reviewed notes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve reviewed draft' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve reviewed draft' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy reviewed notes' })).toBeEnabled());
    expect(api.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'review', draft_id: 'draft', expected_version: 1 }));
    fireEvent.change(screen.getByLabelText('Review and edit the notes'), { target: { value: '108: 5 mm' } });
    expect(screen.getByRole('button', { name: 'Copy reviewed notes' })).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
  it('keeps uncertain writes locked until reload and preserves the edited text', async () => {
    const api = backend(); api.write.mockRejectedValue({ code: 'unknown' });
    render(<PimsDrafts chartId="chart" backend={api} />); await open();
    fireEvent.change(screen.getByLabelText('Review and edit the notes'), { target: { value: 'New findings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Review and edit the notes')).toHaveValue('New findings');
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(api.write).toHaveBeenCalledTimes(1);
  });
  it('discards delayed source responses after switching charts', async () => {
    let resolve!: (value: DraftContext) => void;
    const api = backend(); api.context.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = render(<PimsDrafts chartId="chart" backend={api} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare history or radiology notes' }));
    view.rerender(<PimsDrafts chartId="other-chart" backend={api} />);
    await act(async () => { resolve({ source, drafts: [draft] }); });
    expect(screen.queryByDisplayValue(draft.body)).not.toBeInTheDocument();
  });
  it('requires a fresh source after server-side invalidation and never copies stale content', async () => {
    const api = backend();
    api.context.mockResolvedValue({ source, drafts: [{ ...draft, reviewed_version: 1, reviewed_by: 'vet', reviewed_at: source.updated_at }] });
    api.export.mockRejectedValue({ code: 'stale' });
    const copy = vi.fn(); vi.stubGlobal('navigator', { clipboard: { writeText: copy } });
    render(<PimsDrafts chartId="chart" backend={api} />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy reviewed notes' }));
    await screen.findByRole('alert');
    expect(copy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy reviewed notes' })).toBeDisabled();
    vi.unstubAllGlobals();
  });
  it('keeps manual draft preparation clearly separate from PIMS success', async () => {
    render(<PimsDrafts chartId={null} backend={backend()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Prepare history or radiology notes' }));
    expect(screen.getByText(/Save this chart to the practice cloud/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
  });
  it('clears cached clinical content when access is revoked', async () => {
    const api = backend();
    api.context.mockResolvedValue({ source, drafts: [{ ...draft, reviewed_version: 1, reviewed_by: 'vet', reviewed_at: source.updated_at }] });
    api.export.mockRejectedValue({ code: 'forbidden' });
    render(<PimsDrafts chartId="chart" backend={api} />); await open();
    fireEvent.click(screen.getByRole('button', { name: 'Copy reviewed notes' }));
    await screen.findByRole('alert');
    expect(screen.queryByDisplayValue(draft.body)).not.toBeInTheDocument();
    expect(screen.queryByText(/Patient: Milo/)).not.toBeInTheDocument();
  });
});
