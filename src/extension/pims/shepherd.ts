import { identifyPims } from './hosts';
import { dayBounds, isVisible, plainHtml, readFailed, readJson, routeStatus } from './shared';
import type { AdapterContext, Appointment, AppointmentsResult, PimsAdapter, SendItem, WriteResult } from './types';

const fixed = [
  ['Subjective > Initial Complaint', 'soap-initial-complaint-field', 'soap-subjective-save-btn'],
  ['Subjective > Current Medications & Supplements', 'soap-current-medication-field', 'soap-subjective-save-btn'],
  ['Subjective > History', 'soap-medication-history-field', 'soap-subjective-save-btn'],
  ['Assessment > Assessment', 'soap-assesment-form-description', 'soap-assesment-save-btn'],
  ['Assessment > Laboratory', 'lab-note-txtbox', 'laboratory-note-add-btn'],
  ['Assessment > Imaging', 'imaging-note-txtbox', 'imaging-note-add-btn'],
  ['Assessment > Document', 'document-note-txtbox', 'document-note-add-btn'],
  ['Plan/Schedule > Recommendation', 'soap-plan-recommendation-txtBox', 'soap-plan-recommendation-save-btn'],
  ['Plan/Schedule > Notes', 'soap-plan-note-txtbox', 'undefined-note-add-btn'],
] as const;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const selector = (value: string) => `[data-test-id="${value}"]`;
type Field = { title: string; editor: HTMLElement; save: string | null };

function record(url: URL): string | null {
  return identifyPims(url.href) === 'shepherd'
    ? /^\/soap\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})(?:\/|$)/i.exec(url.pathname)?.[1] ?? null : null;
}

function fields(context: AdapterContext): Field[] {
  const result: Field[] = [];
  for (const [title, testId, save] of fixed) {
    for (const parent of Array.from(context.doc.querySelectorAll<HTMLElement>(selector(testId)))) {
      const editors = parent.matches('[contenteditable="true"]') ? [parent] : Array.from(parent.querySelectorAll<HTMLElement>('[contenteditable="true"]'));
      for (const editor of editors) if (isVisible(editor)) result.push({ title, editor, save });
    }
  }
  for (const parent of Array.from(context.doc.querySelectorAll(selector('dynamic-form-element')))) {
    const label = parent.querySelector('.form__group__label')?.textContent?.trim();
    const editors = parent.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea');
    for (const editor of Array.from(editors)) if (label && isVisible(editor)) result.push({ title: `Objective > ${label}`, editor, save: null });
  }
  return result;
}

function writable(editor: HTMLElement): boolean {
  if (!editor.isConnected || !isVisible(editor) || editor.closest('[inert], [aria-disabled="true"]')) return false;
  return editor instanceof HTMLTextAreaElement ? !editor.readOnly && !editor.matches(':disabled') : editor.getAttribute('contenteditable') === 'true';
}

function guard(context: AdapterContext, editor?: HTMLElement): WriteResult | null {
  try {
    const current = context.currentUrl?.() ?? context.url;
    if (current.href !== context.url.href || identifyPims(current.href) !== 'shepherd') return { ok: false, code: 'patient_changed' };
    if (!record(current) || editor && !writable(editor)) return { ok: false, code: 'not_writable' };
    return null;
  } catch {
    return { ok: false, code: 'patient_changed' };
  }
}

