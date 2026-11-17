import { normaliseName } from '../../utils/pims/patientMatch';
import type { Diagnostics } from '../ezyvet/read';
import { EXTENSION_VERSION } from '../version';
import { createSyncBridge } from './syncBridge';
import { createShepherdPhysicalExam } from './shepherd';
import { isVisible } from './shared';
import { isPhysicalExamRequest, shepherdObjectiveRecord, type PhysicalExamRequest, type PhysicalExamResult } from './types';
import type { AdapterContext, PimsAdapter, SendItem, Status, WriteResult, WriteTarget } from './types';

const unavailable = (): Status => ({ state: 'notConsult', patientName: null, patientNumber: null, consult: null });

function createPhysicalExamBridge(adapterNow: () => PimsAdapter | null, contextNow: () => AdapterContext) {
  type Preparation = { ticket: string; generation: number; context: AdapterContext; token: string; doctor: HTMLElement; label: string;
    templates: { id: string; label: string; element: HTMLElement }[]; expires: number };
  type Page = { id: string; generation: number; identity?: string; busy: boolean; locked: boolean; preparation?: Preparation };
  const pages = new WeakMap<Document, Page>();
  let activePage: Page | undefined;
  const invalidate = (page: Page) => { page.generation++; page.preparation = undefined; };
  const enabled = (element: HTMLElement) => element.isConnected && isVisible(element)
    && !element.matches(':disabled, .is-disabled') && !element.closest('[inert], [aria-disabled="true"]');
  const token = (context: AdapterContext): string => {
    try {
      const value = JSON.parse(context.sessionStorage.getItem('baasic-auth-token-pav2') || '{}');
      return typeof value?.token === 'string' ? value.token.trim() : '';
    } catch { return ''; }
  };
  const options = (doc: Document) => Array.from(doc.querySelectorAll<HTMLElement>('[data-test-groupid="soap-phyiscalExam"]'));
  const observe = (context: AdapterContext, adapter: PimsAdapter | null, status: Status | undefined) => {
    const page = pages.get(context.doc);
    if (activePage && activePage !== page) invalidate(activePage);
    activePage = page;
    if (!page) return;
    const identity = JSON.stringify([adapter?.id, context.url.href, context.currentUrl?.().href,
      token(context), status?.consult?.recordId, status?.consult?.viewId]);
    if (page.identity !== undefined && page.identity !== identity) invalidate(page);
    page.identity = identity;
  };
  const title = (element: HTMLElement) => element.querySelector('[data-test-id="soap-physicalExam-name"]')?.textContent?.trim() ?? '';
  const doctor = (doc: Document) => {
    const selections = doc.querySelectorAll<HTMLElement>('[data-test-id="soap-physicalExam-doctor-control"] .react-select__single-value');
    return selections.length === 1 && enabled(selections[0]) && selections[0].textContent?.trim() ? selections[0] : null;
  };
  const execute = async (request: PhysicalExamRequest): Promise<PhysicalExamResult> => {
    if (!isPhysicalExamRequest(request)) return { ok: false, code: 'invalid_request' };
    const context = contextNow();
    let page = pages.get(context.doc);
    if (!page) {
      page = { id: crypto.randomUUID(), generation: 0, busy: false, locked: false };
      pages.set(context.doc, page);
      const currentPage = page;
      const navigation = () => invalidate(currentPage);
      const view = context.doc.defaultView;
      view?.addEventListener('popstate', navigation);
      view?.addEventListener('hashchange', navigation);
      view?.addEventListener('pagehide', navigation);
      const navigationApi = (view as (Window & { navigation?: EventTarget }) | null)?.navigation;
      navigationApi?.addEventListener('navigate', navigation);
    }
    if (page.locked || page.busy) return { ok: false, code: 'physical_exam_outcome_unknown' };
    const adapter = adapterNow();
    const status = adapter?.status(context);
    observe(context, adapter, status);
    if (adapter?.id !== 'shepherd' || !status?.consult || status.consult.recordId !== request.target.consult.recordId
      || status.consult.viewId !== request.target.consult.viewId) {
      invalidate(page); return { ok: false, code: 'patient_changed' };
    }
    if (!context.currentUrl || context.currentUrl().href !== context.url.href || context.url.port
      || !shepherdObjectiveRecord(context.url) || !token(context)) {
      invalidate(page); return { ok: false, code: 'not_writable' };
    }
    if (request.operation === 'inspect') return { ok: true, state: 'available', pageId: page.id };
    if (request.pageId !== page.id) { invalidate(page); return { ok: false, code: 'patient_changed' }; }
    const initialToken = token(context);
    const initialHref = context.url.href;
    const initialGeneration = page.generation;
    const unchanged = () => {
      const live = contextNow();
      const same = page.generation === initialGeneration && live.doc === context.doc && adapterNow()?.id === 'shepherd' && live.url.href === initialHref
        && live.currentUrl?.().href === initialHref && token(live) === initialToken;
      if (!same) invalidate(page);
      return same;
    };
    if (request.operation === 'prepare') {
      page.preparation = undefined;
      page.busy = true;
      try {
        if (!options(context.doc).length) {
          const buttons = context.doc.querySelectorAll<HTMLElement>('[data-test-id="soap-objective-addPhysicalExam-btn"]');
          if (buttons.length !== 1 || !enabled(buttons[0]) || !unchanged()) return { ok: false, code: 'not_writable' };
          buttons[0].click();
          for (let attempt = 0; attempt < 50 && !options(context.doc).length; attempt++) {
            if (!unchanged()) return { ok: false, code: 'patient_changed' };
            await context.wait(100);
          }
        }
        if (!unchanged()) return { ok: false, code: 'patient_changed' };
        const all = options(context.doc);
        const templates = all.filter(element => enabled(element) && title(element) && title(element).length <= 300
          && all.filter(candidate => title(candidate) === title(element)).length === 1)
          .map(element => ({ id: crypto.randomUUID(), label: title(element), element }));
        if (!templates.length || templates.length > 200) return { ok: false, code: 'physical_exam_template_not_found' };
        const selection = doctor(context.doc);
        const label = selection?.textContent?.trim() ?? '';
        if (!selection || label.length > 300) return { ok: false, code: 'supervising_doctor_not_set' };
        const ticket = crypto.randomUUID();
        page.preparation = { ticket, generation: initialGeneration, context, token: initialToken, doctor: selection, label, templates, expires: Date.now() + 120_000 };
        return { ok: true, state: 'prepared', pageId: page.id, ticket, doctor: label, templates: templates.map(({ id, label: name }) => ({ id, label: name })) };
      } catch { return { ok: false, code: 'not_writable' }; }
      finally { page.busy = false; }
    }
    const prepared = page.preparation;
    page.preparation = undefined;
    if (!prepared || prepared.generation !== initialGeneration || request.ticket !== prepared.ticket || Date.now() > prepared.expires || prepared.context.url.href !== initialHref
      || prepared.token !== initialToken || !unchanged()) return { ok: false, code: 'patient_changed' };
    const selection = doctor(context.doc);
    if (!selection || selection !== prepared.doctor || selection.textContent?.trim() !== prepared.label) return { ok: false, code: 'supervising_doctor_not_set' };
    const template = prepared.templates.find(entry => entry.id === request.templateId);
    if (!template || !enabled(template.element) || title(template.element) !== template.label
      || options(context.doc).filter(element => title(element) === template.label).length !== 1) return { ok: false, code: 'physical_exam_template_not_found' };
    page.locked = true;
    page.busy = true;
    try {
      const result = await createShepherdPhysicalExam(template.label, { ...prepared.context, currentUrl: () => {
        const live = contextNow();
        return live.doc === context.doc && adapterNow()?.id === 'shepherd' && token(live) === initialToken
          ? live.currentUrl!() : new URL('https://invalid.invalid/');
      } });
      if (!result.ok && result.code !== 'physical_exam_outcome_unknown') page.locked = false;
      return result;
    } catch { return { ok: false, code: 'physical_exam_outcome_unknown' }; }
    finally { page.busy = false; }
  };
  return Object.assign(execute, { observe });
}

