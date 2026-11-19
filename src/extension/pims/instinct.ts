import { configuredSyncSource, instinctSession, type ConfiguredCapture } from './configuredSync';
import { identifyPims } from './hosts';
import { dayBounds, isVisible, plainHtml, readFailed, readJson, routeStatus } from './shared';
import type { AdapterContext, Appointment, AppointmentsResult, PimsAdapter, SendItem, WriteResult } from './types';

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value :
  typeof value === 'number' && Number.isFinite(value) ? String(value) : null;

const usersQuery = `query listActiveUsers {
  users(excludeInactive: true, excludeProtected: true) { id nameFirst nameLast }
}`;
const appointmentsQuery = `query GetCalendarAppointments($params: CalendarsParams) {
  calendars(params: $params) {
    date
    schedule {
      __typename
      ... on CalendarAppointment {
        id startsAt status
        calendar { provider { id nameFirst nameLast } }
        patient { id nameFirst nameLast pimsId }
      }
    }
  }
}`;
const visitsQuery = `query GetVisitPatientBoardList($since: Datetime) {
  activeVisits {
    id checkInAt checkOutAt scheduledAt
    user { id nameFirst nameLast }
    assignedTo { id nameFirst nameLast }
    patient { id nameFirst nameLast pimsId }
  }
  listRecentlyCheckedOutVisits(since: $since) {
    id checkInAt checkOutAt scheduledAt
    user { id nameFirst nameLast }
    assignedTo { id nameFirst nameLast }
    patient { id nameFirst nameLast pimsId }
  }
}`;

function identity(context: AdapterContext): { patientId: string; recordId: string } | null {
  if (identifyPims(context.url.href) !== 'instinct') return null;
  const match = /^#\/patient\/([^/?#\s]+)\/charts\?([^#]*)$/.exec(context.url.hash);
  if (!match) return null;
  const visits = new URLSearchParams(match[2]).getAll('visitId');
  if (visits.length !== 1 || !visits[0] || /[/?#\s]/.test(visits[0])) return null;
  return { patientId: match[1], recordId: visits[0] };
}

function writable(editor: HTMLElement): boolean {
  return editor.isConnected && isVisible(editor) && editor.getAttribute('contenteditable') === 'true' &&
    !editor.closest('[inert], [disabled], [aria-disabled="true"], [aria-readonly="true"]');
}

function fields(context: AdapterContext): { title: string; editor: HTMLElement }[] {
  return Array.from(context.doc.querySelectorAll<HTMLDivElement>('div[id]')).flatMap((wrapper) => {
    if (!wrapper.id.trim() || !isVisible(wrapper)) return [];
    const editors = Array.from(wrapper.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement && writable(element));
    return editors.length === 1 ? [{ title: wrapper.id, editor: editors[0] }] : [];
  });
}

async function write(item: SendItem, context: AdapterContext): Promise<WriteResult> {
  const expectedUrl = context.url.href;
  const changed = () => (context.currentUrl?.() ?? context.url).href !== expectedUrl;
  if (changed()) return { ok: false, code: 'patient_changed' };
  if (!identity(context)) return { ok: false, code: 'not_writable' };
  if (item.pngDataUrl !== undefined) return { ok: false, code: 'image_not_accepted' };
  const matches = fields(context).filter((field) => field.title.trim().toUpperCase() === item.fieldTitle.trim().toUpperCase());
  if (matches.length !== 1) return { ok: false, code: 'field_not_found' };
  const { editor, title } = matches[0];
  const wrapper = editor.parentElement;
  const guard = (expectedHtml?: string): WriteResult | null => {
    if (changed()) return { ok: false, code: 'patient_changed' };
    if (editor.isConnected && !writable(editor)) return { ok: false, code: 'not_writable' };
    const currentFields = fields(context).filter((field) => field.title.trim().toUpperCase() === item.fieldTitle.trim().toUpperCase());
    if (!editor.isConnected || !context.doc.contains(editor) || editor.parentElement !== wrapper ||
        currentFields.length !== 1 || currentFields[0].editor !== editor || currentFields[0].title !== title) {
      return { ok: false, code: 'editor_not_found' };
    }
    if (expectedHtml !== undefined && editor.innerHTML !== expectedHtml) return { ok: false, code: 'save_not_confirmed' };
    return null;
  };
  await context.wait(0);
  const before = guard();
  if (before) return before;
  editor.querySelectorAll('.is-empty.is-editor-empty').forEach((element) => element.remove());
  const afterCleanup = guard();
  if (afterCleanup) return afterCleanup;
  const html = plainHtml(item);
  editor.innerHTML = editor.innerHTML ? `${editor.innerHTML}<br>${html}` : html;
  const insertedHtml = editor.innerHTML;
  for (const event of ['input', 'change']) {
    const beforeEvent = guard(insertedHtml);
    if (beforeEvent) return beforeEvent;
    editor.dispatchEvent(new Event(event, { bubbles: true }));
    const afterEvent = guard(insertedHtml);
    if (afterEvent) return afterEvent;
    await context.wait(0);
    const settled = guard(insertedHtml);
    if (settled) return settled;
  }
  return { ok: false, code: 'save_not_confirmed' };
}

function credentials(context: AdapterContext): { endpoint: string; token: string } {
  if (identifyPims(context.url.href) !== 'instinct') throw new TypeError();
  const stored: unknown = JSON.parse(context.sessionStorage.getItem('instinct:user-state') ?? 'null');
  const value = isRow(stored) && isRow(stored.value) ? stored.value : null;
  const practice = value && isRow(value.practice) ? value.practice : null;
  if (!value || typeof value.accessToken !== 'string' || !value.accessToken.trim() || typeof practice?.apiUrl !== 'string') throw new TypeError();
  const url = new URL(practice.apiUrl);
  if (identifyPims(url.href) !== 'instinct' || url.port) throw new TypeError();
  return { endpoint: url.href, token: value.accessToken };
}

async function query(context: AdapterContext, operationName: string, document: string, variables: Row): Promise<Row> {
  const { endpoint, token } = credentials(context);
  const response = await readJson(context, endpoint, {
    method: 'POST', redirect: 'error', credentials: 'omit',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ operationName, query: document, variables }),
  });
  if (!isRow(response) || (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length > 0)) || !isRow(response.data)) throw new TypeError();
  return response.data;
}

