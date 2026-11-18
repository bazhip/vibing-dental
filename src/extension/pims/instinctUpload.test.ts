import { afterEach, expect, it, vi } from 'vitest';
import { createInstinctDocumentUploader } from './instinctUpload';
import { uploadHash, type PdfUpload, type UploadTarget } from '../../utils/pims/uploads';
import type { AdapterContext } from './types';
afterEach(() => vi.restoreAllMocks());
const target: UploadTarget = { connection_id: 'connection', connection_revision: 2, provider: 'instinct', origin: 'https://clinic.instinctvet.cloud',
  tenant_id: 'clinic', patient_id: 'patient', location_id: 'location-2', endpoint: 'https://api.instinctvet.com/graphql' };
async function fixture() {
  const bytes = new Uint8Array(new TextEncoder().encode('%PDF-1.7\nfixture'));
  const request: PdfUpload = { attempt_id: 'attempt', expires_at: new Date(Date.now() + 299000).toISOString(), target, bytes, content_hash: await uploadHash(bytes), label: 'Reviewed history', recorded_at: '2026-11-16T00:00:00Z' };
  const storage: Storage = { length: 1, key: () => 'instinct:user-state', clear: () => {}, removeItem: () => {}, setItem: () => {},
    getItem: () => JSON.stringify({ value: { accessToken: 'secret', practice: { apiUrl: target.endpoint } } }) };
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ data: { uploadChartFile: { id: 'file', patient: { id: 'patient' }, visit: null,
    contentType: 'application/pdf', type: 'MEDICAL', isShared: false, isVoided: false } } }) }) as Response);
  const context: AdapterContext = { doc: document, url: new URL(`${target.origin}/#/patient/patient/charts/documents`), localStorage: storage,
    sessionStorage: storage, fetch: fetcher, wait: async () => {} };
  const observers = { readTarget: vi.fn(async (): Promise<UploadTarget | null> => target), readFile: vi.fn(async () => ({ file_id: 'file', patient_id: target.patient_id, location_id: target.location_id, content_hash: request.content_hash, bytes: new Uint8Array(bytes) })) };
  return { request, context, fetcher, observers };
}
it('uses the recovered multipart contract without the hardcoded location or sharing default', async () => {
  const { request, context, fetcher, observers } = await fixture();
  const provider = createInstinctDocumentUploader(context, observers);
  expect(await provider.upload(request)).toMatchObject({ file_id: 'file', location_id: 'location-2' });
  const init = (fetcher.mock.calls as unknown as [string, RequestInit][])[0][1];
  const form = init.body as FormData;
  expect(JSON.parse(String(form.get('variables'))).params).toMatchObject({ locationId: 'location-2', patientId: 'patient', visitId: null, source: 'ToothOps', isShared: false, file: 'p.a.r.a.m.s.file' });
  expect(form.get('p.a.r.a.m.s.file')).toBeInstanceOf(Blob);
  expect(init.redirect).toBe('error');
  expect(observers.readFile).toHaveBeenCalledWith('file');
  expect(await provider.upload(request)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not write without independently observed clinic/location identity', async () => {
  const { request, context, fetcher } = await fixture();
  const provider = createInstinctDocumentUploader(context);
  expect(await provider.readTarget()).toBeNull();
  expect(await provider.upload(request)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it('never treats GraphQL errors or missing readback as confirmation', async () => {
  const { request, context, fetcher, observers } = await fixture();
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => ({ errors: [{ message: 'private details' }] }) } as Response);
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
  observers.readFile.mockResolvedValueOnce(null as never);
  expect(await createInstinctDocumentUploader(context, observers).upload({ ...request, attempt_id: 'other' })).toBeNull();
});
it('refuses changed patient, endpoint, file hash or session before sending', async () => {
  const { request, context, fetcher, observers } = await fixture();
  const provider = createInstinctDocumentUploader(context, observers);
  expect(await provider.upload({ ...request, content_hash: 'a'.repeat(64) })).toBeNull();
  context.currentUrl = () => new URL(`${target.origin}/#/patient/other/charts/documents`);
  expect(await provider.upload(request)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it('consumes an attempt exactly once under concurrent invocations', async () => {
  const { request, context, fetcher, observers } = await fixture();
  const provider = createInstinctDocumentUploader(context, observers);
  const results = await Promise.all([provider.upload(request), provider.upload(request)]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not confirm a session change during upload or retry the consumed attempt', async () => {
  const { request, context, fetcher, observers } = await fixture();
  const original = fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async () => {
    context.sessionStorage.getItem = () => JSON.stringify({ value: { accessToken: 'other', practice: { apiUrl: target.endpoint } } });
    return original();
  });
  const provider = createInstinctDocumentUploader(context, observers);
  expect(await provider.upload(request)).toBeNull();
  expect(await provider.upload(request)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(observers.readFile).not.toHaveBeenCalled();
});
it('rejects a saved-file receipt for a different location', async () => {
  const { request, context, observers } = await fixture();
  observers.readFile.mockResolvedValue({ file_id: 'file', patient_id: target.patient_id, location_id: 'other', content_hash: request.content_hash, bytes: new Uint8Array(request.bytes) });
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
});
it.each(['missing', 'null', 'array', 'array-buffer', 'data-view', 'other-typed-array', 'spoofed-view', 'different', 'truncated', 'extra', 'oversized'])('rejects %s saved bytes despite a matching claimed hash', async (failure) => {
  const { request, context, observers } = await fixture();
  const saved = await observers.readFile();
  if (failure === 'missing') delete (saved as Partial<typeof saved>).bytes;
  if (failure === 'null') saved.bytes = null as never;
  if (failure === 'array') saved.bytes = Array.from(saved.bytes) as never;
  if (failure === 'array-buffer') saved.bytes = saved.bytes.buffer as never;
  if (failure === 'data-view') saved.bytes = new DataView(saved.bytes.buffer) as never;
  if (failure === 'other-typed-array') saved.bytes = new Uint8ClampedArray(saved.bytes) as never;
  if (failure === 'spoofed-view') saved.bytes = { ...saved.bytes, length: saved.bytes.length, byteLength: saved.bytes.length, [Symbol.toStringTag]: 'Uint8Array' } as never;
  if (failure === 'different') saved.bytes[saved.bytes.length - 1] ^= 1;
  if (failure === 'truncated') saved.bytes = saved.bytes.slice(0, -1);
  if (failure === 'extra') saved.bytes = new Uint8Array([...saved.bytes, 0]);
  if (failure === 'oversized') saved.bytes = new Uint8Array(2097153);
  observers.readFile.mockResolvedValue(saved);
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
});
it.each(['file_id', 'patient_id', 'location_id', 'content_hash'] as const)('rejects a saved-file %s mismatch with matching bytes', async (field) => {
  const { request, context, observers } = await fixture();
  const saved = await observers.readFile();
  saved[field] = 'other';
  observers.readFile.mockResolvedValue(saved);
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
});
it('returns only receipt identity, never saved bytes or observer metadata', async () => {
  const { request, context, observers } = await fixture();
  const saved = { ...await observers.readFile(), private_details: 'not a receipt' };
  observers.readFile.mockResolvedValue(saved);
  const receipt = await createInstinctDocumentUploader(context, observers).upload(request);
  expect(receipt).toEqual({ file_id: 'file', patient_id: 'patient', location_id: 'location-2', content_hash: request.content_hash });
  expect(receipt).not.toBe(saved);
});
it('pins the response file ID before asynchronous saved-file readback', async () => {
  const { request, context, fetcher, observers } = await fixture();
  const response = await (await fetcher()).json();
  fetcher.mockClear();
  fetcher.mockResolvedValue({ ok: true, json: async () => response } as Response);
  const saved = await observers.readFile();
  observers.readFile.mockImplementation(async () => {
    response.data.uploadChartFile.id = 'other-file';
    return { ...saved, file_id: 'other-file' };
  });
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
  expect(observers.readFile).toHaveBeenLastCalledWith('file');
});
it('pins the requested hash before the initial asynchronous hash', async () => {
  const { request, context, fetcher, observers } = await fixture();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  request.content_hash = 'a'.repeat(64);
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
    const result = await digest(algorithm, data);
    request.content_hash = Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
    return result;
  });
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it('does not accept a changed request hash and forged saved hash after dispatch', async () => {
  const { request, context, observers } = await fixture();
  const saved = await observers.readFile();
  saved.bytes[saved.bytes.length - 1] ^= 1;
  const forgedHash = await uploadHash(saved.bytes);
  observers.readFile.mockImplementation(async () => {
    request.content_hash = forgedHash;
    return { ...saved, content_hash: forgedHash };
  });
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
});
it.each(['patient', 'location', 'tenant', 'revision', 'endpoint', 'session', 'navigation', 'unavailable', 'expired'])('rechecks %s after asynchronous saved-byte hashing', async (change) => {
  const { request, context, observers } = await fixture();
  const saved = await observers.readFile(), digest = crypto.subtle.digest.bind(crypto.subtle);
  let readingSaved = false;
  observers.readFile.mockImplementation(async () => { readingSaved = true; return saved; });
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
    const result = await digest(algorithm, data);
    if (readingSaved) {
      if (change === 'patient') observers.readTarget.mockResolvedValue({ ...target, patient_id: 'other' });
      if (change === 'location') observers.readTarget.mockResolvedValue({ ...target, location_id: 'other' });
      if (change === 'tenant') observers.readTarget.mockResolvedValue({ ...target, tenant_id: 'other' });
      if (change === 'revision') observers.readTarget.mockResolvedValue({ ...target, connection_revision: 3 });
      if (change === 'endpoint') observers.readTarget.mockResolvedValue({ ...target, endpoint: 'https://other.instinctvet.com/graphql' });
      if (change === 'session') context.sessionStorage.getItem = () => JSON.stringify({ value: { accessToken: 'other', practice: { apiUrl: target.endpoint } } });
      if (change === 'navigation') context.currentUrl = () => new URL(`${target.origin}/#/patient/other/charts/documents`);
      if (change === 'unavailable') observers.readTarget.mockResolvedValue(null);
      if (change === 'expired') vi.spyOn(Date, 'now').mockReturnValue(Date.parse(request.expires_at));
    }
    return result;
  });
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
});
it('hashes a private copy and returns pinned identity despite readback mutation during hashing', async () => {
  const { request, context, observers } = await fixture();
  const saved = await observers.readFile(), digest = crypto.subtle.digest.bind(crypto.subtle), contentHash = request.content_hash;
  let readingSaved = false;
  observers.readFile.mockImplementation(async () => { readingSaved = true; return saved; });
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, data) => {
    if (readingSaved) {
      saved.bytes.fill(0);
      saved.file_id = 'other';
      saved.content_hash = 'a'.repeat(64);
      request.content_hash = 'b'.repeat(64);
    }
    return digest(algorithm, data);
  });
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toEqual({ file_id: 'file', patient_id: 'patient', location_id: 'location-2', content_hash: contentHash });
});