export function createPageBridge(adapterNow: () => PimsAdapter | null, contextNow: () => AdapterContext) {
  const physicalExam = createPhysicalExamBridge(adapterNow, contextNow);
  return {
    version: EXTENSION_VERSION,
    physicalExam,
    providerSync: createSyncBridge((identity) => {
      const adapter = adapterNow();
      return adapter?.id === identity?.provider ? adapter.syncSource?.(contextNow(), identity) : undefined;
    }),
    status(): Status {
      const adapter = adapterNow();
      const context = contextNow();
      const status = adapter?.status(context);
      physicalExam.observe(context, adapter, status);
      return adapter && status ? { ...status, provider: adapter.id } : unavailable();
    },
    listFields() {
      const adapter = adapterNow();
      return adapter?.listFields(contextNow()) ?? [];
    },
    async write(item: SendItem, target: WriteTarget): Promise<WriteResult> {
      const adapter = adapterNow();
      if (!adapter) return { ok: false, code: 'not_writable' };
      const context = contextNow();
      const status = adapter.status(context);
      if (status.state !== 'writable') return { ok: false, code: 'not_writable' };
      if (!target || adapter.id !== target.provider || !status.consult?.recordId || !target.consult ||
          status.consult.recordId !== target.consult.recordId || status.consult.viewId !== target.consult.viewId ||
          (status.patientName === null ? target.patientName !== null : target.patientName === null ||
            normaliseName(status.patientName) !== normaliseName(target.patientName))) {
        return { ok: false, code: 'patient_changed' };
      }
      return adapter.write(item, context);
    },
    diagnostics(): Diagnostics {
      const adapter = adapterNow();
      const context = contextNow();
      if (adapter?.diagnostics) return { ...adapter.diagnostics(context), provider: adapter.id };
      return {
        version: EXTENSION_VERSION, provider: adapter?.id, state: adapter?.status(context).state ?? 'notConsult',
        selectorHits: {}, fields: adapter?.listFields(context) ?? [],
        hasJaxmanager: false, hasHugerte: false, hasLexical: false,
      };
    },
    async listAppointments(date: string, options: { navigate: boolean }) {
      const adapter = adapterNow();
      if (!adapter) return { ok: false as const, code: 'read_failed' as const };
      const result = await adapter.listAppointments(date, contextNow(), options);
      return result.ok ? { ...result, appointments: result.appointments.map((appointment) => ({ ...appointment, provider: adapter.id })) } : result;
    },
    async consultPatientNumber(recordId: string) {
      const adapter = adapterNow();
      return adapter ? adapter.patientNumber(recordId, contextNow()) : null;
    },
  };
}