function name(value: Row): string {
  return [value.nameFirst, value.nameLast].filter((part): part is string => typeof part === 'string').join(' ').trim();
}

function convert(row: Row, startsAt: unknown, provider: unknown): Appointment {
  const appointmentId = identifier(row.id);
  const patient = isRow(row.patient) ? row.patient : null;
  if (!appointmentId || !patient || !identifier(patient.id) || !name(patient) || typeof startsAt !== 'string' || !Number.isFinite(Date.parse(startsAt))) throw new TypeError();
  if (provider != null && (!isRow(provider) || !identifier(provider.id))) throw new TypeError();
  if (patient.pimsId != null && !identifier(patient.pimsId)) throw new TypeError();
  return {
    appointmentId, start: new Date(startsAt).toISOString(), patientName: name(patient),
    patientNumber: identifier(patient.pimsId) ?? '', ownerName: '', vet: isRow(provider) ? name(provider) || null : null,
  };
}

async function visits(context: AdapterContext, since: string): Promise<Row[]> {
  const data = await query(context, 'GetVisitPatientBoardList', visitsQuery, { since });
  if (!Array.isArray(data.activeVisits) || !Array.isArray(data.listRecentlyCheckedOutVisits) ||
      !data.activeVisits.every(isRow) || !data.listRecentlyCheckedOutVisits.every(isRow)) throw new TypeError();
  return [...data.activeVisits, ...data.listRecentlyCheckedOutVisits];
}

