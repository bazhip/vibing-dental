import { identifyPims } from './hosts';
import { readJson } from './shared';
import type { AdapterContext } from './types';

export type InstinctSubmissionRequest =
  | { operation: 'prepare' }
  | { operation: 'submit'; ticket: string; id: string; expires_at: string; bytes: number[]; label: string;
    recorded_at: string; location_id: string; is_shared?: boolean; source: { chartId: string; draftId: string; version: number } };

export type InstinctSubmissionResult =
  | { state: 'prepared'; ticket: string; patient_id: string; location_id: string; location_source: 'compatibility_default';
    origin: string; expires_at: string }
  | { state: 'blocked' }
  | { state: 'unknown'; id: string }
  | { state: 'submitted'; id: string; file_id?: string };

export type InstinctSubmission = {
  execute(request: InstinctSubmissionRequest): Promise<InstinctSubmissionResult>;
};

type Session = { url: string; origin: string; patient: string; endpoint: string; token: string; fingerprint: string };
type Preparation = { session: Session; expires: number; expires_at: string };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max = 200): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const identifier = (value: unknown): value is string => text(value) && /^[A-Za-z0-9_-]+$/.test(value);
const date = (value: unknown): value is string => text(value, 100) && Number.isFinite(Date.parse(value));
const safeOrigin = (value: unknown): value is string => {
  try {
    if (typeof value !== 'string' || identifyPims(value) !== 'instinct') return false;
    const url = new URL(value);
    return !url.port && value === url.origin;
  } catch { return false; }
};
const pdfBytes = (value: unknown): value is number[] => {
  if (!Array.isArray(value) || value.length <= 5 || value.length > 2097152
    || ![37, 80, 68, 70, 45].every((byte, index) => value[index] === byte)) return false;
  for (let index = 0; index < value.length; index++) {
    if (!Number.isInteger(value[index]) || value[index] < 0 || value[index] > 255) return false;
  }
  return true;
};

export function isInstinctSubmissionRequest(value: unknown): value is InstinctSubmissionRequest {
  if (!record(value)) return false;
  if (value.operation === 'prepare') return true;
  return value.operation === 'submit' && text(value.ticket) && text(value.id) && date(value.expires_at)
    && text(value.label) && date(value.recorded_at) && identifier(value.location_id)
    && (value.is_shared === undefined || typeof value.is_shared === 'boolean')
    && record(value.source) && text(value.source.chartId) && text(value.source.draftId)
    && typeof value.source.version === 'number' && Number.isSafeInteger(value.source.version) && value.source.version >= 0
    && pdfBytes(value.bytes);
}

export function isInstinctSubmissionResult(value: unknown): value is InstinctSubmissionResult {
  if (!record(value)) return false;
  if (value.state === 'blocked') return true;
  if (value.state === 'unknown') return text(value.id);
  if (value.state === 'submitted') return text(value.id) && (value.file_id === undefined || text(value.file_id));
  return value.state === 'prepared' && text(value.ticket) && identifier(value.patient_id) && value.location_id === '1'
    && value.location_source === 'compatibility_default' && safeOrigin(value.origin) && date(value.expires_at);
}

const mutation = `mutation uploadChartFile($params: UploadChartFileParams) {
  uploadChartFile(params: $params) { id }
}`;

