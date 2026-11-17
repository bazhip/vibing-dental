import { dayBounds, isVisible, readFailed, routeStatus } from './shared';
import type { AdapterContext, Appointment, AppointmentsResult, FieldInfo, PimsAdapter } from './types';

function listFields(context: AdapterContext): FieldInfo[] {
  const available = (element: Element | null): element is Element => !!element && isVisible(element) &&
    !element.closest('[inert], [disabled], [readonly], [aria-disabled="true"], [aria-readonly="true"]');
  const field = (title: string): FieldInfo => ({ title, kind: 'note', acceptsImage: false });
  const sidebar = context.doc.querySelector('[role="complementary"].p-sidebar-active');
  const header = sidebar?.querySelector('.covetrus-sidebar-header-title') ?? null;
  const sidebarTitle = header?.textContent?.replace(/\s+/g, ' ').trim();
  if (sidebarTitle && available(header) && available(sidebar?.querySelector('[contenteditable="true"]') ?? null)) {
    return [field(sidebarTitle)];
  }
  if (context.url.pathname.includes('/Notes/AddNote')) {
    const legend = Array.from(context.doc.querySelectorAll('fieldset > legend')).find((element) =>
      element.textContent?.includes('Note Details') && available(element) && available(element.parentElement?.querySelector('iframe') ?? null));
    return legend ? [field('Medical Notes')] : [];
  }
  if (context.url.pathname.includes('Patients/EditAndGenerateDocument')) {
    const editor = Array.from(context.doc.querySelectorAll('form[action*="/Practice/Patients/EditAndGenerateDocument/"] iframe#Text_ifr')).find(available);
    return editor ? [field('Patient Documents')] : [];
  }
  const titles = Array.from(context.doc.querySelectorAll('medical-record-question-section, medical-record-patient-form-section'))
    .filter(available)
    .map((section) => section.querySelector('span.ds-text-h4'))
    .filter(available)
    .map((title) => title.textContent?.trim())
    .filter((title): title is string => !!title);
  for (const fieldset of Array.from(context.doc.querySelectorAll('fieldset'))) {
    const legend = fieldset.querySelector(':scope > legend');
    if (!available(legend)) continue;
    const controls = fieldset.querySelectorAll(':scope > ol > p > a[id="lnkComponentComments"], :scope > ol > li > div[class*="mce-tinymce"] div[class*="mce-edit-area"] iframe');
    if (!Array.from(controls).some(available)) continue;
    const title = legend.textContent?.trim();
    if (title) titles.push(title);
  }
  return Array.from(new Set(titles)).map(field);
}

function parseHtml(value: string): Document {
  return new DOMParser().parseFromString(value, 'text/html');
}

