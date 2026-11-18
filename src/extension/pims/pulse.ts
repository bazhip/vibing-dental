import { configuredSyncSource, type ConfiguredCapture } from './configuredSync';
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

function visitId(value: unknown): string | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const id = String(value);
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? id : null;
}

function selectedOption(form: Document, id: string): HTMLOptionElement | null {
  return form.querySelector<HTMLOptionElement>(`select#${id} option[selected]`);
}

function visitStart(form: Document): Date | null {
  const date = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(form.querySelector('input#AppointmentStartDate')?.getAttribute('value') ?? '');
  const hourText = selectedOption(form, 'AppointmentStartTimeHour')?.textContent?.trim() ?? '';
  const minuteText = selectedOption(form, 'AppointmentStartTimeMinute')?.textContent?.trim() ?? '';
  const meridiem = selectedOption(form, 'AppointmentStartTimeIsAM')?.textContent?.trim().toUpperCase();
  if (!date || !/^(?:0?[1-9]|1[0-2])$/.test(hourText) || !/^\d{1,2}$/.test(minuteText) ||
      Number(minuteText) > 59 || (meridiem !== 'AM' && meridiem !== 'PM')) return null;
  const [, monthText, dayText, yearText] = date;
  const year = Number(yearText);
  const month = Number(monthText) - 1;
  const day = Number(dayText);
  const hour = Number(hourText) % 12 + (meridiem === 'PM' ? 12 : 0);
  const minute = Number(minuteText);
  const start = new Date(0);
  start.setFullYear(year, month, day);
  start.setHours(hour, minute, 0, 0);
  return year > 0 && start.getFullYear() === year && start.getMonth() === month && start.getDate() === day &&
    start.getHours() === hour && start.getMinutes() === minute ? start : null;
}

const providerSentinels = new Set(['', '0', '-1']);

function domProviders(doc: Document): Map<string, string> {
  for (const name of ['ActiveProvider', 'EmployeeIdFilter']) {
    const rows = Array.from(doc.querySelectorAll<HTMLOptionElement>(`select[name="${name}"] option`))
      .filter((row) => !providerSentinels.has(row.value));
    if (!rows.length) continue;
    const providers = new Map<string, string>();
    for (const row of rows) {
      const id = row.getAttribute('value');
      const label = row.textContent?.replace(/\s+/g, ' ').trim();
      if (id && label) providers.set(id, label);
    }
    return providers;
  }
  return new Map();
}

const syncId = (value: unknown): string | null => {
  const result = typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return result && result.trim() === result && result.length <= 200 && !providerSentinels.has(result)
    && !/[\u0000-\u001f\u007f]/.test(result) ? result : null;
};

