import { identifyPims } from './hosts';
import { dayBounds, isVisible, readFailed, readJson, routeStatus } from './shared';
import type { AdapterContext, Appointment, AppointmentsResult, PimsAdapter, SendItem, WriteResult } from './types';

const normalize = (value: string | null | undefined) => value?.replaceAll('(changes saved)', '').trim().replace(/:+$/, ':') ?? '';
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const id = (value: unknown) => typeof value === 'string' || typeof value === 'number' && Number.isFinite(value) ? String(value).trim() : '';

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
    if (token) headers['vetter-token'] = token;
    const query = new URLSearchParams({ start: bounds.start, end: new Date(Date.parse(bounds.end) - 1).toISOString(),
      location: 'true', client: 'true', patient: 'true', staff: 'true', provider: 'true' });
    const result = resources(await readJson(context, `/barramundi/schedule/appointment?${query}`, { method: 'GET', headers }));
    if ((context.currentUrl?.() ?? context.url).href !== context.url.href || result === undefined || result === null) return readFailed();
    const rows = Array.isArray(result) ? result : [result];
    if (!Array.isArray(result) && !id(object(result).id)) return readFailed();
    if (rows.length > 2000) return readFailed();
    const appointments: Appointment[] = [];
    const failures: Extract<AppointmentsResult, { ok: true }>['failures'] = [];
    for (const value of rows) {
      const row = object(value);
      const patient = object(row.patient);
      const client = object(row.client);
      if (!row.patient || !row.client) continue;
      if ([object(row.appointmentStatus).value, object(row.status).value].some((status) => /^cancell?ed$/i.test(text(status)))) continue;
      const start = Date.parse(text(row.start));
      if (!id(row.id) || !text(patient.name) || !Number.isFinite(start)) {
        failures.push({ code: 'invalid_appointment', startsAt: null });
        continue;
      }
      if (start < Date.parse(bounds.start) || start >= Date.parse(bounds.end)) continue;
      let vet: string | null = null;
      try {
        const details = resources(await readJson(context, `/barramundi/schedule/appointment/${encodeURIComponent(id(row.id))}`, { method: 'GET', headers }));
        if ((context.currentUrl?.() ?? context.url).href !== context.url.href) return readFailed();
        vet = text(object(object(details).provider).display_name) || null;
      } catch {
        failures.push({ code: 'tooltip_fetch_failed', startsAt: new Date(start).toISOString() });
      }
      if ((context.currentUrl?.() ?? context.url).href !== context.url.href) return readFailed();
      appointments.push({ appointmentId: id(row.id), start: new Date(start).toISOString(),
        patientName: [text(patient.name), text(client.lastname)].filter(Boolean).join(' '), patientNumber: id(patient.index),
        ownerName: [text(client.firstname), text(client.lastname)].filter(Boolean).join(' '), vet });
    }
    return { ok: true, appointments, failures };
  } catch {
    return readFailed();
  }
}

export const daysmart: PimsAdapter = {
  id: 'daysmart',
  status: (context) => routeStatus(context, null, record(context.url), fields(context).some(({ form }) => {
    const editor = form.querySelector('textarea');
    return !!editor && writable(editor);
  })),
  listFields: (context) => fields(context).map(({ title }) => ({ title, kind: 'note', acceptsImage: false })),
  write,
  listAppointments,
  patientNumber: async () => null,
};
