import type { PimsId } from '../../extension/pims/types';

export type SyncScope = { requested_date: string; timezone: string; window_start: string; window_end: string };
export type SyncIdentity = { provider: PimsId; origin: string; tenant_id: string; connection_revision: number };
export type SyncCompleteness = 'complete' | 'partial' | 'unknown';
export type SyncTicket = {
  id: string; connection_id: string; connection_revision: number; generation: number;
  started_at: string; expires_at: string; scope: SyncScope;
  state: 'capturing' | 'saving' | 'completed' | 'abandoned' | 'expired' | 'interrupted';
  completeness?: SyncCompleteness;
};
export type ObservedAppointment = {
  appointment_id: string; patient_id: string; clinician_id: string; encounter_id: string | null;
  starts_at: string; ends_at: string; status: 'active' | 'cancelled' | 'deleted' | 'unknown';
};
export type SyncFailure = { appointment_id: string | null; code: 'read_failed' | 'identity_missing' | 'unsupported' };
export type SyncCapture = {
  protocol: 1; generation: number; captured_at: string; identity: SyncIdentity; scope: SyncScope;
  completeness: SyncCompleteness; items: ObservedAppointment[]; failures: SyncFailure[];
};
export type AppointmentStatus =
  | { appointment_id: string; status: 'active'; appointment: ObservedAppointment }
  | { appointment_id: string; status: 'cancelled' | 'deleted' | 'unknown' };
