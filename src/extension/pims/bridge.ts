import { createNoteAutofill, identifyNoteProvider, isNoteAutofillRequest, type NoteAutofillRequest, type NoteAutofillResult, type NoteProvider } from './noteAutofill';
import { createRadiologyAutofill, type RadiologyAutofillRequest } from './radiologyAutofill';
import { normaliseName } from '../../utils/pims/patientMatch';
import type { Diagnostics } from '../ezyvet/read';
import { EXTENSION_VERSION } from '../version';
import { createInstinctSubmission, isInstinctSubmissionRequest, type InstinctSubmissionRequest, type InstinctSubmissionResult } from './instinctSubmission';
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

function createInstinctSubmissionBridge(adapterNow: () => PimsAdapter | null, contextNow: () => AdapterContext) {
  let active: { doc: Document; identity: string; uploader: ReturnType<typeof createInstinctSubmission>; valid: boolean } | undefined;
  const observe = (context: AdapterContext, adapter: PimsAdapter | null) => {
    let identity: string;
    try { identity = JSON.stringify([adapter?.id, context.url.href, context.currentUrl?.().href,
      context.sessionStorage.getItem('instinct:user-state')]); }
    catch { identity = ''; }
    if (active && (active.doc !== context.doc || active.identity !== identity || !identity)) {
      active.valid = false;
      active = undefined;
    }
    return identity;
  };
  const execute = async (request: InstinctSubmissionRequest): Promise<InstinctSubmissionResult> => {
    if (!isInstinctSubmissionRequest(request)) return { state: 'blocked' };
    const context = contextNow(), adapter = adapterNow();
    const identity = observe(context, adapter);
    if (adapter?.id !== 'instinct' || !identity) return { state: 'blocked' };
    if (!active) {
      if (request.operation !== 'prepare') return { state: 'blocked' };
      const entry = { doc: context.doc, identity, valid: true, uploader: undefined as unknown as ReturnType<typeof createInstinctSubmission> };
      entry.uploader = createInstinctSubmission({ ...context, currentUrl: () => {
        const live = contextNow();
        observe(live, adapterNow());
        return entry.valid ? live.currentUrl?.() ?? live.url : new URL('https://invalid.invalid/');
      } });
      const invalidate = () => { entry.valid = false; if (active === entry) active = undefined; };
      const view = context.doc.defaultView;
      for (const event of ['popstate', 'hashchange', 'pagehide']) view?.addEventListener(event, invalidate, { once: true });
      (view as (Window & { navigation?: EventTarget }) | null)?.navigation?.addEventListener('navigate', invalidate, { once: true });
      active = entry;
    }
    return active.uploader.execute(request);
  };
  return Object.assign(execute, { observe });
}

function createNoteAutofillBridge(adapterNow: () => PimsAdapter | null, contextNow: () => AdapterContext) {
  type Entry = { doc: Document; href: string; provider: NoteProvider; valid: boolean; writer: ReturnType<typeof createNoteAutofill> };
  let active: Entry | undefined;
  const observe = (context: AdapterContext, adapter: PimsAdapter | null) => {
    if (!active) return;
    const href = (context.currentUrl?.() ?? context.url).href;
    if (active && (active.doc !== context.doc || active.href !== href || context.url.href !== href
      || identifyNoteProvider(href) !== active.provider || adapter?.id !== active.provider)) {
      active.valid = false;
      active.writer.dispose();
      active = undefined;
    }
  };
  const execute = async (request: NoteAutofillRequest): Promise<NoteAutofillResult> => {
    if (!isNoteAutofillRequest(request)) return { state: 'blocked' };
    const context = contextNow(), adapter = adapterNow();
    observe(context, adapter);
    // Explicit inspection starts a newly reviewed source after session/navigation invalidation.
    // Fills never rebuild a lost source or reuse its tickets.
    if (request.operation === 'inspect' && active) {
      active.valid = false; active.writer.dispose(); active = undefined;
    }
    const provider = identifyNoteProvider(context.url.href);
    if (!provider || adapter?.id !== provider || (context.currentUrl?.() ?? context.url).href !== context.url.href) return { state: 'blocked' };
    if (!active) {
      // A fill must refer to an existing in-page preparation; never reconstruct it.
      if (request.operation === 'fill') return { state: 'blocked' };
      const entry: Entry = { doc: context.doc, href: context.url.href, provider, valid: true, writer: undefined as unknown as Entry['writer'] };
      entry.writer = createNoteAutofill({ ...context, currentUrl: () => {
        const live = contextNow();
        observe(live, adapterNow());
        return entry.valid && live.doc === entry.doc && adapterNow()?.id === entry.provider
          ? live.currentUrl?.() ?? live.url : new URL('https://invalid.invalid/');
      } });
      active = entry;
    }
    try { return await active.writer.execute(request); }
    catch { return { state: request.operation === 'fill' ? 'unknown' : 'blocked' }; }
  };
  return Object.assign(execute, { observe });
}

export function createPageBridge(adapterNow: () => PimsAdapter | null, contextNow: () => AdapterContext) {
  const physicalExam = createPhysicalExamBridge(adapterNow, contextNow);
  const noteAutofill = createNoteAutofillBridge(adapterNow, contextNow);
  let radiology: { doc: Document; url: string; writer: ReturnType<typeof createRadiologyAutofill> } | undefined;
  const observeRadiology = (context: AdapterContext) => {
    if (radiology && (radiology.doc !== context.doc || radiology.url !== (context.currentUrl?.() ?? context.url).href)) {
      radiology.writer.dispose();
      radiology = undefined;
    }
  };
  const radiologyAutofill = (request: RadiologyAutofillRequest) => {
    const context = contextNow();
    observeRadiology(context);
    if (!radiology) {
      radiology = { doc: context.doc, url: context.url.href, writer: createRadiologyAutofill({ ...context, currentUrl: () => {
        const live = contextNow();
        return live.doc === context.doc ? live.currentUrl?.() ?? live.url : new URL('https://invalid.invalid/');
      } }) };
    }
    return radiology.writer.execute(request);
  };
  const instinctSubmission = createInstinctSubmissionBridge(adapterNow, contextNow);
  return {
    version: EXTENSION_VERSION,
    radiologyAutofill,
    noteAutofill,
    physicalExam,
    instinctSubmission,
    providerSync: createSyncBridge((identity, options) => {
      const adapter = adapterNow(), context = contextNow();
      return adapter?.id === identity?.provider ? adapter.syncSource?.({ ...context, currentUrl: () => {
        const live = contextNow();
        return live.doc === context.doc && adapterNow()?.id === identity.provider ? live.currentUrl?.() ?? live.url : new URL('https://invalid.invalid/');
      } }, identity, options) : undefined;
    }),
    status(): Status {
      const adapter = adapterNow();
      const context = contextNow();
      observeRadiology(context);
      noteAutofill.observe(context, adapter);
      const status = adapter?.status(context);
      physicalExam.observe(context, adapter, status);
      instinctSubmission.observe(context, adapter);
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