function details(html: string): { patientNumber: string; ownerName: string; vet: string | null } | null {
  const doc = parseHtml(html.replace(/\\u([\dA-Fa-f]{4})/g, (_, code: string) => String.fromCharCode(parseInt(code, 16))));
  const values = new Map<string, string>();
  for (const item of Array.from(doc.querySelectorAll('li'))) {
    const label = item.querySelector('label');
    const key = label?.textContent?.trim();
    label?.remove();
    if (key) values.set(key, item.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  }
  const patientNumber = /\(#\s*([^)]+?)\s*\)/.exec(values.get('Patient') ?? '')?.[1].trim();
  if (!patientNumber) return null;
  return {
    patientNumber,
    ownerName: values.get('Client') ?? '',
    vet: values.get('Appointment Provider') || null,
  };
}

function isId(value: unknown): value is string | number {
  return typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number' && Number.isFinite(value);
}

async function listAppointments(date: string, context: AdapterContext): Promise<AppointmentsResult> {
  const bounds = dayBounds(date);
  const token = context.doc.querySelector('input[name="__RequestVerificationToken"]')?.getAttribute('value');
  if (!bounds || !token) return readFailed();
  const formatted = (iso: string) => {
    const value = new Date(iso);
    return `${String(value.getMonth() + 1).padStart(2, '0')}/${String(value.getDate()).padStart(2, '0')}/${value.getFullYear()}, 12:00:00 AM`;
  };
  const body = new FormData();
  const values: Record<string, string> = {
    appointmentTypes: '', appointmentStatuses: '', employeeId: '0', resourcegroupId: '0', cageTypeId: '',
    viewType: 'agendaDay', __RequestVerificationToken: token,
    startDate: formatted(bounds.start), endDate: formatted(bounds.end),
    start: String(Date.parse(bounds.start) / 1000), end: String(Date.parse(bounds.end) / 1000),
  };
  Object.entries(values).forEach(([key, value]) => body.set(key, value));
  const controller = new AbortController();
  const requestSignal = () => AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
  const read = async (): Promise<AppointmentsResult> => {
    const calendar = await context.fetch('/Practice/Calendar/GetPracticeAppointmentsForToggleOn', {
      method: 'POST', credentials: 'include', redirect: 'error', body, signal: requestSignal(),
    });
    if (!calendar.ok) return readFailed();
    const response = await calendar.json();
    if (!Array.isArray(response) || response.length > 2000) return readFailed();
    type Failure = Extract<AppointmentsResult, { ok: true }>['failures'][number];
    const readRow = async (row: typeof response[number]): Promise<Appointment | Failure | null> => {
      if (!row || typeof row !== 'object' || typeof row.title !== 'string' ||
          !isId(row.id) || !isId(row.patientId) || typeof row.start !== 'string') {
        return { code: 'invalid_appointment', startsAt: null };
      }
      const doc = parseHtml(row.title);
      const confirm = doc.querySelector('img[src*="ConfirmStatusIcons/"]')?.getAttribute('alt')?.trim() ?? '';
      if (/^cancell?ed$/i.test(confirm)) return null;
      const startsAt = Date.parse(row.start);
      if (!Number.isFinite(startsAt)) {
        return { code: 'invalid_appointment', startsAt: null };
      }
      if (startsAt < Date.parse(bounds.start) || startsAt >= Date.parse(bounds.end)) return null;
      const patientName = parseHtml(row.title.split(/<br\s*\/?>/i)[0]).body.textContent?.trim();
      if (!patientName) {
        return { code: 'invalid_appointment', startsAt: new Date(startsAt).toISOString() };
      }
      try {
        const tooltipBody = new FormData();
        tooltipBody.set('id', String(row.id));
        tooltipBody.set('__RequestVerificationToken', token);
        const tooltip = await context.fetch('/Practice/Calendar/GetToolTip', {
          method: 'POST', credentials: 'include', redirect: 'error', body: tooltipBody, signal: requestSignal(),
        });
        if (!tooltip.ok) throw new TypeError();
        const parsed = details(await tooltip.text());
        if (!parsed) return { code: 'tooltip_not_parsed', startsAt: new Date(startsAt).toISOString() };
        return { appointmentId: String(row.id), start: new Date(startsAt).toISOString(), patientName, ...parsed };
      } catch {
        return { code: 'tooltip_fetch_failed', startsAt: new Date(startsAt).toISOString() };
      }
    };
    const results: (Appointment | Failure | null)[] = new Array(response.length);
    let next = 0;
    const work = async () => {
      while (next < response.length && !controller.signal.aborted) {
        const index = next++;
        results[index] = await readRow(response[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, response.length) }, work));
    if (controller.signal.aborted) return readFailed();
    const appointments: Appointment[] = [];
    const failures: Failure[] = [];
    for (const result of results) {
      if (!result) continue;
      if ('code' in result) failures.push(result);
      else appointments.push(result);
    }
    return { ok: true, appointments, failures };
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<AppointmentsResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(readFailed());
    }, 25_000);
  });
  try {
    return await Promise.race([read(), deadline]);
  } catch {
    return readFailed();
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export const pulse: PimsAdapter = {
  id: 'pulse',
  status: (context) => routeStatus(context, null, null, false),
  listFields,
  write: async () => ({ ok: false, code: 'not_writable' }),
  listAppointments,
  patientNumber: async () => null,
};