export type SyncSource = {
  readIdentity(): Promise<SyncIdentity>;
  capture(ticket: SyncTicket): Promise<SyncCapture>;
  lookupStatus?(request: { ticket: SyncTicket; appointment_ids: string[] }): Promise<{
    protocol: 1; generation: number; captured_at: string; identity: SyncIdentity; items: AppointmentStatus[];
  }>;
};
export type SyncBaseline = {
  patient_links: { patient_id: string; version: number }[];
  clinician_links: { clinician_id: string; version: number }[];
  visits: { appointment_id: string; version: number }[];
};
export type SyncItem = ObservedAppointment & { expected_version: number; patient_link_version: number; clinician_link_version: number };
export type SyncOutcome = { appointment_id: string; outcome: 'applied' | 'unchanged' | 'conflict' | 'skipped'; version: number; reason?: string };
type StartRequest = { connection_id: string; request_id: string; scope: SyncScope };
type RunReference = { run_id: string; generation: number };
type SubmitRequest = RunReference & { request_id: string; captured_at: string; identity: SyncIdentity; scope: SyncScope; items: SyncItem[] };
type ChunkResult = { run_id: string; request_id: string; outcomes: SyncOutcome[] };
type FinishRequest = RunReference & { state: 'completed' | 'abandoned'; completeness: SyncCompleteness };
export type ReconcileCandidate = { appointment_id: string; version: number; patient_link_version: number; clinician_link_version: number };
type CandidatePage = { rows: ReconcileCandidate[]; next_cursor: string | null };
type ReconcileRequest = RunReference & Omit<ReconcileCandidate, 'version'> & {
  request_id: string; expected_version: number; captured_at: string; identity: SyncIdentity;
  status: ObservedAppointment['status']; appointment?: ObservedAppointment;
};
export type SyncBackend = {
  start(request: StartRequest): Promise<SyncTicket>;
  baseline(request: RunReference): Promise<SyncBaseline>;
  submit(request: SubmitRequest): Promise<ChunkResult>;
  seal(request: RunReference & { completeness: SyncCompleteness }): Promise<SyncTicket>;
  candidates(request: RunReference & { cursor?: string }): Promise<CandidatePage>;
  reconcile(request: ReconcileRequest): Promise<SyncOutcome>;
  finish(request: FinishRequest): Promise<SyncTicket>;
};
export type RpcClient = { rpc(name: string, args: { payload: unknown }): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
type BaselinePage = { rows: { external_id: string; version: number }[]; next_cursor: string | null };

export function createSyncBackend(client: RpcClient): SyncBackend {
  const invoke = async <Result>(name: string, payload: unknown): Promise<Result> => {
    const { data, error } = await client.rpc(name, { payload });
    if (error || data === null) {
      const known = ['pims_forbidden','pims_invalid','pims_unverified','pims_disabled','pims_identity','pims_stale','pims_busy','pims_idempotency','pims_conflict','pims_limit'];
      const code = error?.code === 'PGRST202' || error?.code === '42883' ? 'schema_unavailable'
        : error?.message && known.includes(error.message) ? error.message : 'backend_failed';
      throw { code };
    }
    return data as Result;
  };
  return {
    start: (payload) => invoke('pims_start_sync', payload),
    baseline: async (payload) => {
      const read = async (collection: 'patient_links' | 'clinician_links' | 'visits') => {
        const rows: BaselinePage['rows'] = [], cursors = new Set<string>();
        let cursor: string | null = null;
        do {
          const page: BaselinePage = await invoke('pims_sync_baseline', { ...payload, collection, ...(cursor ? { cursor } : {}) });
          if (!page || !Array.isArray(page.rows) || page.rows.length > 1000 || page.rows.some((row) => !row || !validId(row.external_id) || !Number.isInteger(row.version) || row.version < 1)
              || (page.next_cursor !== null && (!validId(page.next_cursor) || cursors.has(page.next_cursor) || page.rows.length === 0))) throw { code: 'backend_failed' };
          rows.push(...page.rows);
          cursor = page.next_cursor;
          if (cursor) cursors.add(cursor);
        } while (cursor);
        return rows;
      };
      const patient_links = (await read('patient_links')).map(({ external_id, version }) => ({ patient_id: external_id, version }));
      const clinician_links = (await read('clinician_links')).map(({ external_id, version }) => ({ clinician_id: external_id, version }));
      const visits = (await read('visits')).map(({ external_id, version }) => ({ appointment_id: external_id, version }));
      return { patient_links, clinician_links, visits };
    },
    submit: (payload) => invoke('pims_submit_sync', payload),
    seal: (payload) => invoke('pims_seal_capture', payload),
    candidates: (payload) => invoke('pims_reconcile_candidates', payload),
    reconcile: (payload) => invoke('pims_reconcile_status', payload),
    finish: (payload) => invoke('pims_finish_sync', payload),
  };
}

type SyncCode = 'unsupported' | 'schema_unavailable' | 'start_failed' | 'baseline_failed' | 'stale_run' | 'identity_changed' | 'invalid_capture' | 'capture_failed' | 'submit_unknown' | 'finish_unknown' | 'invalid_status' | 'reconcile_unknown';
export type SyncResult = {
  state: 'completed' | 'blocked' | 'interrupted'; code?: SyncCode; run?: SyncTicket;
  outcomes: SyncOutcome[]; completeness: SyncCompleteness; failures: SyncFailure[];
  reconciled: SyncOutcome[]; reconciliation: 'complete' | 'partial' | 'unsupported';
};

const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const sameIdentity = (left: SyncIdentity, right: SyncIdentity) => left?.provider === right.provider && left?.origin === right.origin && left?.tenant_id === right.tenant_id && left?.connection_revision === right.connection_revision;
const sameScope = (left: SyncScope, right: SyncScope) => left?.requested_date === right.requested_date && left?.timezone === right.timezone && Date.parse(left.window_start) === Date.parse(right.window_start) && Date.parse(left.window_end) === Date.parse(right.window_end);

function validBaseline(baseline: SyncBaseline): boolean {
  const validRows = (rows: unknown, key: string) => {
    if (!Array.isArray(rows)) return false;
    const seen = new Set<string>();
    return rows.every((row) => {
      if (!row || !validId(row[key]) || seen.has(row[key]) || !Number.isInteger(row.version) || row.version < 1 || row.version > 999999999) return false;
      seen.add(row[key]);
      return true;
    });
  };
  return !!baseline && validRows(baseline.patient_links, 'patient_id') && validRows(baseline.clinician_links, 'clinician_id') && validRows(baseline.visits, 'appointment_id');
}

function validCapture(capture: SyncCapture, ticket: SyncTicket, identity: SyncIdentity, now: number): boolean {
  if (!capture || capture.protocol !== 1 || capture.generation !== ticket.generation || !sameIdentity(capture.identity, identity) || !sameScope(capture.scope, ticket.scope)) return false;
  const capturedAt = Date.parse(capture.captured_at);
  if (!Number.isFinite(capturedAt) || capturedAt < Date.parse(ticket.started_at) || capturedAt > now || now >= Date.parse(ticket.expires_at)) return false;
  if (!['complete','partial','unknown'].includes(capture.completeness) || !Array.isArray(capture.items) || capture.items.length > 5000 || !Array.isArray(capture.failures) || capture.failures.length > 5000) return false;
  const seen = new Set<string>();
  for (const entry of capture.items) {
    if (!entry || !validId(entry.appointment_id) || !validId(entry.patient_id) || !validId(entry.clinician_id) || (entry.encounter_id !== null && !validId(entry.encounter_id)) || seen.has(entry.appointment_id)) return false;
    seen.add(entry.appointment_id);
    const starts = Date.parse(entry.starts_at), ends = Date.parse(entry.ends_at);
    if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || ends - starts > 26 * 60 * 60 * 1000 || starts < Date.parse(ticket.scope.window_start) || starts >= Date.parse(ticket.scope.window_end)) return false;
    if (!['active','cancelled','deleted','unknown'].includes(entry.status)) return false;
  }
  return capture.failures.every((failure) => failure && (failure.appointment_id === null || (validId(failure.appointment_id) && !seen.has(failure.appointment_id))) && ['read_failed','identity_missing','unsupported'].includes(failure.code));
}

