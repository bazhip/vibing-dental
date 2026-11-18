import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PimsUploadReview } from './PimsUploadReview';
import type { UploadReviewBackend, UploadReviewItem, UploadReviewPage } from '../../utils/pims/uploadReview';

const auth = vi.hoisted(() => ({ event: (_event: string) => {} }));
vi.mock('../../utils/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: (callback: (event: string) => void) => {
  auth.event = callback;
  return { data: { subscription: { unsubscribe: vi.fn() } } };
} } } }));
const row: UploadReviewItem = { id: 'attempt', chart_id: 'chart', connection_id: 'connection', connection_revision: 2,
  identity: { provider: 'instinct', origin: 'https://clinic.instinctvet.cloud', tenant_id: 'clinic-1', connection_revision: 2 },
  patient_id: 'patient-1', location_id: 'location-2', draft_id: 'draft', draft_version: 2, content_hash: 'a'.repeat(64),
  dispatched_at: '2026-11-17T12:00:00Z', state: 'unknown', review_version: 0, observation: null };
const imageRow: UploadReviewItem = { kind: 'image', id: 'image-attempt', chart_id: 'chart', connection_id: 'connection', connection_revision: 2,
  identity: { provider: 'ezyvet', origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic-1', connection_revision: 2 },
  patient_id: 'patient-1', encounter_id: 'encounter-2', destination: 'Medical', document_generation: 'document-3', image_id: 'image-1',
  content_hash: 'b'.repeat(64), dispatched_at: row.dispatched_at, state: 'unknown', review_version: 0, observation: null };
function fixture() {
  let current = { ...row };
  const backend: UploadReviewBackend = {
    page: vi.fn(async () => ({ rows: [current], next_cursor: null })),
    observe: vi.fn(async input => {
      const receipt = { ...input, version: input.expected_version + 1, actor_id: 'reviewer', created_at: '2026-11-17T12:05:00Z' };
      current = { ...current, review_version: receipt.version, observation: receipt };
      return receipt;
    }),
  };
  return backend;
}
beforeEach(() => vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true'));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
async function open(backend: UploadReviewBackend) {
  const view = render(<PimsUploadReview chartId="chart" backend={backend} />);
  expect(backend.page).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
  await screen.findByLabelText('Your observation');
  return view;
}
function fill() {
  fireEvent.change(screen.getByLabelText('Your observation'), { target: { value: 'not_found' } });
  fireEvent.change(screen.getByLabelText('Review note'), { target: { value: 'Checked the document list' } });
  fireEvent.click(screen.getByRole('checkbox'));
}
it.each([undefined, '', 'false'])('does not render or read without rollout %s', value => {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', value);
  const backend = fixture();
  expect(render(<PimsUploadReview chartId="chart" backend={backend} />).container).toBeEmptyDOMElement();
  expect(backend.page).not.toHaveBeenCalled();
});
it('requires an explicit observation and warns that manual review does not unlock automatic retry', async () => {
  const backend = fixture(); await open(backend);
  expect(screen.getByText(/Manual observations do not confirm a saved file/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Record manual observation' })).toBeDisabled();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Record manual observation' }));
  await screen.findByRole('status');
  expect(backend.observe).toHaveBeenCalledWith(expect.objectContaining({ chart_id: 'chart', attempt_id: 'attempt', expected_version: 0,
    observation: 'not_found', note: 'Checked the document list' }));
  expect(screen.getByRole('status')).toHaveTextContent('Automatic retry remains blocked');
  expect(backend.page).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Record manual observation' })).toBeDisabled();
});
it('does not dispatch twice and blocks edits after an uncertain acknowledgement until reload', async () => {
  const backend = fixture();
  let reject!: (cause: unknown) => void;
  vi.mocked(backend.observe).mockImplementation(() => new Promise((_resolve, failure) => { reject = failure; }));
  await open(backend); fill();
  const save = screen.getByRole('button', { name: 'Record manual observation' });
  fireEvent.click(save); fireEvent.click(save);
  expect(backend.observe).toHaveBeenCalledTimes(1);
  await act(async () => reject({ code: 'unknown' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Reload/);
  expect(save).toBeDisabled();
  expect(screen.getByLabelText('Review note')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload uploads' }));
  await waitFor(() => expect(screen.getByLabelText('Review note')).toBeEnabled());
  expect(backend.observe).toHaveBeenCalledTimes(1);
});
it.each(['chart', 'signout', 'disabled', 'unmount'])('ignores pending reads after %s change', async change => {
  const backend = fixture();
  let resolve!: (value: UploadReviewPage) => void;
  vi.mocked(backend.page).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<PimsUploadReview chartId="chart" backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
  if (change === 'chart') view.rerender(<PimsUploadReview chartId="other" backend={backend} />);
  if (change === 'signout') act(() => auth.event('SIGNED_OUT'));
  if (change === 'disabled') view.rerender(<PimsUploadReview chartId="chart" disabled backend={backend} />);
  if (change === 'unmount') view.unmount();
  await act(async () => resolve({ rows: [row], next_cursor: null }));
  expect(screen.queryByLabelText('Your observation')).not.toBeInTheDocument();
  expect(screen.queryByText(/patient-1/)).not.toBeInTheDocument();
});
it('does not publish a success notice after switching charts during a write', async () => {
  const backend = fixture();
  let resolve!: (value: any) => void;
  vi.mocked(backend.observe).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = await open(backend); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Record manual observation' }));
  view.rerender(<PimsUploadReview chartId="other" backend={backend} />);
  await act(async () => resolve({ version: 1 }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(backend.page).toHaveBeenCalledTimes(1);
});
it('clears inaccessible target information when review permission is revoked', async () => {
  const backend = fixture();
  vi.mocked(backend.observe).mockRejectedValue({ code: 'forbidden' });
  await open(backend); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Record manual observation' }));
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('Your observation')).not.toBeInTheDocument();
  expect(screen.queryByText(/patient-1/)).not.toBeInTheDocument();
});
it('uses the server cursor and resets confirmation when the target changes', async () => {
  const backend = fixture();
  vi.mocked(backend.page).mockResolvedValueOnce({ rows: [row], next_cursor: 'next-cursor' })
    .mockResolvedValueOnce({ rows: [{ ...row, id: 'second', patient_id: 'patient-2' }], next_cursor: null });
  await open(backend); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Next uploads' }));
  await screen.findByText('Patient ID: patient-2');
  expect(backend.page).toHaveBeenLastCalledWith({ chart_id: 'chart', cursor: 'next-cursor' });
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByLabelText('Review note')).toHaveValue('');
});
it.each([null, 'chart'])('handles unsaved charts and missing schema without assuming an empty history', async chartId => {
  render(<PimsUploadReview chartId={chartId} backend={null} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
  if (chartId) expect(await screen.findByRole('alert')).toHaveTextContent(/not available/);
  else expect(await screen.findByText('Save this chart before reviewing uploads.')).toBeInTheDocument();
  expect(screen.queryByText('No uncertain uploads on this page.')).not.toBeInTheDocument();
});
it('reuses manual review controls with the original image and encounter destination', async () => {
  const backend = fixture();
  vi.mocked(backend.page).mockResolvedValue({ rows: [imageRow], next_cursor: null });
  render(<PimsUploadReview chartId="chart" kind="image" backend={backend} />);
  expect(screen.getByRole('heading', { name: 'Uncertain image transfers' })).toBeInTheDocument();
  expect(backend.page).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
  await screen.findByLabelText('Your observation');
  expect(screen.getByText('Saved image ID: image-1')).toBeInTheDocument();
  expect(screen.getByText('Original destination: https://clinic.ezyvet.com · clinic clinic-1 · encounter encounter-2 · field Medical')).toBeInTheDocument();
  expect(screen.queryByText(/Reviewed draft:|location undefined/)).not.toBeInTheDocument();
  fill(); fireEvent.click(screen.getByRole('button', { name: 'Record manual observation' }));
  await screen.findByRole('status');
  expect(backend.observe).toHaveBeenCalledWith(expect.objectContaining({ attempt_id: 'image-attempt', expected_version: 0 }));
  expect(screen.getByRole('status')).toHaveTextContent('Automatic retry remains blocked');
  expect(screen.queryByRole('button', { name: /retry|confirm/i })).not.toBeInTheDocument();
});
it.each([
  ['page', 'pdf', 'image'], ['observe', 'pdf', 'image'], ['page', 'image', 'pdf'], ['observe', 'image', 'pdf'],
] as const)('rejects delayed %s replies after switching %s to %s with the same backend', async (operation, from, to) => {
  const backend = fixture();
  const item = from === 'image' ? imageRow : row;
  vi.mocked(backend.page).mockResolvedValue({ rows: [item], next_cursor: null });
  let resolve!: (value: any) => void;
  if (operation === 'page') vi.mocked(backend.page).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  else vi.mocked(backend.observe).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const view = render(<PimsUploadReview chartId="chart" kind={from} backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
  if (operation === 'observe') { await screen.findByLabelText('Your observation'); fill(); fireEvent.click(screen.getByRole('button', { name: 'Record manual observation' })); }
  view.rerender(<PimsUploadReview chartId="chart" kind={to} backend={backend} />);
  await act(async () => resolve(operation === 'page' ? { rows: [item], next_cursor: null } : { version: 1 }));
  expect(screen.queryByLabelText('Your observation')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(backend.page).toHaveBeenCalledTimes(1);
});
it.each(['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED'])('clears image review and pending replies on %s', async event => {
  const backend = fixture();
  vi.mocked(backend.page).mockResolvedValue({ rows: [imageRow], next_cursor: null });
  let resolve!: (value: any) => void;
  vi.mocked(backend.observe).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<PimsUploadReview chartId="chart" kind="image" backend={backend} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review uncertain uploads' }));
  await screen.findByLabelText('Your observation'); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Record manual observation' }));
  act(() => auth.event(event));
  expect(screen.queryByText('Saved image ID: image-1')).not.toBeInTheDocument();
  await act(async () => resolve({ version: 1 }));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(backend.page).toHaveBeenCalledTimes(1);
});
