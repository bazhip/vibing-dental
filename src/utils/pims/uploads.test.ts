import { afterEach, expect, it, vi } from 'vitest';
import { transferReviewedPdf, uploadHash, validPdfUpload, validUploadTarget } from './uploads';
import type { PdfUpload, UploadTarget } from './uploads';
const target: UploadTarget = { connection_id: 'connection', connection_revision: 2, provider: 'instinct', origin: 'https://clinic.instinctvet.cloud',
  tenant_id: 'clinic', patient_id: 'patient', location_id: 'location', endpoint: 'https://api.instinctvet.com/graphql' };
const reference = { chart_id: 'chart', draft_id: 'draft', draft_version: 2, chart_link_version: 1 };
const bytes = new TextEncoder().encode('%PDF-1.7\nfixture');
it('validates and hashes the immutable PDF bytes', async () => {
  expect(validUploadTarget(target)).toBe(true);
  expect(validPdfUpload(bytes)).toBe(true);
  expect(await uploadHash(bytes)).toMatch(/^[a-f0-9]{64}$/);
});
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
  let attempt: Record<string, unknown>;
  const rpc = vi.fn(async (name: string, args: { payload: unknown }) => {
    const payload = args.payload as Record<string, unknown>;
    if (name === 'pims_prepare_upload') {
      attempt = { ...payload, id: 'attempt', state: 'prepared', expires_at: new Date(Date.now() + 299000).toISOString(), identity: { provider: target.provider, origin: target.origin, tenant_id: target.tenant_id, connection_revision: 2 } };
      return { data: { created: true, attempt }, error: null };
    }
    if (name === 'pims_dispatch_upload') return { data: { execute: true, attempt: { ...attempt, state: 'unknown' } }, error: null };
    return { data: { ...attempt, state: 'confirmed', file_id: 'file' }, error: null };
  });
  const provider = { readTarget: vi.fn(async () => target), upload: vi.fn(async (request: PdfUpload) => ({ file_id: 'file', patient_id: target.patient_id, location_id: target.location_id, content_hash: request.content_hash })) };
  return { rpc, provider, input: { target, ...reference, bytes, label: 'Reviewed history', recorded_at: '2026-11-16T00:00:00Z', alive: () => true } };
}
it('requires durable one-shot dispatch before invoking a provider upload', async () => {
  const { rpc, provider, input } = fixture();
  expect(await transferReviewedPdf({ ...input, client: { rpc }, provider })).toEqual({ state: 'confirmed', attempt_id: 'attempt', file_id: 'file' });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(['pims_prepare_upload', 'pims_dispatch_upload', 'pims_confirm_upload']);
  expect(provider.upload).toHaveBeenCalledTimes(1);
});
it('never retries a consumed dispatch or an ambiguous provider write', async () => {
  const { rpc, provider, input } = fixture();
  provider.upload.mockRejectedValue({ token: 'private' });
  expect(await transferReviewedPdf({ ...input, client: { rpc }, provider })).toEqual({ state: 'unknown', attempt_id: 'attempt' });
  expect(provider.upload).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledTimes(2);
});
it('does not upload a duplicate, changed target or disabled rollout', async () => {
  const { rpc, provider, input } = fixture();
  provider.readTarget.mockResolvedValue({ ...target, patient_id: 'other' });
  expect((await transferReviewedPdf({ ...input, client: { rpc }, provider })).state).toBe('blocked');
  expect(rpc).not.toHaveBeenCalled();
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'false');
  expect((await transferReviewedPdf({ ...input, client: { rpc }, provider })).state).toBe('blocked');
  expect(provider.upload).not.toHaveBeenCalled();
});
it('does not dispatch an existing attempt, including one from another browser', async () => {
  const { rpc, provider, input } = fixture();
  rpc.mockResolvedValueOnce({ data: { created: false, attempt: { id: 'existing', state: 'unknown' } }, error: null } as never);
  expect(await transferReviewedPdf({ ...input, client: { rpc }, provider })).toEqual({ state: 'duplicate', attempt_id: 'existing' });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(provider.upload).not.toHaveBeenCalled();
});
it('leaves unknown when dispatch acknowledgement is lost or target changes after dispatch', async () => {
  const { rpc, provider, input } = fixture();
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => {
    if (name === 'pims_dispatch_upload') throw new TypeError();
    return original(name, args);
  });
  expect(await transferReviewedPdf({ ...input, client: { rpc }, provider })).toEqual({ state: 'unknown', attempt_id: 'attempt' });
  expect(provider.upload).not.toHaveBeenCalled();
  rpc.mockImplementation(original);
  provider.readTarget.mockReset().mockResolvedValueOnce(target).mockResolvedValueOnce(target).mockResolvedValue({ ...target, location_id: 'other' });
  expect(await transferReviewedPdf({ ...input, client: { rpc }, provider })).toEqual({ state: 'unknown', attempt_id: 'attempt' });
  expect(provider.upload).not.toHaveBeenCalled();
});
it('does not confirm a mismatched receipt', async () => {
  const { rpc, provider, input } = fixture();
  provider.upload.mockResolvedValue({ file_id: 'file', patient_id: 'other', location_id: target.location_id, content_hash: 'a'.repeat(64) });
  expect(await transferReviewedPdf({ ...input, client: { rpc }, provider })).toEqual({ state: 'unknown', attempt_id: 'attempt' });
  expect(rpc).toHaveBeenCalledTimes(2);
});
it('retains unknown after a lost confirmation acknowledgement without uploading again', async () => {
  const { rpc, provider, input } = fixture();
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => {
    if (name === 'pims_confirm_upload') throw new TypeError();
    return original(name, args);
  });
  expect(await transferReviewedPdf({ ...input, client: { rpc }, provider })).toEqual({ state: 'unknown', attempt_id: 'attempt' });
  expect(provider.upload).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledTimes(3);
});
