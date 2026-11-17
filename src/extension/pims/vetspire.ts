import { identifyPims } from './hosts';
import { dayBounds, isVisible, readFailed, readJson, routeStatus } from './shared';
import type { AdapterContext, Appointment, AppointmentsResult, FieldInfo, PimsAdapter } from './types';

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value :
  typeof value === 'number' && Number.isFinite(value) ? String(value) : null;

function listFields(context: AdapterContext): FieldInfo[] {
  return Array.from(context.doc.querySelectorAll<HTMLElement>('#sectionContainer > div[id]'))
    .filter((section) => section.id.trim() && isVisible(section) && (
      Array.from(section.querySelectorAll('[contenteditable="true"]')).some(isVisible) ||
      Array.from(section.querySelectorAll('div')).some((element) => isVisible(element) && (
        element.textContent?.trim() === 'Add Note' ||
        (element.querySelector('i.material-icons')?.textContent?.trim() === 'add' && element.textContent?.includes('Add Note'))
      ))
    ))
    .map((section) => ({ title: section.id, kind: 'note', acceptsImage: false }));
}

const appointmentsQuery = `query getAppointments($locationId: ID, $start: DateTime!, $end: DateTime!) {
  appointments(locationId: $locationId, start: $start, end: $end) {
    id start duration
    provider { id name }
    schedule { id name }
    patient { id name }
  }
  location(id: $locationId) {
    id
    providers(onlyActive: true, isVeterinarian: true) { id name }
  }
}`;

async function listAppointments(date: string, context: AdapterContext): Promise<AppointmentsResult> {
  const bounds = dayBounds(date);
  if (!bounds || identifyPims(context.url.href) !== 'vetspire') return readFailed();
  try {
    const token = context.localStorage.getItem('authToken');
    const locationId = context.localStorage.getItem('__pref-location');
    if (!token?.trim() || !locationId?.trim()) return readFailed();
    const hostname = context.url.hostname;
    const endpoint = hostname.includes('sandbox') ? 'https://api.sandbox.vetspire.com/graphql' :
      hostname.includes('staging') ? 'https://api.staging.vetspire.com/graphql' : 'https://api2.vetspire.com/graphql';
    const response = await readJson(context, endpoint, {
      method: 'POST', redirect: 'error', credentials: 'omit',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationName: 'getAppointments', query: appointmentsQuery, variables: { locationId, ...bounds } }),
    });
    if (!isRow(response) || (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length > 0)) || !isRow(response.data)) return readFailed();
    const data = response.data;
    if (!Array.isArray(data.appointments) || !isRow(data.location) || !Array.isArray(data.location.providers) ||
        !data.location.providers.every((provider) => isRow(provider) && identifier(provider.id) && typeof provider.name === 'string')) return readFailed();
    const appointments: Appointment[] = [];
    for (const row of data.appointments) {
      if (!isRow(row) || !identifier(row.id) || typeof row.start !== 'string' || !Number.isFinite(Date.parse(row.start))) return readFailed();
      if (row.patient === null || row.provider === null) continue;
      if (!isRow(row.patient) || !identifier(row.patient.id) || typeof row.patient.name !== 'string' || !row.patient.name.trim() ||
          !isRow(row.provider) || !identifier(row.provider.id) || typeof row.provider.name !== 'string') return readFailed();
      const start = new Date(row.start).toISOString();
      if (start < bounds.start || start >= bounds.end) continue;
      appointments.push({ appointmentId: identifier(row.id)!, start, patientName: row.patient.name.trim(), patientNumber: identifier(row.patient.id)!,
        ownerName: '', vet: row.provider.name.trim() || null });
    }
    return { ok: true, appointments, failures: [] };
  } catch {
    return readFailed();
  }
}

export const vetspire: PimsAdapter = {
  id: 'vetspire',
  status: (context) => routeStatus(context, null, null, false),
  listFields,
  write: async () => ({ ok: false, code: 'not_writable' }),
  listAppointments,
  patientNumber: async () => null,
};
