import { afterEach, expect, it, vi } from 'vitest';
import { uploadReviewedDraft } from './reviewedUpload';
import type { PdfUpload, UploadTarget } from './uploads';

const target: UploadTarget = { connection_id: 'connection', provider: 'instinct', origin: 'https://clinic.instinctvet.cloud', tenant_id: 'clinic',
  connection_revision: 2, patient_id: 'patient', location_id: 'location', endpoint: 'https://api.instinctvet.com/graphql' };
const source = { chart_id: 'chart', practice_id: 'practice', patient_name: 'Milo', patient_number: 'P-1', chart_date: '2026-11-16',
  updated_at: '2026-11-16T12:00:00Z', hash: 'a'.repeat(64) };
const draft = { id: 'draft', chart_id: 'chart', practice_id: 'practice', kind: 'history', language: 'en', body: 'Reviewed findings',
  source_hash: source.hash, source, version: 2, reviewed_version: 2, reviewed_by: 'vet', reviewed_at: source.updated_at };
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
  let attempt: Record<string, unknown>;
  const rpc = vi.fn(async (name: string, args: { payload: unknown }) => {
    if (name === 'pims_draft_export') return { data: draft, error: null };
    if (name === 'pims_prepare_upload') {
      attempt = { ...args.payload as object, id: 'attempt', state: 'prepared', expires_at: new Date(Date.now() + 299000).toISOString(), identity: target };
      return { data: { created: true, attempt }, error: null };
    }
    if (name === 'pims_dispatch_upload') return { data: { execute: true, attempt: { ...attempt, state: 'unknown' } }, error: null };
    return { data: { ...attempt, state: 'confirmed', file_id: 'file' }, error: null };
  });
  const provider = { readTarget: vi.fn(async () => target), upload: vi.fn(async (request: PdfUpload) => ({ file_id: 'file',
    patient_id: target.patient_id, location_id: target.location_id, content_hash: request.content_hash })) };
  return { rpc, provider, input: { target, chart_id: 'chart', draft_id: 'draft', expected_version: 2, chart_link_version: 1,
    client: { rpc }, provider, alive: () => true } };
}
it('renders only a persisted reviewed draft and revalidates it before preparing the upload', async () => {
  const { input, rpc, provider } = fixture();
  expect(await uploadReviewedDraft(input)).toEqual({ state: 'confirmed', attempt_id: 'attempt', file_id: 'file' });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(['pims_draft_export', 'pims_draft_export', 'pims_prepare_upload', 'pims_dispatch_upload', 'pims_confirm_upload']);
  expect(new TextDecoder().decode(provider.upload.mock.calls[0][0].bytes.slice(0, 5))).toBe('%PDF-');
});
it.each(['stale', 'changed', 'auth', 'unreviewed'])('blocks %s drafts without preparing or writing', async (mode) => {
  const { input, rpc, provider } = fixture();
  let alive = true, exports = 0;
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => {
    if (name === 'pims_draft_export') {
      exports++;
      if (mode === 'auth') alive = false;
      if (mode === 'unreviewed') return { data: { ...draft, reviewed_version: null, reviewed_by: null, reviewed_at: null }, error: null } as never;
      if (exports === 2 && mode === 'stale') throw { code: 'stale' };
      if (exports === 2 && mode === 'changed') return { data: { ...draft, body: 'Different contents' }, error: null } as never;
    }
    return original(name, args);
  });
  expect(await uploadReviewedDraft({ ...input, alive: () => alive })).toEqual({ state: 'blocked' });
  expect(rpc.mock.calls.every(([name]) => name === 'pims_draft_export')).toBe(true);
  expect(provider.upload).not.toHaveBeenCalled();
});
it('does not load clinical data when rollout is disabled', async () => {
  const { input, rpc } = fixture();
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'false');
  expect(await uploadReviewedDraft(input)).toEqual({ state: 'blocked' });
  expect(rpc).not.toHaveBeenCalled();
});
