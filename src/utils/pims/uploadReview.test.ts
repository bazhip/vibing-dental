import { createUploadReviewBackend } from './uploadReview';

const chart = '88888888-8888-4888-8888-888888888888';
const attempt = '99999999-9999-4999-8999-999999999999';
const request = '44444444-4444-4444-8444-444444444444';
const connection = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const receipt = { request_id: request, chart_id: chart, attempt_id: attempt, version: 1, observation: 'not_found',
  note: 'Checked document list', actor_id: connection, created_at: '2026-11-17T12:00:00Z' };
const row = { id: attempt, chart_id: chart, connection_id: connection, connection_revision: 2,
  identity: { provider: 'instinct', origin: 'https://clinic.instinctvet.cloud', tenant_id: 'clinic-1', connection_revision: 2 },
  patient_id: 'patient-1', location_id: 'location-2', draft_id: request, draft_version: 2, content_hash: 'a'.repeat(64),
  dispatched_at: '2026-11-17T12:00:00Z', state: 'unknown', review_version: 0, observation: null };
const command = { chart_id: chart, attempt_id: attempt, request_id: request, expected_version: 0,
  observation: 'not_found' as const, note: receipt.note };
function fixture(data: unknown, reviewKind: 'pdf' | 'image' = 'pdf') {
  const rpc = vi.fn(async () => ({ data, error: null }));
  return { rpc, backend: createUploadReviewBackend({ rpc }, reviewKind) };
}
const imageRow = { kind: 'image', id: attempt, chart_id: chart, connection_id: connection, connection_revision: 2,
  identity: { provider: 'ezyvet', origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic-1', connection_revision: 2 },
  patient_id: 'patient-1', encounter_id: 'encounter-2', destination: 'Medical', document_generation: 'document-3',
  image_id: request, content_hash: 'a'.repeat(64), dispatched_at: row.dispatched_at, state: 'unknown', review_version: 0, observation: null };
it('routes saved-image review and manual observations to image RPCs only', async () => {
  const { backend, rpc } = fixture({ rows: [imageRow], next_cursor: null }, 'image');
  expect(await backend.page({ chart_id: chart })).toEqual({ rows: [imageRow], next_cursor: null });
  expect(rpc).toHaveBeenCalledWith('pims_image_review_page', { payload: { chart_id: chart } });
  const write = fixture(receipt, 'image');
  expect(await write.backend.observe(command)).toEqual(receipt);
  expect(write.rpc.mock.calls).toEqual([['pims_record_image_observation', { payload: command }]]);
});
it.each([
  { kind: undefined }, { kind: 'pdf' }, { image_id: 'image' }, { encounter_id: '' }, { destination: ' Medical' },
  { document_generation: 'has\nnewline' }, { review_version: -1 }, { connection_revision: 0 }, { content_hash: 'invalid' },
  { chart_id: connection }, { patient_id: '' }, { dispatched_at: 'yesterday' }, { state: 'confirmed' },
  { identity: row.identity }, { identity: { ...imageRow.identity, connection_revision: 3 } },
  { identity: { ...imageRow.identity, origin: 'https://attacker.test' } }, { review_version: 1 },
  { observation: receipt }, { review_version: 1, observation: { ...receipt, attempt_id: connection } },
])('rejects invalid image review rows %j', async change => {
  await expect(fixture({ rows: [{ ...imageRow, ...change }], next_cursor: null }, 'image').backend.page({ chart_id: chart }))
    .rejects.toEqual({ code: 'unknown' });
});
it.each([['pdf', imageRow], ['image', row], ['pdf', { ...row, kind: 'image' }], ['pdf', { ...row, kind: 'other' }]] as const)
  ('rejects cross-mode rows in %s review', async (reviewKind, item) => {
    await expect(fixture({ rows: [item], next_cursor: null }, reviewKind).backend.page({ chart_id: chart })).rejects.toEqual({ code: 'unknown' });
  });
it('accepts explicit PDF kinds without changing existing PDF callers', async () => {
  const item = { ...row, kind: 'pdf' };
  expect((await fixture({ rows: [item], next_cursor: null }).backend.page({ chart_id: chart })).rows).toEqual([item]);
});
it('accepts reviewed image unknowns without promoting their state', async () => {
  const item = { ...imageRow, review_version: 1, observation: receipt };
  expect((await fixture({ rows: [item], next_cursor: null }, 'image').backend.page({ chart_id: chart })).rows).toEqual([item]);
});
it.each([
  { rows: [imageRow, imageRow], next_cursor: null }, { rows: [imageRow], next_cursor: attempt },
  { rows: [], next_cursor: attempt }, { rows: Array.from({ length: 51 }, () => imageRow), next_cursor: null },
])('enforces image pagination bounds %j', async page => {
  await expect(fixture(page, 'image').backend.page({ chart_id: chart })).rejects.toEqual({ code: 'unknown' });
});
it('accepts a full ordered image page and passes its exact cursor', async () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({ ...imageRow, id: `99999999-9999-4999-8999-${String(index).padStart(12, '0')}` }));
  const cursor = rows[49].id;
  expect(await fixture({ rows, next_cursor: cursor }, 'image').backend.page({ chart_id: chart })).toEqual({ rows, next_cursor: cursor });
  const next = fixture({ rows: [], next_cursor: null }, 'image');
  await next.backend.page({ chart_id: chart, cursor });
  expect(next.rpc).toHaveBeenCalledWith('pims_image_review_page', { payload: { chart_id: chart, cursor } });
  await expect(fixture({ rows: [imageRow], next_cursor: null }, 'image').backend.page({ chart_id: chart, cursor: attempt }))
    .rejects.toEqual({ code: 'unknown' });
});
it('reads only the selected chart and validates the bounded review page', async () => {
  const { backend, rpc } = fixture({ rows: [row], next_cursor: null });
  expect(await backend.page({ chart_id: chart })).toEqual({ rows: [row], next_cursor: null });
  expect(rpc).toHaveBeenCalledWith('pims_upload_review_page', { payload: { chart_id: chart } });
});
it('records a manual observation without a confirmation or retry RPC', async () => {
  const { backend, rpc } = fixture(receipt);
  expect(await backend.observe(command)).toEqual(receipt);
  expect(rpc.mock.calls).toEqual([['pims_record_upload_observation', { payload: command }]]);
});
it.each([{ chart_id: connection }, { state: 'confirmed' }, { review_version: 1 }, { observation: receipt }, { content_hash: 'invalid' },
  { dispatched_at: 'yesterday' }, { connection_revision: 3 }, { identity: { ...row.identity, origin: 'https://attacker.test' } },
  { patient_id: ' patient-1' }])('rejects malformed or mismatched attempt %j', async change => {
  const { backend } = fixture({ rows: [{ ...row, ...change }], next_cursor: null });
  await expect(backend.page({ chart_id: chart })).rejects.toEqual({ code: 'unknown' });
});
it.each([{ rows: [row, row], next_cursor: null }, { rows: [row], next_cursor: attempt }, { rows: [], next_cursor: attempt }])('rejects invalid pagination %j', async page => {
  await expect(fixture(page).backend.page({ chart_id: chart })).rejects.toEqual({ code: 'unknown' });
});
it('rejects a page going backwards or a receipt attached to another attempt', async () => {
  await expect(fixture({ rows: [row], next_cursor: null }).backend.page({ chart_id: chart, cursor: attempt })).rejects.toEqual({ code: 'unknown' });
  const reviewed = { ...row, review_version: 1, observation: { ...receipt, attempt_id: connection } };
  await expect(fixture({ rows: [reviewed], next_cursor: null }).backend.page({ chart_id: chart })).rejects.toEqual({ code: 'unknown' });
});
it('accepts a reviewed unknown but never promotes its state', async () => {
  const reviewed = { ...row, review_version: 1, observation: receipt };
  expect((await fixture({ rows: [reviewed], next_cursor: null }).backend.page({ chart_id: chart })).rows[0]).toEqual(reviewed);
});
it.each([{ chart_id: connection }, { attempt_id: connection }, { version: 2 }, { observation: 'present' }, { request_id: connection }, { note: 'Changed' }])('rejects mismatched write receipt %j', async change => {
  await expect(fixture({ ...receipt, ...change }).backend.observe(command)).rejects.toEqual({ code: 'unknown' });
});
it.each([{ note: '' }, { note: 'x'.repeat(201) }, { note: 'has\nnewline' }, { expected_version: -1 }])('rejects invalid input before any RPC %j', async change => {
  const { backend, rpc } = fixture(receipt);
  await expect(backend.observe({ ...command, ...change })).rejects.toEqual({ code: 'invalid' });
  expect(rpc).not.toHaveBeenCalled();
});
it.each([
  [{ code: 'PGRST202' }, 'schema'], [{ message: 'pims_forbidden' }, 'forbidden'],
  [{ message: 'pims_conflict' }, 'conflict'], [{ message: 'pims_idempotency' }, 'conflict'],
  [{ message: 'pims_invalid' }, 'invalid'], [{ message: 'sensitive database detail' }, 'unknown'],
])('maps RPC errors without leaking server text', async (error, code) => {
  const backend = createUploadReviewBackend({ rpc: async () => ({ data: null, error }) });
  await expect(backend.page({ chart_id: chart })).rejects.toEqual({ code });
});
it('treats a lost write acknowledgement as unknown without automatic retries', async () => {
  const rpc = vi.fn(async () => { throw new TypeError(); });
  await expect(createUploadReviewBackend({ rpc }).observe(command)).rejects.toEqual({ code: 'unknown' });
  expect(rpc).toHaveBeenCalledTimes(1);
});