async function listAppointments(date: string, context: AdapterContext, _options?: { navigate: boolean }, capture?: ConfiguredCapture): Promise<AppointmentsResult> {
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
  const unchanged = () => {
    if (controller.signal.aborted) return false;
    try {
      if ((context.currentUrl?.() ?? context.url).href !== context.url.href ||
          context.doc.querySelector('input[name="__RequestVerificationToken"]')?.getAttribute('value') !== token) controller.abort();
    } catch {
      controller.abort();
    }
    return !controller.signal.aborted;
  };
  if (!unchanged()) return readFailed();
  const requestSignal = () => AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
  const providersFromPage = domProviders(context.doc);
  let resources: Promise<Map<string, string>> | undefined;
  const readResources = async (): Promise<Map<string, string>> => {
    const providers = new Map<string, string>();
    try {
      if (!unchanged()) return providers;
      const now = new Date();
      const pad = (value: number, length = 2) => String(value).padStart(length, '0');
      const response = await context.fetch('/Practice/Calendar/GetCalendarResources', {
        method: 'POST', credentials: 'include', redirect: 'error', signal: requestSignal(),
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({
          day: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}`,
          calendarResourceGroupId: '0', __RequestVerificationToken: token,
        }),
      });
      if (!unchanged() || !response.ok) return providersFromPage;
      const payload = await response.json();
      if (!unchanged() || !Array.isArray(payload) || payload.length > 2000) return providersFromPage;
      for (const row of payload) {
        if (row && isId(row.id) && !providerSentinels.has(String(row.id)) && typeof row.name === 'string' && row.name.trim()) {
          providers.set(String(row.id), row.name.trim());
        }
      }
    } catch {
      unchanged();
    }
    for (const [id, name] of providersFromPage) providers.set(id, name);
    return providers;
  };
  const read = async (): Promise<AppointmentsResult> => {
    if (!unchanged()) return readFailed();
    const calendar = await context.fetch('/Practice/Calendar/GetPracticeAppointmentsForToggleOn', {
      method: 'POST', credentials: 'include', redirect: 'error', body, signal: requestSignal(),
    });
    if (!unchanged() || !calendar.ok) return readFailed();
    const response = await calendar.json();
    if (!unchanged() || !Array.isArray(response) || response.length > 2000) return readFailed();
    type Failure = Extract<AppointmentsResult, { ok: true }>['failures'][number];
    const readRow = async (row: typeof response[number]): Promise<Appointment | Failure | null> => {
      const appointmentId = visitId(row?.id);
      if (!row || typeof row !== 'object' || typeof row.title !== 'string' ||
          !appointmentId || !isId(row.patientId) || typeof row.start !== 'string') {
        return { code: 'invalid_appointment', startsAt: null };
      }
      const doc = parseHtml(row.title);
      const confirm = doc.querySelector('img[src*="ConfirmStatusIcons/"]')?.getAttribute('alt')?.trim() ?? '';
      const recordSync = (start: string, clinician: unknown, status: 'active' | 'cancelled') => {
        if (!capture) return;
        const patientId = syncId(row.patientId), clinicianId = syncId(clinician);
        if (!patientId || !clinicianId || !Number.isFinite(Date.parse(start))) {
          capture.failures.push({ appointment_id: appointmentId, code: 'identity_missing' });
          return;
        }
        capture.items.push({ appointment_id: appointmentId, patient_id: patientId, clinician_id: clinicianId, encounter_id: null,
          starts_at: new Date(start).toISOString(), ends_at: null, status });
      };
      if (/^cancell?ed$/i.test(confirm)) { recordSync(row.start, row.resourceId, 'cancelled'); return null; }
      const startsAt = Date.parse(row.start);
      if (!Number.isFinite(startsAt)) {
        return { code: 'invalid_appointment', startsAt: null };
      }
      const patientName = parseHtml(row.title.split(/<br\s*\/?>/i)[0]).body.textContent?.trim();
      if (!patientName) {
        return { code: 'invalid_appointment', startsAt: new Date(startsAt).toISOString() };
      }
      try {
        const tooltipBody = new FormData();
        tooltipBody.set('id', appointmentId);
        tooltipBody.set('__RequestVerificationToken', token);
        if (!unchanged()) return null;
        const tooltip = await context.fetch('/Practice/Calendar/GetToolTip', {
          method: 'POST', credentials: 'include', redirect: 'error', body: tooltipBody, signal: requestSignal(),
        });
        if (!unchanged()) return null;
        if (!tooltip.ok) throw new TypeError();
        const html = await tooltip.text();
        if (!unchanged()) return null;
        const parsed = details(html);
        if (!parsed) return { code: 'tooltip_not_parsed', startsAt: new Date(startsAt).toISOString() };
        if (!unchanged()) return null;
        const visit = await context.fetch('/Practice/Calendar/GetVisit', {
          method: 'POST', credentials: 'include', redirect: 'error', signal: requestSignal(),
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            __RequestVerificationToken: token,
          },
          body: JSON.stringify({ id: Number(appointmentId), viewType: 'agendaDay' }),
        });
        if (!unchanged()) return null;
        if (!visit.ok) throw new TypeError();
        const payload = await visit.json();
        if (!unchanged()) return null;
        if (!payload || payload.status !== true || typeof payload.html !== 'string' || !payload.html.trim()) throw new TypeError();
        const form = parseHtml(payload.html);
        const selected = (id: string) => selectedOption(form, id);
        if (form.querySelector('input#IsActive')?.getAttribute('value')?.toLowerCase() === 'false') {
          capture?.failures.push({ appointment_id: appointmentId, code: 'read_failed' });
          return null;
        }
        if (/^cancell?ed$/i.test(selected('ConfirmStatusId')?.textContent?.trim() ?? '')) {
          const hasAssignments = !!form.querySelector('select#ResourceId, select#EmployeeId');
          const clinician = hasAssignments ? syncId(selected('ResourceId')?.getAttribute('value')) ?? syncId(selected('EmployeeId')?.getAttribute('value')) : row.resourceId;
          recordSync(row.start, clinician, 'cancelled');
          return null;
        }
        const start = visitStart(form);
        if (!start) return { code: 'tooltip_not_parsed', startsAt: new Date(startsAt).toISOString() };
        if (start.getTime() < Date.parse(bounds.start) || start.getTime() >= Date.parse(bounds.end)) return null;
        const resource = selected('ResourceId');
        const employee = selected('EmployeeId');
        const hasLiveAssignments = !!form.querySelector('select#ResourceId, select#EmployeeId');
        const assignedResource = hasLiveAssignments ? resource?.getAttribute('value') : row.resourceId;
        const resourceId = isId(assignedResource) && !providerSentinels.has(String(assignedResource)) ? String(assignedResource) : null;
        const providersById = resourceId ? await (resources ??= readResources()) : providersFromPage;
        if (!unchanged()) return null;
        const resourceName = resourceId ? providersById.get(resourceId) : null;
        const assignedEmployee = hasLiveAssignments ? employee?.textContent?.trim() : parsed.vet;
        const employeeName = Array.from(providersById.values()).find((name) => name.trim().toLowerCase() === assignedEmployee?.trim().toLowerCase());
        const providers = [
          resourceName || (resourceId ? resource?.textContent?.trim() : null),
          employeeName || assignedEmployee,
        ].filter((name): name is string => !!name && name !== '- None -');
        parsed.vet = Array.from(new Set(providers))[0] ?? null;
        const clinicianId = syncId(assignedResource) ?? (hasLiveAssignments ? syncId(employee?.getAttribute('value')) : null);
        recordSync(start.toISOString(), clinicianId, 'active');
        return { appointmentId, start: start.toISOString(), patientName, ...parsed };
      } catch {
        if (!unchanged()) return null;
        return { code: 'tooltip_fetch_failed', startsAt: new Date(startsAt).toISOString() };
      }
    };
    const results: (Appointment | Failure | null)[] = new Array(response.length);
    let next = 0;
    const work = async () => {
      while (next < response.length && unchanged()) {
        const index = next++;
        results[index] = await readRow(response[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, response.length) }, work));
    if (!unchanged()) return readFailed();
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

export async function capturePulseAppointments(date: string, context: AdapterContext): Promise<ConfiguredCapture> {
  const captured: ConfiguredCapture = { items: [], failures: [] };
  const result = await listAppointments(date, context, undefined, captured);
  if (!result.ok) throw { code: 'invalid_capture' };
  captured.failures.push(...result.failures.map(() => ({ appointment_id: null, code: 'read_failed' as const })));
  return captured;
}

export const pulse: PimsAdapter = {
  id: 'pulse',
  status: (context) => routeStatus(context, null, null, false),
  listFields,
  write: async () => ({ ok: false, code: 'not_writable' }),
  listAppointments,
  patientNumber: async () => null,
  syncSource: (context, binding, options) => configuredSyncSource(context, binding, date => capturePulseAppointments(date, context), options),
};
