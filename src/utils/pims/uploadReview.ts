import { identifyPims } from '../../extension/pims/hosts';
import type { RpcClient, SyncIdentity } from './sync';

export type UploadObservationKind = 'present' | 'not_found' | 'uncertain';
export type UploadObservation = {
  request_id: string; chart_id: string; attempt_id: string; version: number;
  observation: UploadObservationKind; note: string; actor_id: string; created_at: string;
};
type UploadReviewBase = {
  id: string; chart_id: string; connection_id: string; connection_revision: number; identity: SyncIdentity;
  patient_id: string; content_hash: string;
  dispatched_at: string; state: 'unknown'; review_version: number; observation: UploadObservation | null;
};
export type UploadReviewItem = UploadReviewBase & (
  { kind?: 'pdf'; location_id: string; draft_id: string; draft_version: number }
  | { kind: 'image'; encounter_id: string; destination: string; document_generation: string; image_id: string }
);
export type UploadReviewPage = { rows: UploadReviewItem[]; next_cursor: string | null };
export type UploadObservationInput = {
  chart_id: string; attempt_id: string; request_id: string; expected_version: number; observation: UploadObservationKind; note: string;
};
export type UploadReviewBackend = {
  page(input: { chart_id: string; cursor?: string }): Promise<UploadReviewPage>;
  observe(input: UploadObservationInput): Promise<UploadObservation>;
};
export type UploadReviewError = 'schema' | 'forbidden' | 'conflict' | 'invalid' | 'unknown';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const version = (value: unknown, minimum = 1): value is number => Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= 999999999;
const instant = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const validObservationKind = (value: unknown): value is UploadObservationKind => value === 'present' || value === 'not_found' || value === 'uncertain';
export function uploadReviewError(cause: unknown): UploadReviewError {
  return record(cause) && ['schema','forbidden','conflict','invalid'].includes(String(cause.code)) ? cause.code as UploadReviewError : 'unknown';
}
function validObservation(value: unknown): value is UploadObservation {
  return record(value) && ['request_id','chart_id','attempt_id','actor_id'].every(key => uuid(value[key]))
    && version(value.version) && validObservationKind(value.observation) && text(value.note) && instant(value.created_at);
}
function validItem(value: unknown, chartId: string, reviewKind: 'pdf' | 'image'): value is UploadReviewItem {
  if (!record(value) || !['id','chart_id','connection_id'].every(key => uuid(value[key])) || value.chart_id !== chartId
    || !version(value.connection_revision) || !version(value.review_version, 0)
    || !text(value.patient_id) || !instant(value.dispatched_at) || value.state !== 'unknown'
    || typeof value.content_hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.content_hash)) return false;
  if (reviewKind === 'image') {
    if (value.kind !== 'image' || !uuid(value.image_id) || !text(value.encounter_id)
      || !text(value.destination) || !text(value.document_generation)) return false;
  } else if (value.kind !== undefined && value.kind !== 'pdf' || !uuid(value.draft_id)
    || !version(value.draft_version) || !text(value.location_id)) return false;
  const identity = value.identity;
  try {
    if (!record(identity) || identity.provider !== (reviewKind === 'image' ? 'ezyvet' : 'instinct') || !text(identity.tenant_id) || !text(identity.origin)
      || identity.connection_revision !== value.connection_revision || identifyPims(identity.origin) !== identity.provider
      || new URL(identity.origin).origin !== identity.origin) return false;
  } catch { return false; }
  return value.review_version === 0 ? value.observation === null : validObservation(value.observation)
    && value.observation.attempt_id === value.id && value.observation.chart_id === chartId && value.observation.version === value.review_version;
}
export function createUploadReviewBackend(client: RpcClient, kind: 'pdf' | 'image' = 'pdf'): UploadReviewBackend {
  const invoke = async (name: string, payload: unknown): Promise<unknown> => {
    let response;
    try { response = await client.rpc(name, { payload }); } catch { throw { code: 'unknown' }; }
    if (response.error || response.data === null) {
      const error = response.error;
      const code: UploadReviewError = error?.code === 'PGRST202' || error?.code === '42883' ? 'schema'
        : error?.message === 'pims_forbidden' ? 'forbidden'
        : ['pims_conflict','pims_idempotency'].includes(error?.message ?? '') ? 'conflict'
        : error?.message === 'pims_invalid' ? 'invalid' : 'unknown';
      throw { code };
    }
    return response.data;
  };
  return {
    page: async input => {
      if (!uuid(input.chart_id) || input.cursor !== undefined && !uuid(input.cursor)) throw { code: 'invalid' };
      const data = await invoke(kind === 'image' ? 'pims_image_review_page' : 'pims_upload_review_page', input);
      if (!record(data) || !Array.isArray(data.rows) || data.rows.length > 50 || !data.rows.every(value => validItem(value, input.chart_id, kind))) throw { code: 'unknown' };
      const rows = data.rows as UploadReviewItem[];
      if (rows.some((row, index) => row.id <= (index > 0 ? rows[index - 1].id : input.cursor ?? ''))
        || data.next_cursor !== null && (rows.length !== 50 || data.next_cursor !== rows[49].id)) throw { code: 'unknown' };
      return { rows, next_cursor: data.next_cursor as string | null };
    },
    observe: async input => {
      if (![input.chart_id,input.attempt_id,input.request_id].every(uuid) || !version(input.expected_version, 0) || !validObservationKind(input.observation) || !text(input.note)) throw { code: 'invalid' };
      const data = await invoke(kind === 'image' ? 'pims_record_image_observation' : 'pims_record_upload_observation', input);
      if (!validObservation(data) || data.request_id !== input.request_id || data.chart_id !== input.chart_id || data.attempt_id !== input.attempt_id
        || data.version !== input.expected_version + 1 || data.observation !== input.observation || data.note !== input.note) throw { code: 'unknown' };
      return data;
    },
  };
}
