import { configuredSyncSource, type ConfiguredCapture } from './configuredSync';
import { identifyPims } from './hosts';
import { dayBounds, isVisible, readFailed, routeStatus } from './shared';
import type { AdapterContext, Appointment, AppointmentsResult, PimsAdapter, SendItem, WriteResult } from './types';

const normalize = (value: string | null | undefined) => value?.replaceAll('(changes saved)', '').trim().replace(/:+$/, ':') ?? '';
const isRow = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const object = (value: unknown): Record<string, unknown> => isRow(value) ? value : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const id = (value: unknown) => typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? String(value).trim() : '';
const isCancelledLabel = (value: unknown) => /^cancell?ed$/i.test(text(value));

function record(url: URL): string | null {
  return identifyPims(url.href) === 'daysmart' ? /^\/view\/patient\/soap\/([\w-]+)\/?$/.exec(url.pathname)?.[1] ?? null : null;
}

function fields(context: AdapterContext) {
  return Array.from(context.doc.querySelectorAll('.soap_section')).flatMap((section) => {
    const parent = normalize(section.querySelector('h4')?.textContent);
    return Array.from(section.querySelectorAll('form')).filter(isVisible).map((form) => {
      const label = normalize(form.querySelector('label')?.textContent);
      const group = form.closest('.form_template_subcomponent')
        ? normalize(form.closest('.form_template_component')?.querySelector(':scope > .row-fluid .form_category_label')?.textContent) : '';
      return { form, title: [parent, group, label].filter(Boolean).join(' > '), legacy: [parent, label].filter(Boolean).join(' > ') };
    });
  }).filter((field) => !!field.title);
}

function writable(editor: HTMLTextAreaElement): boolean {
  return editor.isConnected && isVisible(editor) && !editor.readOnly && !editor.matches(':disabled') && !editor.closest('[inert], [aria-disabled="true"]');
}

function guard(context: AdapterContext, editor?: HTMLTextAreaElement): WriteResult | null {
  try {
    const current = context.currentUrl?.() ?? context.url;
    if (current.href !== context.url.href || identifyPims(current.href) !== 'daysmart') return { ok: false, code: 'patient_changed' };
    if (!record(current) || editor && !writable(editor)) return { ok: false, code: 'not_writable' };
    return null;
  } catch {
    return { ok: false, code: 'patient_changed' };
  }
}

async function write(item: SendItem, context: AdapterContext): Promise<WriteResult> {
  if (item.pngDataUrl !== undefined) return { ok: false, code: 'image_not_accepted' };
  const initial = guard(context);
  if (initial) return initial;
  const matches = fields(context).filter((field) => field.title === normalize(item.fieldTitle) || field.legacy === normalize(item.fieldTitle));
  if (matches.length !== 1) return { ok: false, code: 'field_not_found' };
  const form = matches[0].form;
  const editors = form.querySelectorAll('textarea');
  if (editors.length !== 1) return { ok: false, code: 'editor_not_found' };
  const editor = editors[0];
  const check = () => guard(context, editor);
  const saved = () => form.querySelector('label')?.textContent?.includes('(changes saved)') === true;
  let pendingSeen = false;
  try {
    let failure = check();
    if (failure) return failure;
    editor.focus();
    failure = check();
    if (failure) return failure;
    editor.dispatchEvent(new Event('focus', { bubbles: true }));
    failure = check();
    if (failure) return failure;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!setter || item.text === undefined) return { ok: false, code: 'not_writable' };
    pendingSeen = !saved();
    const expectedValue = editor.value ? `${editor.value}\n${item.text}` : item.text;
    setter.call(editor, expectedValue);
    for (const event of ['input', 'change']) {
      failure = check();
      if (failure) return failure;
      editor.dispatchEvent(new Event(event, { bubbles: true }));
      pendingSeen ||= !saved();
    }
    for (let attempt = 0; attempt <= 20; attempt++) {
      failure = check();
      if (failure) return failure;
      pendingSeen ||= !saved();
      if (pendingSeen && saved() && editor.value === expectedValue) return { ok: true };
      if (attempt === 20) break;
      await context.wait(100);
      failure = check();
      if (failure) return failure;
    }
    return { ok: false, code: 'save_not_confirmed' };
  } catch {
    return check() ?? { ok: false, code: 'save_not_confirmed' };
  }
}

function resources(value: unknown): unknown {
  return object(object(value).response).resources;
}

