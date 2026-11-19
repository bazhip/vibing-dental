import { identifyPims } from './hosts';
import { readJson } from './shared';
import type { AdapterContext } from './types';
import { sameUploadTarget, uploadHash, validPdfUpload, validUploadTarget } from '../../utils/pims/uploads';
import type { UploadProvider, UploadReceipt, UploadTarget } from '../../utils/pims/uploads';

type Observers = { readTarget(): Promise<UploadTarget | null>; readFile(fileId: string): Promise<(UploadReceipt & { bytes: Uint8Array<ArrayBuffer> }) | null> };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const mutation = `mutation uploadChartFile($params: UploadChartFileParams) {
  uploadChartFile(params: $params) { id patient { id } visit { id patient { id } } contentType type isShared isVoided }
}`;

export function createInstinctDocumentUploader(context: AdapterContext, observers?: Observers): UploadProvider {
  const consumed = new Set<string>(), initialUrl = context.url.href;
  let initialSession: string | undefined;
  const session = () => {
    const current = context.currentUrl?.() ?? context.url;
    if (current.href !== initialUrl || identifyPims(current.href) !== 'instinct') throw new TypeError();
    const raw = context.sessionStorage.getItem('instinct:user-state');
    const state: unknown = JSON.parse(raw ?? 'null');
    if (!record(state) || !record(state.value) || !record(state.value.practice)) throw new TypeError();
    const { accessToken, practice } = state.value;
    if (typeof accessToken !== 'string' || !accessToken.trim() || typeof practice.apiUrl !== 'string') throw new TypeError();
    const endpoint = new URL(practice.apiUrl);
    if (identifyPims(endpoint.href) !== 'instinct' || endpoint.port || endpoint.search || endpoint.hash) throw new TypeError();
    const match = /^#\/patient\/([^/?#\s]+)\/charts(?:[/?]|$)/.exec(current.hash);
    if (!match) throw new TypeError();
    const fingerprint = JSON.stringify([accessToken, endpoint.href]);
    if (initialSession !== undefined && initialSession !== fingerprint) throw new TypeError();
    initialSession = fingerprint;
    return { token: accessToken, endpoint: endpoint.href, patient: decodeURIComponent(match[1]), origin: current.origin };
  };
  const readTarget = async (): Promise<UploadTarget | null> => {
    if (!observers) return null;
    try {
      const before = session(), observed = await observers.readTarget(), after = session();
      if (!observed || !validUploadTarget(observed) || before.token !== after.token || observed.endpoint !== after.endpoint
        || observed.origin !== after.origin || observed.patient_id !== after.patient) return null;
      return { ...observed };
    } catch { return null; }
  };
  return {
    readTarget,
    upload: async (request) => {
      try {
        const target = { ...request.target }, bytes = new Uint8Array(request.bytes), contentHash = request.content_hash;
        const expires = Date.parse(request.expires_at);
        if (!observers || !validPdfUpload(bytes) || typeof request.attempt_id !== 'string' || !request.attempt_id || consumed.has(request.attempt_id) || consumed.size >= 256
          || !Number.isFinite(expires) || Date.now() >= expires || !request.label.trim() || request.label.length > 200 || !Number.isFinite(Date.parse(request.recorded_at))
          || await uploadHash(bytes) !== contentHash || !sameUploadTarget(await readTarget(), target)) return null;
        const current = session();
        const body = new FormData();
        body.append('query', mutation);
        body.append('variables', JSON.stringify({ params: { visitId: null, patientId: target.patient_id, locationId: target.location_id,
          source: 'ToothOps', file: 'p.a.r.a.m.s.file', label: request.label, type: 'MEDICAL', contentType: 'application/pdf', recordedAt: request.recorded_at, isShared: false } }));
        body.append('p.a.r.a.m.s.file', new Blob([bytes], { type: 'application/pdf' }), 'ToothOps-record.pdf');
        if (!sameUploadTarget(await readTarget(), target) || session().token !== current.token || consumed.has(request.attempt_id) || Date.now() >= expires) return null;
        consumed.add(request.attempt_id);
        const response = await readJson(context, current.endpoint, { method: 'POST', credentials: 'omit', redirect: 'error',
          headers: { authorization: `Bearer ${current.token}` }, body });
        if (!sameUploadTarget(await readTarget(), target) || !record(response) || response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length)
          || !record(response.data) || !record(response.data.uploadChartFile)) return null;
        const file = response.data.uploadChartFile;
        if (typeof file.id !== 'string' || !file.id.trim() || file.id.length > 200 || !record(file.patient) || file.patient.id !== target.patient_id
          || file.visit !== null || file.contentType !== 'application/pdf' || file.type !== 'MEDICAL' || file.isShared !== false || file.isVoided !== false) return null;
        const fileId = file.id, verified = { ...await observers.readFile(fileId) };
        const savedBytes = verified.bytes;
        if (verified.file_id !== fileId || verified.patient_id !== target.patient_id || verified.location_id !== target.location_id
          || verified.content_hash !== contentHash || !savedBytes || !validPdfUpload(savedBytes)
          || savedBytes.byteLength !== bytes.byteLength || Object.prototype.toString.call(savedBytes.buffer) !== '[object ArrayBuffer]') return null;
        if (await uploadHash(new Uint8Array(savedBytes)) !== contentHash || !sameUploadTarget(await readTarget(), target)
          || session().token !== current.token || Date.now() >= expires) return null;
        return { file_id: fileId, patient_id: target.patient_id, location_id: target.location_id, content_hash: contentHash };
      } catch { return null; }
    },
  };
}
