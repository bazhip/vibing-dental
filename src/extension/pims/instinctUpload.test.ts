import { expect, it, vi } from 'vitest';
import { createInstinctDocumentUploader } from './instinctUpload';
import { uploadHash, type PdfUpload, type UploadTarget } from '../../utils/pims/uploads';
import type { AdapterContext } from './types';
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
  const observers = { readTarget: vi.fn(async () => target), readFile: vi.fn(async () => ({ file_id: 'file', patient_id: target.patient_id, location_id: target.location_id, content_hash: request.content_hash })) };
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
  observers.readFile.mockResolvedValue({ file_id: 'file', patient_id: target.patient_id, location_id: 'other', content_hash: request.content_hash });
  expect(await createInstinctDocumentUploader(context, observers).upload(request)).toBeNull();
});
