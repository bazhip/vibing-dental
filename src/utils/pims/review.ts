export type ReviewConnection = { id: string; provider: string; tenant_id: string; practice_name: string; state: string };
export type ReviewVisit = {
  id: string; appointment_id: string; patient_id: string; clinician_id: string; encounter_id: string | null;
  starts_at: string; ends_at: string; version: number; archived_at: string | null; archive_kind: string | null; archive_reason: string | null;
};
export type ReviewIssue = { id: string; appointment_id: string; reason: string; proposed: Record<string, unknown>; current: ReviewVisit | null };
export type ReviewCollection = 'active' | 'archived' | 'issues';
export type ReviewPage = { rows: (ReviewVisit | ReviewIssue)[]; next_cursor: string | null };
type ReviewCommand = { connection_id: string; request_id: string; expected_version: number };
export type ReviewBackend = {
  connections(practiceId?: string): Promise<ReviewConnection[]>;
  page(input: { connection_id: string; collection: ReviewCollection; cursor?: string }): Promise<ReviewPage>;
  visit(input: ReviewCommand & { visit_id: string; action: 'archive' | 'restore'; reason: string }): Promise<{ id: string; version: number }>;
  resolve(input: ReviewCommand & { issue_id: string; action: 'retain' | 'accept_schedule' }): Promise<{ id: string; resolution: string; visit_version: number }>;
};
type RpcClient = { rpc(name: string, args: { payload: unknown }): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const nullableText = (value: unknown) => value === null || text(value);
const version = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
function validVisit(value: unknown): value is ReviewVisit {
  return record(value) && ['id','appointment_id','patient_id','clinician_id'].every((field) => text(value[field])) && version(value.version)
    && nullableText(value.encounter_id) && nullableText(value.archived_at) && nullableText(value.archive_kind) && nullableText(value.archive_reason)
    && typeof value.starts_at === 'string' && Number.isFinite(Date.parse(value.starts_at)) && typeof value.ends_at === 'string' && Number.isFinite(Date.parse(value.ends_at));
}
export function canAcceptSchedule(issue: ReviewIssue): boolean {
  const current = issue.current, proposed = issue.proposed;
  return !!current && !current.archived_at && proposed.status === 'active' && current.appointment_id === proposed.appointment_id && current.patient_id === proposed.patient_id
    && current.clinician_id === proposed.clinician_id && current.encounter_id === proposed.encounter_id
    && typeof proposed.starts_at === 'string' && Number.isFinite(Date.parse(proposed.starts_at))
    && typeof proposed.ends_at === 'string' && Date.parse(proposed.ends_at) > Date.parse(proposed.starts_at);
}
export function reviewError(error: unknown): 'schema' | 'forbidden' | 'conflict' | 'unknown' {
  const code = record(error) ? error.code : undefined;
  if (code === 'schema_unavailable') return 'schema';
  if (code === 'pims_forbidden') return 'forbidden';
  if (code === 'pims_conflict' || code === 'pims_identity' || code === 'pims_idempotency') return 'conflict';
  return 'unknown';
}
export function createReviewBackend(client: RpcClient): ReviewBackend {
  const invoke = async (name: string, payload: unknown) => {
    const { data, error } = await client.rpc(name, { payload });
    if (error || data === null) throw { code: error?.code === 'PGRST202' || error?.code === '42883' ? 'schema_unavailable'
      : ['pims_forbidden','pims_conflict','pims_identity','pims_idempotency'].includes(error?.message ?? '') ? error?.message : 'unknown' };
    return data;
  };
  return {
    connections: async (practiceId) => {
      const data = await invoke('pims_review_connections', practiceId ? { practice_id: practiceId } : {});
      if (!Array.isArray(data) || data.some((entry) => !record(entry) || !['id','provider','tenant_id','practice_name','state'].every((field) => text(entry[field])))) throw { code: 'unknown' };
      return data as ReviewConnection[];
    },
    page: async (input) => {
      const data = await invoke('pims_review_page', input);
      if (!record(data) || !Array.isArray(data.rows) || data.rows.length > 50 || !nullableText(data.next_cursor)
          || data.rows.some((row) => input.collection === 'issues' ? !record(row) || !text(row.id) || !text(row.appointment_id)
            || !text(row.reason) || !record(row.proposed) || (row.current !== null && !validVisit(row.current)) : !validVisit(row))) throw { code: 'unknown' };
      return data as ReviewPage;
    },
    visit: async (input) => {
      const data = await invoke('pims_review_visit', input);
      if (!record(data) || data.id !== input.visit_id || !version(data.version)) throw { code: 'unknown' };
      return { id: input.visit_id, version: data.version };
    },
    resolve: async (input) => {
      const data = await invoke('pims_resolve_issue', input);
      if (!record(data) || data.id !== input.issue_id || data.resolution !== input.action || !Number.isInteger(data.visit_version) || Number(data.visit_version) < 0) throw { code: 'unknown' };
      return { id: input.issue_id, resolution: input.action, visit_version: Number(data.visit_version) };
    },
  };
}