async function listAppointments(date: string, context: AdapterContext): Promise<AppointmentsResult> {
  const bounds = dayBounds(date);
  if (!bounds) return readFailed();
  try {
    const users = await query(context, 'listActiveUsers', usersQuery, {});
    if (!Array.isArray(users.users) || !users.users.every((user) => isRow(user) && identifier(user.id))) return readFailed();
    const data = await query(context, 'GetCalendarAppointments', appointmentsQuery, {
      params: { startDate: date, endDate: date, providerIds: users.users.map((user: Row) => user.id) },
    });
    if (!Array.isArray(data.calendars)) return readFailed();
    const appointments: Appointment[] = [];
    for (const calendar of data.calendars) {
      if (!isRow(calendar) || !Array.isArray(calendar.schedule)) return readFailed();
      for (const row of calendar.schedule) {
        if (!isRow(row)) return readFailed();
        if (typeof row.__typename === 'string' && row.__typename !== 'CalendarAppointment') continue;
        if (typeof row.status !== 'string') return readFailed();
        if (row.status !== 'ACTIVE') continue;
        if (!isRow(row.calendar)) return readFailed();
        appointments.push(convert(row, row.startsAt, row.calendar.provider));
      }
    }
    for (const row of await visits(context, bounds.start)) {
      if (row.checkOutAt != null) continue;
      appointments.push(convert(row, row.checkInAt ?? row.scheduledAt, row.assignedTo ?? row.user));
    }
    const selected = appointments.filter((appointment) => appointment.start >= bounds.start && appointment.start < bounds.end);
    return { ok: true, failures: [], appointments: Array.from(new Map(selected.map((appointment) => [appointment.appointmentId, appointment])).values()) };
  } catch {
    return readFailed();
  }
}

async function patientNumber(recordId: string, context: AdapterContext): Promise<string | null> {
  const target = identity(context);
  const expectedUrl = context.url.href;
  if (!target || target.recordId !== recordId || (context.currentUrl?.() ?? context.url).href !== expectedUrl) return null;
  try {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const rows = await visits(context, since);
    if ((context.currentUrl?.() ?? context.url).href !== expectedUrl) return null;
    const matching = rows.filter((row) => identifier(row.id) === recordId && isRow(row.patient) && identifier(row.patient.id) === target.patientId);
    const numbers = matching.map((row) => isRow(row.patient) ? identifier(row.patient.pimsId) : null);
    return numbers.length > 0 && numbers.every((number) => number === numbers[0]) ? numbers[0] : null;
  } catch {
    return null;
  }
}

