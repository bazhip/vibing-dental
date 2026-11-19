import { identifyPims } from '../../extension/pims/hosts';
import type { PimsId } from '../../extension/pims/types';
import type { RpcClient } from './sync';

export const SETUP_PROVIDERS: PimsId[] = ['ezyvet', 'daysmart', 'instinct', 'pulse', 'rhapsody', 'shepherd', 'vetspire'];
export const CONFIGURED_SYNC_PROVIDERS: PimsId[] = ['ezyvet', 'daysmart', 'instinct', 'pulse', 'shepherd'];
export type SetupConnection = { binding_mode?: 'provider_observed' | 'user_confirmed'; id: string; provider: PimsId; origin: string; tenant_id: string; state: 'unverified' | 'active' | 'disabled'; revision: number };
export type SetupContext = { connections: SetupConnection[]; members: { user_id: string }[] };
export type SetupPatient = { patient_id: string; patient_key: string; version: number };
export type SetupClinician = { clinician_id: string; user_id: string; version: number };
export type SetupChart = { chart_id: string; patient_name: string; patient_number: string; chart_date: string; source_hash: string; patient_id: string | null; version: number };
export type SetupRow = SetupPatient | SetupClinician | SetupChart;
export type SetupCollection = 'patients' | 'clinicians' | 'charts';
export type SetupPage = { rows: SetupRow[]; next_cursor: string | null };
export type ConfigureConnection = { practice_id: string; provider: PimsId; origin: string; tenant_id: string };
export type ChartLink = { connection_id: string; chart_id: string; patient_id: string; expected_version: number; source_hash: string; request_id: string; reason: string };
export type SetupBackend = {
  context(practiceId: string): Promise<SetupContext>;
  configure(input: ConfigureConnection): Promise<SetupConnection>;
  page(input: { connection_id: string; collection: SetupCollection; cursor?: string }): Promise<SetupPage>;
  patient(input: { connection_id: string; patient_id: string; patient_key: string }): Promise<SetupPatient>;
  clinician(input: { connection_id: string; clinician_id: string; user_id: string }): Promise<SetupClinician>;
  linkChart(input: ChartLink): Promise<{ chart_id: string; patient_id: string; version: number }>;
};
export type SetupError = 'schema' | 'forbidden' | 'conflict' | 'invalid' | 'unknown';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const version = (value: unknown, minimum = 1): value is number => Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= 999999999;
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function setupError(error: unknown): SetupError {
  return record(error) && ['schema', 'forbidden', 'conflict', 'invalid'].includes(String(error.code)) ? error.code as SetupError : 'unknown';
}
function validOrigin(origin: unknown, provider: unknown): boolean {
  try { return text(origin) && identifyPims(origin) === provider && new URL(origin).origin === origin; } catch { return false; }
}
function validConnection(value: unknown): value is SetupConnection {
  return record(value) && text(value.id) && text(value.tenant_id) && validOrigin(value.origin, value.provider)
    && version(value.revision) && ['unverified','active','disabled'].includes(String(value.state))
    && (value.binding_mode === undefined || ['provider_observed', 'user_confirmed'].includes(String(value.binding_mode)));
}
function validPatient(value: unknown): value is SetupPatient {
  return record(value) && text(value.patient_id) && text(value.patient_key) && version(value.version);
}
function validClinician(value: unknown): value is SetupClinician {
  return record(value) && text(value.clinician_id) && text(value.user_id) && version(value.version);
}
function validChart(value: unknown): value is SetupChart {
  return record(value) && text(value.chart_id) && typeof value.patient_name === 'string' && typeof value.patient_number === 'string'
    && typeof value.chart_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.chart_date) && hash(value.source_hash)
    && (value.patient_id === null ? value.version === 0 : text(value.patient_id) && version(value.version));
}
export function setupRowKey(row: SetupRow): string {
  return 'chart_id' in row ? row.chart_id : 'clinician_id' in row ? row.clinician_id : row.patient_id;
}
export function createSetupBackend(client: RpcClient): SetupBackend {
  const invoke = async (name: string, payload: unknown): Promise<unknown> => {
    let response;
    try { response = await client.rpc(name, { payload }); } catch { throw { code: 'unknown' }; }
    const { data, error } = response;
    if (error || data === null) {
      const code: SetupError = error?.code === 'PGRST202' || error?.code === '42883' ? 'schema'
        : error?.message === 'pims_forbidden' ? 'forbidden'
        : ['pims_conflict','pims_identity','pims_stale','pims_idempotency'].includes(error?.message ?? '') ? 'conflict'
        : error?.message === 'pims_invalid' || error?.message === 'pims_limit' ? 'invalid' : 'unknown';
      throw { code };
    }
    return data;
  };
  return {
    context: async (practiceId) => {
      const data = await invoke('pims_setup_context', { practice_id: practiceId });
      if (!record(data) || !Array.isArray(data.connections) || data.connections.length > 100 || !data.connections.every(validConnection)
        || !Array.isArray(data.members) || data.members.length > 200 || !data.members.every((entry) => record(entry) && text(entry.user_id))
        || new Set(data.connections.map((entry) => entry.id)).size !== data.connections.length) throw { code: 'unknown' };
      return data as SetupContext;
    },
    configure: async (input) => {
      if (!validOrigin(input.origin, input.provider) || !text(input.tenant_id)) throw { code: 'invalid' };
      const data = await invoke('pims_configure_connection', input);
      if (!validConnection(data) || data.state !== 'unverified' || data.provider !== input.provider || data.origin !== input.origin || data.tenant_id !== input.tenant_id) throw { code: 'unknown' };
      return data;
    },
    page: async (input) => {
      const data = await invoke('pims_setup_page', input);
      const validate = input.collection === 'patients' ? validPatient : input.collection === 'clinicians' ? validClinician : validChart;
      if (!record(data) || !Array.isArray(data.rows) || data.rows.length > 50 || !data.rows.every(validate)
        || (data.next_cursor !== null && !text(data.next_cursor))) throw { code: 'unknown' };
      const rows = data.rows as SetupRow[];
      if (new Set(rows.map(setupRowKey)).size !== rows.length || (data.next_cursor !== null && (rows.length !== 50 || data.next_cursor !== setupRowKey(rows[49]) || data.next_cursor === input.cursor))) throw { code: 'unknown' };
      return { rows, next_cursor: data.next_cursor as string | null };
    },
    patient: async (input) => {
      const data = await invoke('pims_confirm_patient', input);
      if (!validPatient(data) || data.patient_id !== input.patient_id || data.patient_key !== input.patient_key) throw { code: 'unknown' };
      return data;
    },
    clinician: async (input) => {
      const data = await invoke('pims_link_clinician', input);
      if (!validClinician(data) || data.clinician_id !== input.clinician_id || data.user_id !== input.user_id) throw { code: 'unknown' };
      return data;
    },
    linkChart: async (input) => {
      const data = await invoke('pims_link_chart', input);
      if (!record(data) || data.chart_id !== input.chart_id || data.patient_id !== input.patient_id || data.version !== input.expected_version + 1) throw { code: 'unknown' };
      return { chart_id: input.chart_id, patient_id: input.patient_id, version: Number(data.version) };
    },
  };
}