function batchesFor(items: SyncItem[]): SyncItem[][] {
  const batches: SyncItem[][] = [[]];
  let bytes = 4096;
  for (const item of items) {
    const size = new TextEncoder().encode(JSON.stringify(item)).length + 256;
    if (batches.at(-1)!.length >= 100 || bytes + size > 192 * 1024) {
      batches.push([]);
      bytes = 4096;
    }
    batches.at(-1)!.push(item);
    bytes += size;
  }
  return batches;
}

function validOutcome(outcome: SyncOutcome, appointmentId: string): boolean {
  if (!outcome || outcome.appointment_id !== appointmentId || !Number.isInteger(outcome.version) || outcome.version < 0 || outcome.version > 999999999) return false;
  if (outcome.outcome === 'applied' || outcome.outcome === 'unchanged') return outcome.version > 0 && outcome.reason === undefined;
  return (outcome.outcome === 'conflict' || outcome.outcome === 'skipped') && ['status_requires_review','patient_unlinked','clinician_unlinked','link_version','visit_version','identity_changed','archived_requires_review','status_unknown'].includes(outcome.reason ?? '');
}

export async function syncAppointments(options: StartRequest & {
  identity: SyncIdentity; source?: SyncSource; backend: SyncBackend; now?: () => number; newRequestId?: () => string;
}): Promise<SyncResult> {
  const { backend, source } = options;
  const identity = { ...options.identity }, scope = { ...options.scope };
  const now = options.now ?? Date.now;
  const newRequestId = options.newRequestId ?? (() => crypto.randomUUID());
  const result: SyncResult = { state: 'blocked', outcomes: [], completeness: 'unknown', failures: [], reconciled: [], reconciliation: 'unsupported' };
  if (!source) return { ...result, code: 'unsupported' };
  let ticket: SyncTicket;
  try {
    ticket = await backend.start({ connection_id: options.connection_id, request_id: options.request_id, scope });
  } catch (error) {
    return { ...result, code: (error as { code?: string })?.code === 'schema_unavailable' ? 'schema_unavailable' : 'start_failed' };
  }
  if (!ticket || !validId(ticket.id) || !Number.isInteger(ticket.generation) || ticket.generation < 1) return { ...result, code: 'stale_run' };
  result.run = ticket;
  const reference = { run_id: ticket.id, generation: ticket.generation };
  const interrupt = async (code: SyncCode): Promise<SyncResult> => {
    await Promise.resolve().then(() => backend.finish({ ...reference, state: 'abandoned', completeness: 'unknown' })).catch(() => undefined);
    return { ...result, state: 'interrupted', code };
  };
  const startedAt = Date.parse(ticket.started_at), expiresAt = Date.parse(ticket.expires_at);
  if (ticket.state !== 'capturing' || ticket.connection_id !== options.connection_id || ticket.connection_revision !== identity.connection_revision || !sameScope(ticket.scope, scope)
      || !Number.isFinite(startedAt) || !Number.isFinite(expiresAt) || startedAt > now() || expiresAt <= startedAt || expiresAt - startedAt > 300000 || now() >= expiresAt) return interrupt('stale_run');
  let baseline: SyncBaseline;
  try { baseline = await backend.baseline(reference); } catch { return interrupt('baseline_failed'); }
  if (!validBaseline(baseline)) return interrupt('baseline_failed');
  let capture: SyncCapture;
  try {
    if (!sameIdentity(await source.readIdentity(), identity)) return interrupt('identity_changed');
    capture = structuredClone(await source.capture(structuredClone(ticket)));
    if (!sameIdentity(await source.readIdentity(), identity)) return interrupt('identity_changed');
  } catch { return interrupt('capture_failed'); }
  if (!validCapture(capture, ticket, identity, now())) return interrupt('invalid_capture');
  const patients = new Map(baseline.patient_links.map((link) => [link.patient_id, link.version]));
  const clinicians = new Map(baseline.clinician_links.map((link) => [link.clinician_id, link.version]));
  const visits = new Map(baseline.visits.map((visit) => [visit.appointment_id, visit.version]));
  const items: SyncItem[] = capture.items.map((entry) => ({
    appointment_id: entry.appointment_id, patient_id: entry.patient_id, clinician_id: entry.clinician_id,
    encounter_id: entry.encounter_id, starts_at: entry.starts_at, ends_at: entry.ends_at, status: entry.status,
    expected_version: visits.get(entry.appointment_id) ?? 0, patient_link_version: patients.get(entry.patient_id) ?? 0, clinician_link_version: clinicians.get(entry.clinician_id) ?? 0,
  }));
  result.failures = capture.failures.map(({ appointment_id, code }) => ({ appointment_id, code }));
  result.completeness = capture.failures.length && capture.completeness === 'complete' ? 'partial' : capture.completeness;
  for (const batch of batchesFor(items)) {
    if (now() >= Date.parse(ticket.expires_at)) return interrupt('stale_run');
    try {
      if (!sameIdentity(await source.readIdentity(), identity)) return interrupt('identity_changed');
    } catch { return interrupt('capture_failed'); }
    const requestId = newRequestId();
    try {
      const response = await backend.submit({ ...reference, request_id: requestId, captured_at: capture.captured_at, identity: { ...identity }, scope: { ...scope }, items: batch });
      if (response.run_id !== ticket.id || response.request_id !== requestId || !Array.isArray(response.outcomes) || response.outcomes.length !== batch.length
          || response.outcomes.some((outcome, index) => !validOutcome(outcome, batch[index].appointment_id))) return interrupt('submit_unknown');
      result.outcomes.push(...response.outcomes.map(({ appointment_id, outcome, version, reason }) => ({ appointment_id, outcome, version, ...(reason ? { reason } : {}) })));
    } catch { return interrupt('submit_unknown'); }
  }
  try {
    const sealed = await backend.seal({ ...reference, completeness: result.completeness });
    if (sealed.id !== ticket.id || sealed.generation !== ticket.generation || sealed.completeness !== result.completeness) return interrupt('reconcile_unknown');
    result.reconciliation = source.lookupStatus ? (result.completeness === 'complete' ? 'complete' : 'partial') : 'unsupported';
    const cursors = new Set<string>(), seen = new Set<string>();
    let cursor: string | null = null;
    do {
      if (now() >= expiresAt) return interrupt('stale_run');
      const page: CandidatePage = await backend.candidates({ ...reference, ...(cursor ? { cursor } : {}) });
      if (!page || !Array.isArray(page.rows) || page.rows.length > 100 || page.rows.some((row) => !row || !validId(row.appointment_id)
          || seen.has(row.appointment_id) || ![row.version, row.patient_link_version, row.clinician_link_version].every((version) => Number.isInteger(version) && version > 0 && version <= 999999999))
          || new Set(page.rows.map((row) => row.appointment_id)).size !== page.rows.length
          || (page.next_cursor !== null && (!validId(page.next_cursor) || cursors.has(page.next_cursor) || !page.rows.length))) return interrupt('reconcile_unknown');
      const explicit = new Map(items.filter((entry) => entry.status === 'cancelled' || entry.status === 'deleted').map((entry) => [entry.appointment_id, entry]));
      const absent = page.rows.filter((row) => !explicit.has(row.appointment_id));
      if (result.completeness !== 'complete' && absent.length) return interrupt('invalid_status');
      const statuses = new Map<string, { status: AppointmentStatus; captured_at: string }>();
      if (absent.length && source.lookupStatus) {
        if (!sameIdentity(await source.readIdentity(), identity)) return interrupt('identity_changed');
        const lookupStarted = now();
        const response = structuredClone(await source.lookupStatus({ ticket: structuredClone(ticket), appointment_ids: absent.map((row) => row.appointment_id) }));
        if (!sameIdentity(await source.readIdentity(), identity)) return interrupt('identity_changed');
        const capturedAt = Date.parse(response.captured_at);
        const allowed = new Set(absent.map((row) => row.appointment_id));
        if (response.protocol !== 1 || response.generation !== ticket.generation || !sameIdentity(response.identity, identity)
            || !Number.isFinite(capturedAt) || capturedAt < lookupStarted || capturedAt > now() || !Array.isArray(response.items) || response.items.length !== absent.length) return interrupt('invalid_status');
        for (const status of response.items) {
          if (!status || !allowed.delete(status.appointment_id) || !['active','cancelled','deleted','unknown'].includes(status.status)) return interrupt('invalid_status');
          if (status.status === 'active') {
            const entry = status.appointment;
            if (!entry || entry.status !== 'active' || entry.appointment_id !== status.appointment_id || !validId(entry.patient_id) || !validId(entry.clinician_id)
                || (entry.encounter_id !== null && !validId(entry.encounter_id)) || !Number.isFinite(Date.parse(entry.starts_at)) || !Number.isFinite(Date.parse(entry.ends_at))
                || Date.parse(entry.ends_at) <= Date.parse(entry.starts_at) || Date.parse(entry.ends_at) - Date.parse(entry.starts_at) > 93600000) return interrupt('invalid_status');
          }
          statuses.set(status.appointment_id, { status, captured_at: response.captured_at });
        }
      }
      for (const candidate of page.rows) {
        if (now() >= expiresAt) return interrupt('stale_run');
        if (!sameIdentity(await source.readIdentity(), identity)) return interrupt('identity_changed');
        const observed = explicit.get(candidate.appointment_id);
        const lookup = statuses.get(candidate.appointment_id);
        const status = observed?.status ?? lookup?.status.status ?? 'unknown';
        const response = await backend.reconcile({ ...reference, request_id: newRequestId(), appointment_id: candidate.appointment_id,
          expected_version: observed?.expected_version ?? candidate.version, patient_link_version: observed?.patient_link_version ?? candidate.patient_link_version, clinician_link_version: observed?.clinician_link_version ?? candidate.clinician_link_version,
          identity: { ...identity }, captured_at: observed ? capture.captured_at : lookup?.captured_at ?? new Date(now()).toISOString(), status,
          ...(lookup?.status.status === 'active' ? { appointment: lookup.status.appointment } : {}),
        });
        if (!validOutcome(response, candidate.appointment_id)) return interrupt('reconcile_unknown');
        result.reconciled.push(response);
        if (response.outcome === 'skipped' || response.outcome === 'conflict') {
          if (result.reconciliation === 'complete') result.reconciliation = 'partial';
        }
        seen.add(candidate.appointment_id);
      }
      cursor = page.next_cursor;
      if (cursor) cursors.add(cursor);
    } while (cursor);
  } catch { return interrupt('reconcile_unknown'); }
  try {
    const finished = await backend.finish({ ...reference, state: 'completed', completeness: result.completeness });
    if (finished.id !== ticket.id || finished.generation !== ticket.generation || finished.state !== 'completed' || finished.completeness !== result.completeness) return { ...result, state: 'interrupted', code: 'finish_unknown' };
    return { ...result, state: 'completed', run: finished };
  } catch { return { ...result, state: 'interrupted', code: 'finish_unknown' }; }
}