/** Existing calendar and visit contracts expose independent opaque ID namespaces. */
export async function captureInstinctAppointments(date: string, context: AdapterContext, guard: () => void = () => {}): Promise<ConfiguredCapture> {
  const bounds = dayBounds(date), initialUrl = context.url.href, initialDoc = context.doc, initialRoot = context.doc.documentElement;
  if (!bounds || identifyPims(initialUrl) !== 'instinct' || context.url.port) throw { code: 'invalid_capture' };
  const captured = instinctSession(context);
  let invalid = false;
  const check = () => {
    try {
      guard();
      invalid ||= (context.currentUrl?.() ?? context.url).href !== initialUrl || context.doc !== initialDoc || context.doc.documentElement !== initialRoot
        || instinctSession(context).fingerprint !== captured.fingerprint;
    } catch { invalid = true; }
    if (invalid) throw { code: 'identity_changed' };
  };
  const post = async (operationName: string, query: string, variables: Row): Promise<Row> => {
    check();
    const response = await context.fetch(captured.endpoint, { method: 'POST', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${captured.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ operationName, query, variables }) }).finally(check);
    check();
    if (!response.ok) throw { code: 'read_failed' };
    check();const result: unknown = await response.json().finally(check);check();
    if (!isRow(result) || result.errors !== undefined && (!Array.isArray(result.errors) || result.errors.length > 0) || !isRow(result.data)) throw { code: 'invalid_capture' };
    return result.data;
  };
  const key = (value: unknown): string | null => {
    const result = identifier(value);
    return result && result.trim() === result && result.length <= 180 && !/[\u0000-\u001f\u007f]/.test(result) ? result : null;
  };
  const users = await post('listActiveUsers', usersQuery, {});
  if (!Array.isArray(users.users) || !users.users.every(user => isRow(user) && key(user.id))) throw { code: 'invalid_capture' };
  const calendars = await post('GetCalendarAppointments', appointmentsQuery, { params: { startDate: date, endDate: date, providerIds: users.users.map((user: Row) => user.id) } });
  if (!Array.isArray(calendars.calendars)) throw { code: 'invalid_capture' };
  const capture: ConfiguredCapture = { items: [], failures: [] }, seen = new Map<string, string>();
  const add = (row: Row, visit: boolean) => {
    const rawId = key(row.id), appointmentId = rawId ? `${visit ? 'visit' : 'appointment'}:${rawId}` : null;
    const patient = row.patient, clinician = visit ? row.assignedTo ?? row.user : isRow(row.calendar) ? row.calendar.provider : undefined;
    if (patient != null && !isRow(patient) || clinician != null && !isRow(clinician)) throw { code: 'invalid_capture' };
    const startsAt = visit ? row.checkInAt ?? row.scheduledAt : row.startsAt;
    if (typeof startsAt !== 'string' || !Number.isFinite(Date.parse(startsAt))) throw { code: 'invalid_capture' };
    const patientId = isRow(patient) ? key(patient.id) : null, clinicianId = isRow(clinician) ? key(clinician.id) : null;
    const normalized = { appointment_id: appointmentId, patient_id: patientId, clinician_id: clinicianId, encounter_id: visit ? rawId : null,
      starts_at: new Date(startsAt).toISOString(), ends_at: null, status: 'active' as const };
    if (appointmentId) {
      const fingerprint = JSON.stringify(normalized), previous = seen.get(appointmentId);
      if (previous !== undefined) { if (previous !== fingerprint) throw { code: 'invalid_capture' }; return; }
      seen.set(appointmentId, fingerprint);
    }
    if (Date.parse(startsAt) < Date.parse(bounds.start) || Date.parse(startsAt) >= Date.parse(bounds.end)) return;
    if (!appointmentId || !patientId || !clinicianId) { capture.failures.push({ appointment_id: appointmentId, code: 'identity_missing' }); return; }
    capture.items.push({ ...normalized, appointment_id: appointmentId, patient_id: patientId, clinician_id: clinicianId });
  };
  for (const calendar of calendars.calendars) {
    if (!isRow(calendar) || !Array.isArray(calendar.schedule)) throw { code: 'invalid_capture' };
    for (const row of calendar.schedule) {
      if (!isRow(row)) throw { code: 'invalid_capture' };
      if (typeof row.__typename === 'string' && row.__typename !== 'CalendarAppointment') continue;
      if (typeof row.status !== 'string') throw { code: 'invalid_capture' };
      if (row.status !== 'ACTIVE') continue;
      if (!isRow(row.calendar)) throw { code: 'invalid_capture' };
      add(row, false);
    }
  }
  const visits = await post('GetVisitPatientBoardList', visitsQuery, { since: bounds.start });
  if (!Array.isArray(visits.activeVisits) || !Array.isArray(visits.listRecentlyCheckedOutVisits)) throw { code: 'invalid_capture' };
  for (const row of [...visits.activeVisits, ...visits.listRecentlyCheckedOutVisits]) {
    if (!isRow(row)) throw { code: 'invalid_capture' };
    if (row.checkOutAt != null) continue;
    add(row, true);
  }
  check();return capture;
}

export const instinct: PimsAdapter = {
  id: 'instinct',
  syncSource: (context, binding, options) => configuredSyncSource(context, binding, (date, check) => captureInstinctAppointments(date, context, check), options),
  status: (context) => {
    const target = identity(context);
    return routeStatus(context, target?.patientId ?? null, target?.recordId ?? null, fields(context).length > 0);
  },
  listFields: (context) => fields(context).map(({ title }) => ({ title, kind: 'note', acceptsImage: false })),
  write,
  listAppointments,
  patientNumber,
};
