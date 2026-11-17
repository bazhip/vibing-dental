import { dayBounds, readFailed, readJson, routeStatus } from './shared';
import type { AdapterContext, Appointment, AppointmentsResult, FieldInfo, PimsAdapter } from './types';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function identifier(value: unknown): string {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : text(value);
}

function appointmentStart(value: unknown): string | null {
  const scheduledStart = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.test(scheduledStart)
    || !dayBounds(scheduledStart.slice(0, 10))) return null;
  const timestamp = Date.parse(scheduledStart);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function listFields(context: AdapterContext): FieldInfo[] {
  return Array.from(context.doc.querySelectorAll('button[role="tab"]'))
    .map((button) => button.textContent?.trim())
    .filter((title): title is string => title === 'Medical notes' || title === 'Discharge notes')
    .map((title) => ({ title, kind: 'note', acceptsImage: false }));
}

async function listAppointments(date: string, context: AdapterContext): Promise<AppointmentsResult> {
  try {
    const bounds = dayBounds(date);
    const businessId = context.url.searchParams.get('businessId')?.trim();
    const token = context.doc.cookie.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('JWT='))?.slice(4).trim();
    if (!bounds || !businessId || !token) return readFailed();
    const url = new URL('/apigw-rhapsody/v2/schedules', context.url.origin);
    url.search = new URLSearchParams({ businessId, date, language: 'en-US', showOtcSaleEvents: 'false' }).toString();
    const payload = await readJson(context, url.href, {
      method: 'GET', credentials: 'same-origin',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache', Expires: '0' },
    });
    if (!record(payload) || !Array.isArray(payload.appointments) || !Array.isArray(payload.persons)) return readFailed();
    const persons = new Map<string, string>();
    for (const person of payload.persons) {
      if (!record(person) || !identifier(person.id)
        || (person.firstName != null && typeof person.firstName !== 'string')
        || (person.lastName != null && typeof person.lastName !== 'string')
        || persons.has(identifier(person.id))) return readFailed();
      persons.set(identifier(person.id), [text(person.firstName), text(person.lastName)].filter(Boolean).join(' '));
    }
    const appointments: Appointment[] = [];
    const failures: Extract<AppointmentsResult, { ok: true }>['failures'] = [];
    for (const row of payload.appointments) {
      if (record(row) && record(row.state) && (row.state.name === 'No show' || row.state.name === 'Cancelled')) continue;
      const startsAt = record(row) ? appointmentStart(row.scheduledStartDatetime) : null;
      if (!record(row) || !startsAt) {
        failures.push({ code: 'invalid_appointment', startsAt: null });
        continue;
      }
      if (startsAt < bounds.start || startsAt >= bounds.end) continue;
      const patient = record(row.patient) ? row.patient : {};
      const client = record(row.client) ? row.client : {};
      const firstRole: unknown = Array.isArray(row.personRoles) ? row.personRoles[0] : null;
      const vet = record(firstRole) ? persons.get(identifier(firstRole.personId)) : null;
      const patientName = text(patient.name);
      const appointmentId = identifier(row.id);
      const patientNumber = identifier(patient.id);
      if (!appointmentId || !patientNumber || !patientName || !vet) {
        failures.push({ code: 'invalid_appointment', startsAt });
        continue;
      }
      appointments.push({ appointmentId, start: startsAt, patientNumber,
        patientName: patientName.split(/\s+/).length >= 2 ? patientName : [patientName, text(client.lastName)].filter(Boolean).join(' '),
        ownerName: [text(client.firstName), text(client.lastName)].filter(Boolean).join(' '), vet });
    }
    return { ok: true, appointments, failures };
  } catch {
    return readFailed();
  }
}

export const rhapsody: PimsAdapter = {
  id: 'rhapsody',
  status: (context) => routeStatus(context, null, null, false),
  listFields,
  write: async () => ({ ok: false, code: 'not_writable' }),
  listAppointments,
  patientNumber: async () => null,
};
