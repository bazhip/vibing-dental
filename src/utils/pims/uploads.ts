import { identifyPims } from '../../extension/pims/hosts';
import { pimsRolloutEnabled } from './rollout';
import type { RpcClient, SyncIdentity } from './sync';

export type UploadTarget = SyncIdentity & {
  connection_id: string; patient_id: string; location_id: string; endpoint: string;
};
export type UploadReceipt = { file_id: string; patient_id: string; location_id: string; content_hash: string };
export type PdfUpload = { attempt_id: string; expires_at: string; target: UploadTarget; bytes: Uint8Array<ArrayBuffer>; content_hash: string; label: string; recorded_at: string };
export type UploadProvider = { readTarget(): Promise<UploadTarget | null>; upload(request: PdfUpload): Promise<UploadReceipt | null> };
export type UploadResult = { state: 'blocked' } | { state: 'duplicate' | 'unknown'; attempt_id: string } | { state: 'confirmed'; attempt_id: string; file_id: string };
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
export function sameUploadTarget(left: UploadTarget | null, right: UploadTarget): boolean {
  return !!left && (['connection_id','provider','origin','tenant_id','connection_revision','patient_id','location_id','endpoint'] as const).every(key => left[key] === right[key]);
}
export function validUploadTarget(target: UploadTarget): boolean {
  try {
    const origin = new URL(target.origin), endpoint = new URL(target.endpoint);
    return target.provider === 'instinct' && identifyPims(target.origin) === 'instinct' && origin.origin === target.origin
      && identifyPims(target.endpoint) === 'instinct' && !endpoint.port && !endpoint.search && !endpoint.hash
      && [target.connection_id, target.tenant_id, target.patient_id, target.location_id].every(text)
      && Number.isSafeInteger(target.connection_revision) && target.connection_revision > 0;
  } catch { return false; }
}
export async function uploadHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function validPdfUpload(bytes: Uint8Array<ArrayBuffer>): boolean {
  return ArrayBuffer.isView(bytes) && Object.prototype.toString.call(bytes) === '[object Uint8Array]' && bytes.length > 5 && bytes.length <= 2097152 && [37,80,68,70,45].every((value, index) => bytes[index] === value);
}
export async function transferReviewedPdf(input: {
  target: UploadTarget; chart_id: string; draft_id: string; draft_version: number; chart_link_version: number;
  bytes: Uint8Array<ArrayBuffer>; label: string; recorded_at: string; client: RpcClient; provider: UploadProvider; alive: () => boolean;
}): Promise<UploadResult> {
  let dispatched = false, attemptId: string | undefined, expires = Infinity;
  try {
    if (!pimsRolloutEnabled() || !input.alive() || !validUploadTarget(input.target) || !validPdfUpload(input.bytes)
      || !text(input.label) || !Number.isFinite(Date.parse(input.recorded_at))) return { state: 'blocked' };
    const target = { ...input.target }, bytes = new Uint8Array(input.bytes);
    const contentHash = await uploadHash(bytes);
    const guard = async () => {
      if (!input.alive() || Date.now() >= expires || !sameUploadTarget(await input.provider.readTarget(), target) || !input.alive() || Date.now() >= expires) throw new TypeError();
    };
    const invoke = async (name: string, payload: unknown) => {
      if (!input.alive()) throw new TypeError();
      const result = await input.client.rpc(name, { payload });
      if (!input.alive() || result.error || !result.data || typeof result.data !== 'object') throw new TypeError();
      return result.data as Record<string, unknown>;
    };
    const payload = { request_id: crypto.randomUUID(), connection_id: target.connection_id, connection_revision: target.connection_revision,
      chart_id: input.chart_id, draft_id: input.draft_id, draft_version: input.draft_version, patient_id: target.patient_id,
      chart_link_version: input.chart_link_version, location_id: target.location_id, endpoint: target.endpoint, content_hash: contentHash, content_bytes: bytes.length };
    const matches = (value: unknown): value is Record<string, unknown> => {
      if (!value || typeof value !== 'object') return false;
      const attempt = value as Record<string, unknown>, identity = attempt.identity as SyncIdentity | null;
      return text(attempt.id) && Object.entries(payload).filter(([key]) => key !== 'request_id').every(([key, expected]) => attempt[key] === expected)
        && identity?.provider === target.provider && identity.origin === target.origin && identity.tenant_id === target.tenant_id && identity.connection_revision === target.connection_revision;
    };
    await guard();
    const prepared = await invoke('pims_prepare_upload', payload);
    if (prepared.created === false && prepared.attempt && typeof prepared.attempt === 'object' && text((prepared.attempt as Record<string, unknown>).id)
      && (!matches(prepared.attempt) || prepared.attempt.state !== 'prepared')) {
      return { state: 'duplicate', attempt_id: (prepared.attempt as { id: string }).id };
    }
    if (typeof prepared.created !== 'boolean' || !matches(prepared.attempt) || prepared.attempt.state !== 'prepared' || typeof prepared.attempt.expires_at !== 'string') throw new TypeError();
    expires = Date.parse(prepared.attempt.expires_at);
    if (!Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 300000) throw new TypeError();
    attemptId = prepared.attempt.id as string;
    await guard();
    dispatched = true;
    const dispatch = await invoke('pims_dispatch_upload', { attempt_id: attemptId });
    if (dispatch.execute !== true || !matches(dispatch.attempt) || dispatch.attempt.id !== attemptId || dispatch.attempt.state !== 'unknown') return { state: 'unknown', attempt_id: attemptId };
    await guard();
    const receipt = await input.provider.upload({ attempt_id: attemptId, expires_at: prepared.attempt.expires_at, target, bytes, content_hash: contentHash, label: input.label, recorded_at: input.recorded_at });
    await guard();
    if (!receipt || !text(receipt.file_id) || receipt.patient_id !== target.patient_id || receipt.location_id !== target.location_id || receipt.content_hash !== contentHash) throw new TypeError();
    const saved = await invoke('pims_confirm_upload', { attempt_id: attemptId, file_id: receipt.file_id, patient_id: target.patient_id, content_hash: contentHash });
    if (!matches(saved) || saved.id !== attemptId || saved.state !== 'confirmed' || saved.file_id !== receipt.file_id) throw new TypeError();
    return { state: 'confirmed', attempt_id: attemptId, file_id: receipt.file_id };
  } catch { return dispatched && attemptId ? { state: 'unknown', attempt_id: attemptId } : { state: 'blocked' }; }
}
