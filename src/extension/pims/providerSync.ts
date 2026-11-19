import { identifyPims } from './hosts';
import { dayBounds, readJson } from './shared';
import type { AdapterContext } from './types';
import type { AppointmentStatus, ObservedAppointment, SyncIdentity, SyncScope, SyncSource, SyncTicket } from '../../utils/pims/sync';

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): string | null => typeof value === 'string' && value.length > 0 && value.trim() === value && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value) ? value
  : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
const instant = (value: unknown): value is string => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const fail = (code: string): never => { throw { code }; };
const query = `query getAppointments($locationId: ID, $start: DateTime!, $end: DateTime!) {
  appointments(locationId: $locationId, start: $start, end: $end) { id start duration provider { id } patient { id } }
  location(id: $locationId) { id }
}`;

export function providerSyncSource(context: AdapterContext, expected: SyncIdentity): SyncSource {
  const binding = { ...expected };
  const initialUrl = context.url.href;
  let initialToken: string | undefined;
  const session = () => {
    const current = context.currentUrl?.() ?? context.url;
    if (current.href !== initialUrl || current.origin !== binding.origin || identifyPims(current.href) !== binding.provider
      || !Number.isSafeInteger(binding.connection_revision) || binding.connection_revision < 1) return fail('identity_changed');
    let tenant: string | null = null, token: string | null = null;
    if (binding.provider === 'rhapsody') {
      const values = current.searchParams.getAll('businessId');
      tenant = values.length === 1 ? id(values[0]) : null;
      const tokens = context.doc.cookie.split(';').map(value => value.trim()).filter(value => value.startsWith('JWT='));
      token = tokens.length === 1 ? tokens[0].slice(4) : null;
    } else if (binding.provider === 'vetspire') {
      tenant = id(context.localStorage.getItem('__pref-location'));
      token = context.localStorage.getItem('authToken');
    } else return fail('unsupported');
    if (!tenant || tenant !== binding.tenant_id || !token?.trim()) return fail('identity_changed');
    if (initialToken !== undefined && initialToken !== token) return fail('identity_changed');
    initialToken = token;
    return { tenant, token };
  };
  const fetchBound = async (url: string, init: RequestInit, token: string) => {
    if (session().token !== token) return fail('identity_changed');
    const response = await readJson(context, url, init);
    if (session().token !== token) return fail('identity_changed');
    return response;
  };
  const get = (path: string, token: string, extra: Record<string, string> = {}) => {
    const url = new URL(path, binding.origin);
    url.search = new URLSearchParams({ businessId: binding.tenant_id, ...extra }).toString();
    return fetchBound(url.href, { method: 'GET', credentials: 'same-origin', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' } }, token);
  };
  const feed = async (scope: SyncScope) => {
    const { token } = session();
    let rows: unknown;
    if (binding.provider === 'rhapsody') {
      const response = await get('/apigw-rhapsody/v2/schedules', token, { date: scope.requested_date, language: 'en-US', showOtcSaleEvents: 'false' });
      if (!record(response) || response.persons !== undefined && response.persons !== null && !Array.isArray(response.persons)) return fail('invalid_capture');
      rows = response.appointments;
    } else {
      const hostname = context.url.hostname;
      const endpoint = hostname.includes('sandbox') ? 'https://api.sandbox.vetspire.com/graphql'
        : hostname.includes('staging') ? 'https://api.staging.vetspire.com/graphql' : 'https://api2.vetspire.com/graphql';
      const response = await fetchBound(endpoint, { method: 'POST', credentials: 'omit', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationName: 'getAppointments', query, variables: { locationId: binding.tenant_id, start: scope.window_start, end: scope.window_end } }) }, token);
      if (!record(response) || response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length) || !record(response.data)) return fail('invalid_capture');
      if (!record(response.data.location) || id(response.data.location.id) !== binding.tenant_id) return fail('identity_changed');
      rows = response.data.appointments;
    }
    if (!Array.isArray(rows) || rows.length > 2000) return fail('invalid_capture');
    return rows as unknown[];
  };
  const cancelled = (row: Row) => record(row.state) && typeof row.state.name === 'string' && ['cancelled', 'no show'].includes(row.state.name.trim().toLowerCase());
  const convert = (value: unknown): ObservedAppointment | null => {
    if (!record(value) || !id(value.id) || !record(value.patient) || !id(value.patient.id)) return null;
    const clinician = binding.provider === 'rhapsody' ? Array.isArray(value.personRoles) && record(value.personRoles[0]) ? id(value.personRoles[0].personId) : null
      : record(value.provider) ? id(value.provider.id) : null;
    const start = binding.provider === 'rhapsody' ? value.scheduledStartDatetime : value.start;
    if (!clinician || !instant(start)) return null;
    return { appointment_id: id(value.id)!, patient_id: id(value.patient.id)!, clinician_id: clinician, encounter_id: null,
      starts_at: start, ends_at: null, status: binding.provider === 'rhapsody' && cancelled(value) ? 'cancelled' : 'active' };
  };
  const check = (ticket: SyncTicket) => {
    session();
    if (!ticket || ticket.connection_revision !== binding.connection_revision || !Number.isSafeInteger(ticket.generation) || ticket.generation < 1 || ticket.state !== 'capturing'
      || !ticket.scope || !dayBounds(ticket.scope.requested_date) || !instant(ticket.scope.window_start) || !instant(ticket.scope.window_end)
      || Date.parse(ticket.scope.window_end) <= Date.parse(ticket.scope.window_start) || Date.parse(ticket.scope.window_end) - Date.parse(ticket.scope.window_start) > 93600000
      || !instant(ticket.expires_at) || Date.now() >= Date.parse(ticket.expires_at)) return fail('stale_run');
  };
  return {
    readIdentity: async () => {
      const requested_date = new Date().toISOString().slice(0, 10);
      const start = new Date(`${requested_date}T00:00:00.000Z`);
      await feed({ requested_date, timezone: 'UTC', window_start: start.toISOString(), window_end: new Date(start.getTime() + 86400000).toISOString() });
      return { ...binding };
    },
    capture: async ticket => {
      check(ticket);
      const rows = await feed(ticket.scope), items: ObservedAppointment[] = [], failures: { appointment_id: string | null; code: 'identity_missing' }[] = [];
      const seen = new Set<string>();
      for (const row of rows) {
        const key = record(row) ? id(row.id) : null;
        if (key && seen.has(key)) return fail('invalid_capture');
        if (key) seen.add(key);
        const item = convert(row);
        if (!item) { failures.push({ appointment_id: key, code: 'identity_missing' }); continue; }
        if (Date.parse(item.starts_at) >= Date.parse(ticket.scope.window_start) && Date.parse(item.starts_at) < Date.parse(ticket.scope.window_end)) items.push(item);
      }
      check(ticket);
      return { protocol: 1, generation: ticket.generation, captured_at: new Date().toISOString(), identity: { ...binding }, scope: { ...ticket.scope }, completeness: failures.length ? 'partial' : 'unknown', items, failures };
    },
    ...(binding.provider === 'rhapsody' ? { lookupStatus: async ({ ticket, appointment_ids }: { ticket: SyncTicket; appointment_ids: string[] }) => {
      check(ticket);
      if (!Array.isArray(appointment_ids) || appointment_ids.length > 100 || appointment_ids.some(value => !id(value)) || new Set(appointment_ids).size !== appointment_ids.length) return fail('invalid_capture');
      const token = session().token, items: AppointmentStatus[] = [];
      for (const key of appointment_ids) {
        let status: AppointmentStatus = { appointment_id: key, status: 'unknown' };
        try {
          const row = await get(`/apigw-rhapsody/appointments/${encodeURIComponent(key)}`, token);
          if (record(row) && id(row.id) === key) {
            const appointment = convert(row);
            if (cancelled(row)) status = { appointment_id: key, status: 'cancelled' };
            else if (appointment) status = { appointment_id: key, status: 'active', appointment };
          }
        } catch { if (session().token !== token) return fail('identity_changed'); }
        items.push(status);
      }
      check(ticket);
      return { protocol: 1 as const, generation: ticket.generation, captured_at: new Date().toISOString(), identity: { ...binding }, items };
    } } : {}),
  };
}