export function createInstinctSubmission(context: AdapterContext): InstinctSubmission {
  const initialUrl = context.url.href, tickets = new Map<string, Preparation>(), consumed = new Set<string>(), consumedSources = new Set<string>();
  const session = (): Session => {
    const current = context.currentUrl?.() ?? context.url;
    if (current.href !== initialUrl || identifyPims(current.href) !== 'instinct' || current.port) throw new TypeError();
    const match = /^#\/patient\/([^/?#\s]+)\/charts(?:[/?]|$)/.exec(current.hash);
    const patient = match && decodeURIComponent(match[1]);
    if (!identifier(patient)) throw new TypeError();
    const state: unknown = JSON.parse(context.sessionStorage.getItem('instinct:user-state') ?? 'null');
    if (!record(state) || !record(state.value) || !record(state.value.practice)) throw new TypeError();
    const { accessToken, practice } = state.value;
    if (!text(accessToken, 16384) || typeof practice.apiUrl !== 'string') throw new TypeError();
    const endpoint = new URL(practice.apiUrl);
    if (identifyPims(endpoint.href) !== 'instinct' || endpoint.port || endpoint.search || endpoint.hash) throw new TypeError();
    return { url: current.href, origin: current.origin, patient, endpoint: endpoint.href, token: accessToken,
      fingerprint: JSON.stringify([accessToken, practice]) };
  };
  const matches = (prepared: Preparation): boolean => {
    const current = session();
    return current.url === prepared.session.url && current.patient === prepared.session.patient
      && current.endpoint === prepared.session.endpoint && current.fingerprint === prepared.session.fingerprint;
  };
  return {
    execute: async (request): Promise<InstinctSubmissionResult> => {
      let dispatchedId: string | undefined;
      try {
        if (!isInstinctSubmissionRequest(request)) return { state: 'blocked' };
        if (request.operation === 'prepare') {
          if (tickets.size + consumed.size >= 256) return { state: 'blocked' };
          const current = session(), ticket = crypto.randomUUID(), expires = Date.now() + 300000;
          const expires_at = new Date(expires).toISOString();
          tickets.set(ticket, { session: current, expires, expires_at });
          return { state: 'prepared', ticket, patient_id: current.patient, location_id: '1',
            location_source: 'compatibility_default', origin: current.origin, expires_at };
        }
        if (consumed.has(request.id) || consumed.size >= 256) return { state: 'blocked' };
        const prepared = tickets.get(request.ticket);
        if (!prepared || request.expires_at !== prepared.expires_at || Date.now() >= prepared.expires
          || !matches(prepared)) return { state: 'blocked' };
        const sourceKey = JSON.stringify([prepared.session.origin, prepared.session.patient, request.source.chartId,
          request.source.draftId, request.source.version]);
        if (consumedSources.has(sourceKey)) return { state: 'blocked' };
        const bytes = new Uint8Array(request.bytes);
        const id = request.id, label = request.label, recordedAt = request.recorded_at, locationId = request.location_id,
          isShared = request.is_shared ?? false;
        const body = new FormData();
        body.append('query', mutation);
        body.append('variables', JSON.stringify({ params: { visitId: null, patientId: prepared.session.patient, locationId,
          source: 'ToothOps', file: 'p.a.r.a.m.s.file', label, type: 'MEDICAL', contentType: 'application/pdf', recordedAt, isShared } }));
        body.append('p.a.r.a.m.s.file', new Blob([bytes], { type: 'application/pdf' }), 'ToothOps-record.pdf');
        if (Date.now() >= prepared.expires || !matches(prepared) || consumed.has(id) || !tickets.has(request.ticket)) return { state: 'blocked' };
        tickets.delete(request.ticket);
        consumed.add(id);
        consumedSources.add(sourceKey);
        dispatchedId = id;
        const response = await readJson(context, prepared.session.endpoint, { method: 'POST', credentials: 'omit', redirect: 'error',
          headers: { authorization: `Bearer ${prepared.session.token}` }, body });
        if (!matches(prepared) || !record(response)
          || response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length > 0)
          || response.data !== undefined && !record(response.data)) return { state: 'unknown', id };
        const file = record(response.data) ? response.data.uploadChartFile : undefined;
        if (!record(file)) return { state: 'unknown', id };
        return text(file.id) ? { state: 'submitted', id, file_id: file.id } : { state: 'submitted', id };
      } catch {
        return dispatchedId === undefined ? { state: 'blocked' } : { state: 'unknown', id: dispatchedId };
      }
    },
  };
}