async function write(item: SendItem, context: AdapterContext): Promise<WriteResult> {
  if (item.pngDataUrl !== undefined) return { ok: false, code: 'image_not_accepted' };
  if (item.html !== undefined && new DOMParser().parseFromString(item.html, 'text/html').querySelector('img, svg, picture, image')) return { ok: false, code: 'image_not_accepted' };
  const initial = guard(context);
  if (initial) return initial;
  const matches = fields(context).filter(({ title }) => title === item.fieldTitle);
  if (matches.length !== 1) return { ok: false, code: 'field_not_found' };
  const field = matches[0];
  const editor = field.editor;
  const previousHtml = editor.innerHTML;
  const richHtml = plainHtml(item).split('<br>').map((line) => `<p>${line}</p>`).join('');
  const insertedText = new DOMParser().parseFromString(richHtml, 'text/html').body.textContent ?? '';
  const normalizeContent = (value: string) => value.replace(/\s+/g, '');
  const expectedContent = normalizeContent((editor.textContent ?? '') + insertedText);
  let expectedValue: string | null = null;
  const contentApplied = () => editor instanceof HTMLTextAreaElement ? editor.value === expectedValue
    : !!insertedText.trim() && editor.innerHTML !== previousHtml && normalizeContent(editor.textContent ?? '') === expectedContent;
  const check = () => guard(context, editor);
  const controls = field.save ? context.doc.querySelectorAll<HTMLButtonElement>(selector(field.save)) : [];
  const save = controls.length === 1 ? controls[0] : null;
  if (field.save && (!save || !isVisible(save))) return { ok: false, code: 'save_button_not_found' };
  if (save && (save.matches(':disabled') || save.closest('[inert], [aria-disabled="true"]'))) return { ok: false, code: 'not_writable' };
  if (!(editor instanceof HTMLTextAreaElement) && (typeof DataTransfer === 'undefined' || typeof ClipboardEvent === 'undefined')) return { ok: false, code: 'not_writable' };
  let autosaveSeen = false;
  const saving = () => !!context.doc.querySelector('.autosave__indicator');
  if (saving()) return { ok: false, code: 'not_writable' };
  try {
    let failure = check();
    if (failure) return failure;
    editor.focus();
    failure = check();
    if (failure) return failure;
    if (editor instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!setter || item.text === undefined) return { ok: false, code: 'not_writable' };
      expectedValue = editor.value ? `${editor.value}\n${item.text}` : item.text;
      setter.call(editor, expectedValue);
      for (const event of ['input', 'change']) {
        failure = check();
        if (failure) return failure;
        editor.dispatchEvent(new Event(event, { bubbles: true }));
        autosaveSeen ||= saving();
      }
      failure = check();
      if (failure) return failure;
      editor.blur();
    } else {
      editor.click();
      failure = check();
      if (failure) return failure;
      editor.querySelector('.ProseMirror-trailingBreak')?.remove();
      failure = check();
      if (failure) return failure;
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/html', richHtml);
      editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }));
      autosaveSeen ||= saving();
      failure = check();
      if (failure) return failure;
      editor.dispatchEvent(new Event('blur', { bubbles: true }));
      failure = check();
      if (failure) return failure;
      context.doc.querySelector<HTMLElement>('#root')?.click();
    }
    failure = check();
    if (failure) return failure;
    autosaveSeen ||= saving();
    if (save) {
      if (!save.isConnected || !isVisible(save)) return { ok: false, code: 'save_button_not_found' };
      if (save.matches(':disabled') || save.closest('[inert], [aria-disabled="true"]')) return { ok: false, code: 'not_writable' };
      save.click();
    }
    for (let attempt = 0; attempt <= 30; attempt++) {
      failure = check();
      if (failure) return failure;
      autosaveSeen ||= saving();
      if (autosaveSeen && !saving() && contentApplied() && (!save || save.disabled || !save.isConnected)) return { ok: true };
      if (attempt === 30) break;
      await context.wait(100);
      failure = check();
      if (failure) return failure;
    }
    return { ok: false, code: 'save_not_confirmed' };
  } catch {
    return check() ?? { ok: false, code: 'save_not_confirmed' };
  }
}

function items(value: unknown, complete = false): unknown[] | null {
  const result = object(value).item;
  if (complete && Array.isArray(result) && (typeof object(value).totalRecords === 'number'
    ? Number(object(value).totalRecords) > result.length : result.length === 1000)) return null;
  return Array.isArray(result) && result.length <= 1000 ? result : null;
}

