import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PimsDrafts } from './PimsDrafts';
import type { ClinicalDraft, DraftBackend, DraftContext } from '../../utils/pims/drafts';
import * as draftUtils from '../../utils/pims/drafts';
import type { PimsTransport } from '../../utils/pims/extensionBridge';

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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Close drafts' })).toBeEnabled());
};
const prepareInstinctSubmission = async () => {
  const button = await screen.findByRole('button', { name: 'Prepare Instinct submission' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
};
beforeEach(() => vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
describe('clinical draft workflow', () => {
  it('offers Instinct submission only for the selected reviewed, unchanged draft', async () => {
    const api = backend();
    const transport = { instinctSubmission: vi.fn() } as unknown as PimsTransport;
    render(<PimsDrafts chartId="chart" backend={api} instinctUpload={{ tabId: 12, transport }} />);
    await open();
    expect(screen.queryByRole('button', { name: 'Prepare Instinct submission' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve reviewed draft' }));
    expect(await screen.findByRole('button', { name: 'Prepare Instinct submission' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Review and edit the notes'), { target: { value: 'Edited findings' } });
    expect(screen.queryByRole('button', { name: 'Prepare Instinct submission' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy reviewed notes' })).toBeDisabled();
  });
  it('reviews the destination and exports the same approved PDF again before a single explicit submission', async () => {
    const api = backend();
    const prepared = { state: 'prepared', ticket: 'ticket', patient_id: 'patient-7', location_id: '1',
      location_source: 'compatibility_default', origin: 'https://us.instinctvet.com', expires_at: new Date(Date.now() + 60000).toISOString() };
    const submit = vi.fn().mockResolvedValueOnce(prepared).mockImplementation(async (_tab, request) => ({ state: 'submitted', id: request.id }));
    render(<PimsDrafts chartId="chart" backend={api} instinctUpload={{ tabId: 12, transport: { instinctSubmission: submit } as unknown as PimsTransport }} />);
    await open();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve reviewed draft' }));
    await prepareInstinctSubmission();
    expect(await screen.findByText(/patient-7/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit PDF' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I checked the Instinct patient and compatibility location.'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit PDF' }));
    expect(await screen.findByText(/Submitted to Instinct/)).toBeInTheDocument();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1][1]).toEqual(expect.objectContaining({ operation: 'submit', ticket: 'ticket', location_id: '1', is_shared: false,
      source: { chartId: 'chart', draftId: 'draft', version: 2 }, bytes: expect.any(Array) }));
    expect(api.export).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Submit PDF' })).not.toBeInTheDocument();
  });
  it.each(['submitted', 'unknown'])('never retries after a %s outcome', async (outcome) => {
    const api = backend();
    const prepared = { state: 'prepared', ticket: 'ticket', patient_id: 'patient-7', location_id: '1',
      location_source: 'compatibility_default', origin: 'https://us.instinctvet.com', expires_at: new Date(Date.now() + 60000).toISOString() };
    const submit = vi.fn().mockResolvedValueOnce(prepared).mockImplementation(async (_tab, request) => ({ state: outcome, id: request.id }));
    render(<PimsDrafts chartId="chart" backend={api} instinctUpload={{ tabId: 12, transport: { instinctSubmission: submit } as unknown as PimsTransport }} />);
    await open(); fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve reviewed draft' }));
    await prepareInstinctSubmission();
    fireEvent.click(await screen.findByLabelText('I checked the Instinct patient and compatibility location.'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit PDF' }));
    await screen.findByText(outcome === 'submitted' ? /Submitted to Instinct/ : /Outcome unknown/);
    expect(screen.queryByRole('button', { name: 'Submit PDF' })).not.toBeInTheDocument();
    expect(submit).toHaveBeenCalledTimes(2);
  });
  it('does not dispatch a PDF rendered after switching the target tab', async () => {
    const api = backend();
    let resolve!: (value: Uint8Array<ArrayBuffer>) => void;
    const renderPdf = vi.spyOn(draftUtils, 'renderDraftPdf').mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const prepared = { state: 'prepared', ticket: 'ticket', patient_id: 'patient-7', location_id: '1',
      location_source: 'compatibility_default', origin: 'https://us.instinctvet.com', expires_at: new Date(Date.now() + 60000).toISOString() };
    const submit = vi.fn().mockResolvedValue(prepared);
    const transport = { instinctSubmission: submit } as unknown as PimsTransport;
    const view = render(<PimsDrafts chartId="chart" backend={api} instinctUpload={{ tabId: 12, transport }} />);
    await open(); fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Approve reviewed draft' }));
    await prepareInstinctSubmission();
    fireEvent.click(await screen.findByLabelText('I checked the Instinct patient and compatibility location.'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit PDF' }));
    await waitFor(() => expect(renderPdf).toHaveBeenCalled());
    view.rerender(<PimsDrafts chartId="chart" backend={api} instinctUpload={{ tabId: 13, transport }} />);
    await act(async () => { resolve(new Uint8Array([37, 80, 68, 70, 45, 10])); });
    expect(submit).toHaveBeenCalledTimes(1);
    renderPdf.mockRestore();
  });
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

describe('reviewed radiology autofill', () => {
  const prepared = () => ({ state: 'prepared', ticket: 'radiology-ticket', provider: 'radimal', origin: 'https://app.radimal.ai',
    title: 'Milo consultation', existing_characters: 12, expires_at: new Date(Date.now() + 60000).toISOString() });
  const targets = { state: 'targets', targets: [{ tabId: 21, provider: 'radimal', origin: 'https://app.radimal.ai', title: 'Milo consultation' },
    { tabId: 22, provider: 'vetology', origin: 'https://app.vetology.net', title: 'Other consultation' }] };
  function fixture() {
    const api = backend();
    const reviewed = { ...draft, kind: 'radiology' as const, reviewed_version: 1, reviewed_by: 'vet', reviewed_at: source.updated_at };
    api.context.mockResolvedValue({ source, drafts: [reviewed] });
    api.export.mockResolvedValue(reviewed);
    const execute = vi.fn().mockImplementation(async (request) => request.operation === 'list' ? targets : request.operation === 'prepare' ? prepared() : { state: 'filled' });
    const transport = { radiologyAutofill: execute } as unknown as PimsTransport;
    return { api, execute, transport, reviewed };
  }
  const chooseTarget = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Review radiology destination' }));
    const selector = await screen.findByLabelText('Radiology destination');
    expect(selector).toHaveValue('');
    fireEvent.change(selector, { target: { value: '21' } });
    await screen.findByLabelText('I checked the patient and request on this radiology page.');
  };
  it('requires explicit target selection and patient confirmation before appending reviewed text', async () => {
    const { api, execute, transport, reviewed } = fixture();
    render(<PimsDrafts chartId="chart" backend={api} radiologyTransport={transport} />);
    await open(); await chooseTarget();
    expect(screen.getByText(/Existing characters: 12/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Autofill report notes' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('I checked the patient and request on this radiology page.'));
    fireEvent.click(screen.getByRole('button', { name: 'Autofill report notes' }));
    await screen.findByText(/Report notes filled/);
    expect(execute.mock.calls.map(([request]) => request.operation)).toEqual(['list', 'prepare', 'fill']);
    expect(execute).toHaveBeenLastCalledWith({ operation: 'fill', tabId: 21, ticket: 'radiology-ticket', text: draftUtils.draftText(reviewed) });
    expect(api.export).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Autofill report notes' })).not.toBeInTheDocument();
  });
  it('offers autofill only for approved unchanged radiology drafts', async () => {
    const { api, transport } = fixture();
    api.context.mockResolvedValue({ source, drafts: [{ ...draft, reviewed_version: 1 }] });
    const view = render(<PimsDrafts chartId="chart" backend={api} radiologyTransport={transport} />);
    await open();
    expect(screen.queryByRole('button', { name: 'Review radiology destination' })).not.toBeInTheDocument();
    view.unmount();
    const next = fixture();
    render(<PimsDrafts chartId="chart" backend={next.api} radiologyTransport={next.transport} />);
    await open();
    fireEvent.change(screen.getByLabelText('Review and edit the notes'), { target: { value: 'Unsaved radiology notes' } });
    expect(screen.queryByRole('button', { name: 'Review radiology destination' })).not.toBeInTheDocument();
  });
  it('shows an empty target result without guessing a destination', async () => {
    const { api, execute, transport } = fixture();
    execute.mockResolvedValueOnce({ state: 'targets', targets: [] });
    render(<PimsDrafts chartId="chart" backend={api} radiologyTransport={transport} />);
    await open(); fireEvent.click(await screen.findByRole('button', { name: 'Review radiology destination' }));
    await screen.findByText(/Open a Radimal consultation/);
    expect(screen.queryByRole('button', { name: 'Autofill report notes' })).not.toBeInTheDocument();
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each(['unknown', 'filled'])('does not offer repeat fill after %s', async (state) => {
    const { api, execute, transport } = fixture();
    execute.mockImplementation(async (request) => request.operation === 'list' ? targets : request.operation === 'prepare' ? prepared() : { state });
    render(<PimsDrafts chartId="chart" backend={api} radiologyTransport={transport} />);
    await open(); await chooseTarget();
    fireEvent.click(screen.getByLabelText('I checked the patient and request on this radiology page.'));
    fireEvent.click(screen.getByRole('button', { name: 'Autofill report notes' }));
    await screen.findByText(state === 'filled' ? /Report notes filled/ : /Autofill outcome unknown/);
    expect(screen.queryByRole('button', { name: 'Autofill report notes' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Radiology destination')).toBeDisabled();
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it('never dispatches a stale draft returned by reauthorization', async () => {
    const { api, execute, transport, reviewed } = fixture();
    api.export.mockResolvedValueOnce(reviewed).mockResolvedValueOnce({ ...reviewed, body: 'Changed on another device' });
    render(<PimsDrafts chartId="chart" backend={api} radiologyTransport={transport} />);
    await open(); await chooseTarget();
    fireEvent.click(screen.getByLabelText('I checked the patient and request on this radiology page.'));
    fireEvent.click(screen.getByRole('button', { name: 'Autofill report notes' }));
    await screen.findByRole('alert');
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('suppresses a pending fill after chart switch', async () => {
    const { api, execute, transport, reviewed } = fixture();
    let resolve!: (value: ClinicalDraft) => void;
    api.export.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const view = render(<PimsDrafts chartId="chart" backend={api} radiologyTransport={transport} />);
    await open(); await chooseTarget();
    fireEvent.click(screen.getByLabelText('I checked the patient and request on this radiology page.'));
    fireEvent.click(screen.getByRole('button', { name: 'Autofill report notes' }));
    await waitFor(() => expect(api.export).toHaveBeenCalledOnce());
    view.rerender(<PimsDrafts chartId="other-chart" backend={api} radiologyTransport={transport} />);
    await act(async () => { resolve(reviewed); });
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('offers an explicit destination review after a definite blocked result', async () => {
    const { api, execute, transport } = fixture();
    execute.mockImplementation(async request => request.operation === 'list' ? targets : request.operation === 'prepare' ? prepared() : { state: 'blocked' });
    render(<PimsDrafts chartId="chart" backend={api} radiologyTransport={transport} />);
    await open(); await chooseTarget();
    fireEvent.click(screen.getByLabelText('I checked the patient and request on this radiology page.'));
    fireEvent.click(screen.getByRole('button', { name: 'Autofill report notes' }));
    await screen.findByText(/Notes not filled/);
    expect(screen.getByRole('button', { name: 'Review radiology destination' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Review radiology destination' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(4));
    expect(screen.getByLabelText('Radiology destination')).toHaveValue('');
  });

});
