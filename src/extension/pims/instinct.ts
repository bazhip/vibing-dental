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

function fields(context: AdapterContext): { title: string; editor: HTMLElement }[] {
  return Array.from(context.doc.querySelectorAll<HTMLDivElement>('div[id]')).flatMap((wrapper) => {
    if (!wrapper.id.trim() || !isVisible(wrapper)) return [];
    const editors = Array.from(wrapper.children).filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element.getAttribute('contenteditable') === 'true' && isVisible(element));
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

export const instinct: PimsAdapter = {
  id: 'instinct',
  status: (context) => {
    const target = identity(context);
    return routeStatus(context, target?.patientId ?? null, target?.recordId ?? null, fields(context).length > 0);
  },
  listFields: (context) => fields(context).map(({ title }) => ({ title, kind: 'note', acceptsImage: false })),
  write,
  listAppointments,
  patientNumber,
};