async function listAppointments(date: string, context: AdapterContext): Promise<AppointmentsResult> {
  const bounds = dayBounds(date);
  if (!bounds || identifyPims(context.url.href) !== 'daysmart') return readFailed();
  try {
    if ((context.currentUrl?.() ?? context.url).href !== context.url.href) return readFailed();
    const headers: Record<string, string> = { accept: 'application/json, text/plain, */*', 'x-requested-with': 'XMLHttpRequest' };
    const token = context.localStorage.getItem('Vetter-Token');
    if (token !== null && !token.trim()) return readFailed();
    if (token) headers['vetter-token'] = token;
    let discontinued = false;
    const unchanged = () => {
      if (discontinued) return false;
      try {
        discontinued = (context.currentUrl?.() ?? context.url).href !== context.url.href || context.localStorage.getItem('Vetter-Token') !== token;
      } catch {
        discontinued = true;
      }
      return !discontinued;
    };
    const read = async (path: string): Promise<unknown> => {
      if (!unchanged()) throw new TypeError();
      const response = await context.fetch(path, { method: 'GET', headers, credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (!unchanged() || !response.ok) throw new TypeError();
      const result = await response.json();
      if (!unchanged()) throw new TypeError();
      return result;
    };
    const query = new URLSearchParams({ start: bounds.start, end: new Date(Date.parse(bounds.end) - 1).toISOString(),
      location: 'true', client: 'true', patient: 'true', staff: 'true', provider: 'true' });
    const result = resources(await read(`/barramundi/schedule/appointment?${query}`));
    if (!unchanged() || result === undefined || result === null) return readFailed();
    const rows = Array.isArray(result) ? result : [result];
    if (!Array.isArray(result) && !id(object(result).id)) return readFailed();
    if (rows.length > 2000) return readFailed();
    const appointments: Appointment[] = [];
    const failures: Extract<AppointmentsResult, { ok: true }>['failures'] = [];
    for (const value of rows) {
      const row = object(value);
      const patient = object(row.patient);
      const client = object(row.client);
      const start = Date.parse(text(row.start));
      if (!id(row.id) || !isRow(row.patient) || !isRow(row.client) || !text(patient.name) || !Number.isFinite(start)) {
        failures.push({ code: 'invalid_appointment', startsAt: null });
        continue;
      }
      if ([object(row.appointmentStatus).value, object(row.status).value].some(isCancelledLabel)) continue;
      let verifiedStart = start;
      let vet: string | null = null;
      try {
        const detailResponse = await read(`/barramundi/schedule/appointment/${encodeURIComponent(id(row.id))}`);
        if (!unchanged()) return readFailed();
        if (!isRow(detailResponse) || !isRow(detailResponse.response)) throw new TypeError();
        const details = detailResponse.response.resources;
        if (details === null || details === undefined || Array.isArray(details) && details.length === 0) {
          const history = resources(await read(`/barramundi/schedule/appointment-history/${encodeURIComponent(id(row.id))}`));
          if (!unchanged()) return readFailed();
          if (Array.isArray(history) && isCancelledLabel(object(history[0]).title)) continue;
          throw new TypeError();
        }
        if (!isRow(details)) throw new TypeError();
        const detailPatientId = object(details.patient).id;
        if (details.id != null && id(details.id) !== id(row.id)
          || detailPatientId != null && patient.id != null && id(detailPatientId) !== id(patient.id)) throw new TypeError();
        if ([object(details.appointmentStatus).value, object(details.status).value].some(isCancelledLabel)) continue;
        verifiedStart = Date.parse(text(details.start));
        if (!Number.isFinite(verifiedStart)) throw new TypeError();
        if (verifiedStart < Date.parse(bounds.start) || verifiedStart >= Date.parse(bounds.end)) continue;
        vet = text(object(details.provider).display_name) || null;
      } catch {
        if (!unchanged()) return readFailed();
        failures.push({ code: 'tooltip_fetch_failed', startsAt: new Date(start).toISOString() });
        continue;
      }
      if (!unchanged()) return readFailed();
      appointments.push({ appointmentId: id(row.id), start: new Date(verifiedStart).toISOString(),
        patientName: [text(patient.name), text(client.lastname)].filter(Boolean).join(' '), patientNumber: id(patient.index),
        ownerName: [text(client.firstname), text(client.lastname)].filter(Boolean).join(' '), vet });
    }
    return { ok: true, appointments, failures };
  } catch {
    return readFailed();
  }
}


/** Raw identities for explicitly confirmed configured-practice sync; display metadata is not an identity. */
export async function captureDaySmartAppointments(date: string, context: AdapterContext): Promise<ConfiguredCapture> {
  const bounds = dayBounds(date);
  if (!bounds || identifyPims(context.url.href) !== 'daysmart' || context.url.port) throw { code: 'invalid_capture' };
  const key = (value: unknown): string | null => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value) ? value
    : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  const token = context.localStorage.getItem('Vetter-Token');
  if (token !== null && !token.trim()) throw { code: 'identity_changed' };
  let discontinued = false;
  const check = () => {
    try { discontinued ||= (context.currentUrl?.() ?? context.url).href !== context.url.href || context.localStorage.getItem('Vetter-Token') !== token; }
    catch { discontinued = true; }
    if (discontinued) throw { code: 'identity_changed' };
  };
  const headers: Record<string, string> = { accept: 'application/json, text/plain, */*', 'x-requested-with': 'XMLHttpRequest' };
  if (token) headers['vetter-token'] = token;
  const read = async (path: string): Promise<unknown> => {
    check();
    const response = await context.fetch(path, { method: 'GET', headers, credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(15_000) });
    check();
    if (!response.ok) throw { code: 'read_failed' };
    const body: unknown = await response.json();check();return body;
  };
  const query = new URLSearchParams({ start: bounds.start, end: new Date(Date.parse(bounds.end) - 1).toISOString(),
    location: 'true', client: 'true', patient: 'true', staff: 'true', provider: 'true' });
  const feed = resources(await read(`/barramundi/schedule/appointment?${query}`));
  if (feed == null || !Array.isArray(feed) && !key(object(feed).id)) throw { code: 'invalid_capture' };
  const rows = Array.isArray(feed) ? feed : [feed];
  if (rows.length > 2000) throw { code: 'invalid_capture' };
  const capture: ConfiguredCapture = { items: [], failures: [] }, seen = new Set<string>();
  for (const value of rows) {
    const row = object(value), appointmentId = key(row.id);
    if (appointmentId && seen.has(appointmentId)) throw { code: 'invalid_capture' };
    if (appointmentId) seen.add(appointmentId);
    if (!appointmentId) { capture.failures.push({ appointment_id: null, code: 'identity_missing' });continue; }
    let details: Record<string, unknown>;
    let historicalCancellation = false;
    try {
      const response = await read(`/barramundi/schedule/appointment/${encodeURIComponent(appointmentId)}`);
      if (!isRow(response) || !isRow(response.response)) throw { code: 'invalid_capture' };
      const detail = response.response.resources;
      if (detail == null || Array.isArray(detail) && detail.length === 0) {
        const history = resources(await read(`/barramundi/schedule/appointment-history/${encodeURIComponent(appointmentId)}`));
        if (!Array.isArray(history) || !isCancelledLabel(object(history[0]).title)) throw { code: 'invalid_capture' };
        historicalCancellation = true;details = row;
      } else if (isRow(detail)) details = detail;
      else throw { code: 'invalid_capture' };
    } catch (cause) {
      check();
      capture.failures.push({ appointment_id: appointmentId, code: object(cause).code === 'read_failed' ? 'read_failed' : 'identity_missing' });
      continue;
    }
    check();
    const patientId = key(object(details.patient).id) ?? key(object(row.patient).id);
    const clinicianId = key(object(details.provider).id);
    const start = Date.parse(text(details.start));
    if (details.id != null && key(details.id) !== appointmentId || !patientId || !clinicianId || !Number.isFinite(start)
      || object(details.patient).id != null && object(row.patient).id != null && key(object(details.patient).id) !== key(object(row.patient).id)) {
      capture.failures.push({ appointment_id: appointmentId, code: 'identity_missing' });continue;
    }
    if (start < Date.parse(bounds.start) || start >= Date.parse(bounds.end)) continue;
    const detailStatuses = [object(details.appointmentStatus).value, object(details.status).value].filter(value => !!text(value));
    const cancelled = historicalCancellation || (detailStatuses.length ? detailStatuses
      : [object(row.appointmentStatus).value, object(row.status).value]).some(isCancelledLabel);
    capture.items.push({ appointment_id: appointmentId, patient_id: patientId, clinician_id: clinicianId, encounter_id: null,
      starts_at: new Date(start).toISOString(), ends_at: null, status: cancelled ? 'cancelled' : 'active' });
  }
  check();return capture;
}

export const daysmart: PimsAdapter = {
  id: 'daysmart',
  syncSource: (context, binding, options) => configuredSyncSource(context, binding, date => captureDaySmartAppointments(date, context), options),
  status: (context) => routeStatus(context, null, record(context.url), fields(context).some(({ form }) => {
    const editor = form.querySelector('textarea');
    return !!editor && writable(editor);
  })),
  listFields: (context) => fields(context).map(({ title }) => ({ title, kind: 'note', acceptsImage: false })),
  write,
  listAppointments,
  patientNumber: async () => null,
};