async function listAppointments(date: string, context: AdapterContext): Promise<AppointmentsResult> {
  const bounds = dayBounds(date);
  if (!bounds || identifyPims(context.url.href) !== 'shepherd' || context.url.port) return readFailed();
  try {
    if ((context.currentUrl?.() ?? context.url).href !== context.url.href) return readFailed();
    const token = object(JSON.parse(context.sessionStorage.getItem('baasic-auth-token-pav2') || '{}')).token;
    if (!text(token)) return readFailed();
    const host = context.url.hostname;
    const base = host.startsWith('app.') ? `https://api.${host.slice(4)}/pav2/` : `${context.url.origin}/api/pav2/`;
    const post = (path: string, body: Record<string, unknown>) => readJson(context, `${base}${path}`, {
      method: 'POST', headers: { Authorization: `BEARER ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const unchanged = () => (context.currentUrl?.() ?? context.url).href === context.url.href;
    const dashboard = items(await post('soaps/dashboard', { pageNumber: 1, pageSize: 1000,
      embed: 'supervisingDoctor,pav2User,patient,patient.clients,location,soapAssignedUsers,soapAssignedUsers.coreUser,soapAssignedUsers.pav2User',
      isDeleted: false, rpp: 1000, page: 1 }), true);
    if (!unchanged() || !dashboard) return readFailed();
    const providerIds: string[] = [];
    for (let page = 1; page <= 50; page++) {
      const result = await post('providers/search', { reactDisposers: 'function () { [native code] }', pageNumber: page, pageSize: 100,
        orderBy: 'coreUser.firstName', orderDirection: 'asc', embed: 'coreUser,coreUser.coreMembership,coreUser.roles,clinicUser,userLicenseType,userTeams',
        search: null, fields: null, isApproved: true, roleIds: null, userLicenseTypeIds: null, teamIds: null, isClient: false,
        fetchClinicLoginUsers: true, sort: 'coreUser.firstName|asc', searchQuery: null, page, rpp: 100 });
      if (!unchanged()) return readFailed();
      const providers = items(result);
      if (!providers) return readFailed();
      const total = object(result).totalRecords;
      if (total !== undefined && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0)) return readFailed();
      for (const provider of providers) {
        const providerId = text(object(provider).id);
        if (!providerId || providerIds.includes(providerId)) return readFailed();
        providerIds.push(providerId);
      }
      if (typeof total === 'number' ? providerIds.length >= total : providers.length < 100) break;
      if (!providers.length) return readFailed();
      if (page === 50) return readFailed();
    }
    const rows = items(await post('appointments/search', { pageNumber: 1, pageSize: 1000,
      embed: 'appointmentPatients,appointmentPatients.patient,appointmentPatients.patient.patientPreferredProviders,appointmentPatients.patient.patientPreferredProviders.provider,appointmentPatients.patient.soapId,client,client.clientInfo,appointmentStatus,appointmentType,provider',
      startDate: bounds.start, endDate: new Date(Date.parse(bounds.end) - 1).toISOString(), providerIds: providerIds.join(','), showCanceled: false, page: 1, rpp: 1000 }), true);
    if (!unchanged() || !rows) return readFailed();
    const appointments: Appointment[] = [];
    const failures: Extract<AppointmentsResult, { ok: true }>['failures'] = [];
    for (const value of [...dashboard.map((row) => ({ row, dashboard: true })), ...rows.map((row) => ({ row, dashboard: false }))]) {
      const row = object(value.row);
      if (row.isDeleted || text(object(row.appointmentStatus).abrv).toLowerCase() === 'canceled') continue;
      const start = Date.parse(text(value.dashboard ? row.dateCheckedIn : row.startDate));
      if (Number.isFinite(start) && (start < Date.parse(bounds.start) || start >= Date.parse(bounds.end))) continue;
      const patients = value.dashboard ? [row.patient] : Array.isArray(row.appointmentPatients) ? row.appointmentPatients.map((entry) => object(entry).patient) : [];
      if (!text(row.id) || !Number.isFinite(start) || patients.length !== 1 || patients.some((patient) => !text(object(patient).name))) {
        failures.push({ code: 'invalid_appointment', startsAt: Number.isFinite(start) ? new Date(start).toISOString() : null });
        continue;
      }
      for (const patient of patients) {
        appointments.push({ appointmentId: text(row.id), start: new Date(start).toISOString(), patientName: text(object(patient).name),
          patientNumber: '', ownerName: text(object(row.client).name), vet: text(object(value.dashboard ? row.supervisingDoctor : row.provider).name) || null });
      }
    }
    return { ok: true, appointments, failures };
  } catch {
    return readFailed();
  }
}

export const shepherd: PimsAdapter = {
  id: 'shepherd',
  status: (context) => routeStatus(context, null, record(context.url), fields(context).some(({ editor }) => writable(editor))),
  listFields: (context) => fields(context).map(({ title }) => ({ title, kind: 'note', acceptsImage: false })),
  write,
  listAppointments,
  patientNumber: async () => null,
};
