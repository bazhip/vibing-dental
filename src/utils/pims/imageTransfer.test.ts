// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { transferReviewedImage, type ImageTransferProvider, type ImageTransferTarget } from './imageTransfer';
import { prepareImage, prepareImageTransfer, type ImageStore } from './images';

const target: ImageTransferTarget = { connection_id: 'connection', connection_revision: 2, provider: 'ezyvet',
  origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic-1', patient_id: 'patient-1', encounter_id: 'encounter-1',
  destination: 'Medical Notes', document_generation: 'page-1' };
async function fixture() {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
  const bytes = new Uint8Array(33);
  bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
  const header = new DataView(bytes.buffer); header.setUint32(16,20); header.setUint32(20,10);
  const blob = new Blob([bytes], { type: 'image/png' });
  const image = { id: 'image-1', chart_id: 'chart-1', path: 'owner/chart-1/image.png', caption: '', kind: 'photo' as const, original_path: null };
  const source = { chart_id: 'chart-1', hash: 'a'.repeat(64), patient_name: 'Milo', patient_number: 'P-1' };
  const store: ImageStore = { context: vi.fn(async () => source), list: vi.fn(async () => [image]), read: vi.fn(async () => image), download: vi.fn(async () => blob) };
  const decode = vi.fn(async () => ({ width: 20, height: 10 }));
  const prepared = await prepareImageTransfer(store, await prepareImage(store, 'chart-1', 'image-1', decode), () => true, decode);
  let attempt: Record<string, unknown>;
  const rpc = vi.fn(async (name: string, args: { payload: unknown }): Promise<{ data: any; error: null }> => {
    if (name === 'pims_prepare_image_transfer') {
      attempt = { ...args.payload as object, id: 'attempt-1', state: 'prepared', expires_at: new Date(Date.now() + 290000).toISOString(),
        identity: { provider: target.provider, origin: target.origin, tenant_id: target.tenant_id, connection_revision: target.connection_revision } };
      return { data: { created: true, attempt }, error: null };
    }
    if (name === 'pims_dispatch_image_transfer') return { data: { execute: true, attempt: { ...attempt, state: 'unknown' } }, error: null };
    return { data: { ...attempt, state: 'confirmed', resource_id: 'file-1' }, error: null };
  });
  const provider = { readTarget: vi.fn(async () => ({ ...target })), readTargetNow: vi.fn(() => ({ ...target })),
    write: vi.fn((_input: Parameters<ImageTransferProvider['write']>[0]) => ({ receipt: Promise.resolve({ resource_id: 'file-1' }) })),
    readSaved: vi.fn(async () => ({ target: { ...target }, content_hash: prepared.transfer.contentHash, saved: true })) };
  const input = { target, prepared, store, decode, chart_link_version: 1, client: { rpc }, provider, alive: () => true };
  return { input, rpc, provider, store, source };
}
afterEach(() => vi.unstubAllEnvs());
it('claims once, writes the reviewed PNG and independently reads saved content before confirmation', async () => {
  const { input, rpc, provider } = await fixture();
  expect(await transferReviewedImage(input)).toEqual({ state: 'confirmed', attempt_id: 'attempt-1', resource_id: 'file-1' });
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(['pims_prepare_image_transfer', 'pims_dispatch_image_transfer', 'pims_confirm_image_transfer']);
  expect(provider.write).toHaveBeenCalledOnce();
  expect(provider.readSaved).toHaveBeenCalledExactlyOnceWith('file-1');
  expect(provider.write.mock.calls[0][0]).toMatchObject({ target, content_hash: input.prepared.transfer.contentHash, pngDataUrl: expect.stringMatching(/^data:image\/png;base64,/) });
});
it.each(['unknown', 'confirmed', 'prepared'])('never dispatches a duplicate %s claim, even with a fresh UUID', async (state) => {
  const { input, rpc, provider } = await fixture();
  rpc.mockResolvedValueOnce({ data: { created: false, attempt: { id: 'old-attempt', state } }, error: null });
  expect(await transferReviewedImage(input)).toEqual({ state: 'duplicate', attempt_id: 'old-attempt' });
  expect(provider.write).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledOnce();
});
it.each(['tenant_id', 'patient_id', 'encounter_id', 'destination', 'document_generation', 'origin', 'connection_id'])('rejects %s drift before any claim', async (field) => {
  const { input, rpc, provider } = await fixture();
  provider.readTarget.mockResolvedValue({ ...target, [field]: 'changed' });
  expect(await transferReviewedImage(input)).toEqual({ state: 'blocked' });
  expect(rpc).not.toHaveBeenCalled(); expect(provider.write).not.toHaveBeenCalled();
});
it('never writes if the source changed after the durable claim', async () => {
  const { input, rpc, provider, store, source } = await fixture();
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => {
    const result = await original(name, args);
    if (name === 'pims_prepare_image_transfer') vi.mocked(store.context).mockResolvedValue({ ...source, hash: 'b'.repeat(64) });
    return result;
  });
  expect((await transferReviewedImage(input)).state).toBe('blocked');
  expect(provider.write).not.toHaveBeenCalled();
});
it('keeps a lost dispatch acknowledgement unknown without writing', async () => {
  const { input, rpc, provider } = await fixture(); const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => {
    if (name === 'pims_dispatch_image_transfer') throw new TypeError();
    return original(name, args);
  });
  expect(await transferReviewedImage(input)).toEqual({ state: 'unknown', attempt_id: 'attempt-1' });
  expect(provider.write).not.toHaveBeenCalled();
});
it('checks a synchronous target observer after final source revalidation and before writing', async () => {
  const { input, rpc, provider, store, source } = await fixture();
  const original = rpc.getMockImplementation()!;
  let dispatched = false;
  let targetChecks = 0;
  let changeDuringSource = false;
  let currentTarget = { ...target };
  Object.assign(provider, { readTargetNow: () => ({ ...currentTarget }) });
  rpc.mockImplementation(async (name, args) => {
    const result = await original(name, args);
    if (name === 'pims_dispatch_image_transfer') dispatched = true;
    return result;
  });
  provider.readTarget.mockImplementation(async () => {
    if (dispatched && ++targetChecks === 2) changeDuringSource = true;
    return { ...currentTarget };
  });
  vi.mocked(store.context).mockImplementation(async () => {
    if (changeDuringSource) currentTarget = { ...target, encounter_id: 'encounter-2' };
    return source;
  });
  expect(await transferReviewedImage(input)).toEqual({ state: 'unknown', attempt_id: 'attempt-1' });
  expect(provider.write).not.toHaveBeenCalled();
});
it.each(['hash', 'attachment', 'access'])('revalidates source %s after the final asynchronous target check', async (change) => {
  const { input, rpc, provider, store, source } = await fixture();
  const original = rpc.getMockImplementation()!;
  let dispatched = false;
  let targetChecks = 0;
  rpc.mockImplementation(async (name, args) => {
    const result = await original(name, args);
    if (name === 'pims_dispatch_image_transfer') dispatched = true;
    return result;
  });
  provider.readTarget.mockImplementation(async () => {
    if (dispatched && ++targetChecks === 2) {
      if (change === 'hash') vi.mocked(store.context).mockResolvedValue({ ...source, hash: 'b'.repeat(64) });
      if (change === 'attachment') vi.mocked(store.read).mockResolvedValue(null as never);
      if (change === 'access') vi.mocked(store.context).mockRejectedValue(new TypeError());
    }
    return { ...target };
  });
  expect(await transferReviewedImage(input)).toEqual({ state: 'unknown', attempt_id: 'attempt-1' });
  expect(provider.write).not.toHaveBeenCalled();
});
it('does not treat a successful write receipt as independently saved evidence', async () => {
  const { input, rpc, provider } = await fixture();
  provider.readSaved.mockResolvedValue(null as never);
  expect(await transferReviewedImage(input)).toEqual({ state: 'unknown', attempt_id: 'attempt-1' });
  expect(rpc).toHaveBeenCalledTimes(2); expect(provider.write).toHaveBeenCalledOnce();
});
it.each(['identity', 'hash', 'unsaved', 'write-error', 'confirmation-error'])('leaves %s as unknown, never retries writes', async (failure) => {
  const { input, rpc, provider } = await fixture();
  if (failure === 'identity') provider.readSaved.mockResolvedValue({ target: { ...target, encounter_id: 'other' }, content_hash: input.prepared.transfer.contentHash, saved: true });
  if (failure === 'hash') provider.readSaved.mockResolvedValue({ target, content_hash: 'b'.repeat(64), saved: true });
  if (failure === 'unsaved') provider.readSaved.mockResolvedValue({ target, content_hash: input.prepared.transfer.contentHash, saved: false });
  if (failure === 'write-error') provider.write.mockImplementation(() => ({ receipt: Promise.reject(new TypeError()) }));
  if (failure === 'confirmation-error') {
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (name, args) => { if (name === 'pims_confirm_image_transfer') throw new TypeError(); return original(name, args); });
  }
  expect(await transferReviewedImage(input)).toEqual({ state: 'unknown', attempt_id: 'attempt-1' });
  expect(provider.write).toHaveBeenCalledOnce();
});
it('fails closed for no review, no saved-content observer, disabled rollout and expired claims', async () => {
  const { input, rpc, provider } = await fixture();
  expect((await transferReviewedImage({ ...input, prepared: { ...input.prepared, transfer: undefined } })).state).toBe('blocked');
  expect((await transferReviewedImage({ ...input, provider: { ...provider, readSaved: undefined } as never })).state).toBe('blocked');
  expect((await transferReviewedImage({ ...input, provider: { ...provider, readTargetNow: undefined } as never })).state).toBe('blocked');
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'false');
  expect((await transferReviewedImage(input)).state).toBe('blocked');
  expect(rpc).not.toHaveBeenCalled(); expect(provider.write).not.toHaveBeenCalled();
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation(async (name, args) => {
    const result = await original(name, args);
    if (name === 'pims_prepare_image_transfer') result.data.attempt.expires_at = new Date(0).toISOString();
    return result;
  });
  expect((await transferReviewedImage(input)).state).toBe('blocked');
  expect(provider.write).not.toHaveBeenCalled();
});
