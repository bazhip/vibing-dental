import { describe, expect, it, vi } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import manifest from './manifest.json';
import { DEV_EXTENSION_ID } from './extensionId';
import { handleExternal, handleInternal, installListeners, pickEzyvetTab, type Deps, type EzyvetTab } from './background';
import { ALLOWED_ORIGINS, allowedOrigins, HANDOVER_TTL_MS, WEB_APP_ORIGIN, type Handover, type Request } from './protocol';
import type { SendItem } from '../utils/pims/mapping';
import { createPageBridge } from './pims/bridge';
import { shepherd } from './pims/shepherd';
import type { AdapterContext, PhysicalExamRequest, PhysicalExamResult } from './pims/types';

describe('explicit Shepherd exam setup', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  afterEach(() => vi.unstubAllGlobals());
  const recordId = '12345678-1234-1234-1234-123456789abc';
  const examId = 'aaaaaaaa-1234-1234-1234-123456789abc';
  function fixture() {
    const doc = document.implementation.createHTMLDocument();
    const session = new Map([['baasic-auth-token-pav2', '{"token":"secret"}']]);
    let url = new URL(`https://app.shepherd.vet/soap/${recordId}/objective`);
    let provider = shepherd;
    const context: AdapterContext = { doc, url, currentUrl: () => url, fetch: vi.fn(), localStorage,
      sessionStorage: { getItem: (key: string) => session.get(key) ?? null } as Storage, wait: async () => undefined };
    const contextNow = () => ({ ...context, url });
    doc.body.innerHTML = '<button data-test-id="soap-objective-addPhysicalExam-btn">Add</button>';
    const activate = vi.fn(() => {
      url = new URL(`https://app.shepherd.vet/soap/${recordId}/objective/physical-exam-entry/edit/${examId}`);
      doc.body.insertAdjacentHTML('beforeend', '<div data-test-id="dynamic-form-element"><label class="form__group__label">Mouth</label><textarea></textarea></div>');
    });
    const picker = () => {
      doc.body.insertAdjacentHTML('beforeend', '<div data-test-id="soap-physicalExam-doctor-control"><span class="react-select__single-value">Dr Rivera</span></div><button data-test-groupid="soap-phyiscalExam"><span data-test-id="soap-physicalExam-name">Dental</span></button>');
      doc.querySelector<HTMLElement>('[data-test-groupid]')!.onclick = activate;
    };
    doc.querySelector('button')!.onclick = picker;
    const bridge = createPageBridge(() => provider, contextNow);
    const target = { provider: 'shepherd' as const, consult: shepherd.status(context).consult! };
    const prepare = async () => {
      const available = await bridge.physicalExam({ operation: 'inspect', target });
      if (!available.ok || available.state !== 'available') throw new TypeError();
      const prepared = await bridge.physicalExam({ operation: 'prepare', target, pageId: available.pageId });
      if (!prepared.ok || prepared.state !== 'prepared') throw new TypeError();
      const request: PhysicalExamRequest = { operation: 'open', target, pageId: prepared.pageId, ticket: prepared.ticket, templateId: prepared.templates[0].id };
      return { prepared, request };
    };
    return { bridge, target, context, doc, activate, prepare, picker, session,
      changeUrl: (value: string) => { url = new URL(value); },
      changeProvider: () => { provider = { ...shepherd, id: 'instinct' }; } };
  }
  it('only opens after explicit preparation and template selection; never writes content or claims saved', async () => {
    const { bridge, target, activate, prepare, context, doc } = fixture();
    expect((await bridge.physicalExam({ operation: 'inspect', target })).ok).toBe(true);
    expect(doc.querySelector('[data-test-groupid]')).toBeNull();
    const { prepared, request } = await prepare();
    expect(prepared.doctor).toBe('Dr Rivera');
    expect(activate).not.toHaveBeenCalled();
    expect(await bridge.physicalExam(request)).toEqual({ ok: true, state: 'opened', recordId, examId });
    expect(activate).toHaveBeenCalledOnce();
    expect(context.fetch).not.toHaveBeenCalled();
  });
  it.each(['doctor', 'template', 'session', 'provider', 'url', 'pageId', 'ticket'])('refuses a changed %s before activation', async (change) => {
    const state = fixture();
    const { request } = await state.prepare();
    if (change === 'doctor') state.doc.querySelector('.react-select__single-value')!.textContent = 'Dr Other';
    if (change === 'template') state.doc.querySelector('[data-test-groupid]')!.remove();
    if (change === 'session') state.session.set('baasic-auth-token-pav2', '{"token":"different"}');
    if (change === 'provider') state.changeProvider();
    if (change === 'url') state.changeUrl(`https://app.shepherd.vet/soap/${examId}/objective`);
    if (change === 'pageId' && request.operation === 'open') request.pageId = 'stale';
    if (change === 'ticket' && request.operation === 'open') request.ticket = 'stale';
    expect((await state.bridge.physicalExam(request)).ok).toBe(false);
    expect(state.activate).not.toHaveBeenCalled();
  });
  it('requires authentication and a preselected doctor, never choosing one', async () => {
    const state = fixture();
    state.session.clear();
    expect(await state.bridge.physicalExam({ operation: 'inspect', target: state.target })).toEqual({ ok: false, code: 'not_writable' });
    state.session.set('baasic-auth-token-pav2', '{"token":"secret"}');
    state.picker();
    state.doc.querySelector('.react-select__single-value')!.remove();
    const available = await state.bridge.physicalExam({ operation: 'inspect', target: state.target });
    expect(available.ok && available.state === 'available' && await state.bridge.physicalExam({ operation: 'prepare', target: state.target, pageId: available.pageId })).toEqual({ ok: false, code: 'supervising_doctor_not_set' });
    expect(state.activate).not.toHaveBeenCalled();
  });
  it('locks an unknown outcome across new requests and fresh contexts for this document', async () => {
    const state = fixture();
    const { request } = await state.prepare();
    state.doc.querySelector<HTMLElement>('[data-test-groupid]')!.onclick = state.activate.mockImplementation(() => undefined);
    expect(await state.bridge.physicalExam(request)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(await state.bridge.physicalExam({ operation: 'inspect', target: state.target })).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(await state.bridge.physicalExam(request)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(state.activate).toHaveBeenCalledOnce();
  });
  it('retains original session identity while the picker is opening', async () => {
    const state = fixture();
    state.doc.querySelector('button')!.onclick = () => { state.session.clear(); state.picker(); };
    const available = await state.bridge.physicalExam({ operation: 'inspect', target: state.target });
    expect(available.ok && available.state === 'available' && await state.bridge.physicalExam({ operation: 'prepare', target: state.target, pageId: available.pageId })).toEqual({ ok: false, code: 'patient_changed' });
    expect(state.activate).not.toHaveBeenCalled();
  });
  it('routes only authenticated, validated requests to the exact Shepherd tab', async () => {
    const state = fixture();
    const { deps } = makeDeps([{ ...tab(7), url: state.context.url.href }]);
    deps.page.physicalExam = vi.fn(async () => ({ ok: false, code: 'not_writable' } as PhysicalExamResult));
    const request: Request = { type: 'physicalExam', tabId: 7, request: { operation: 'inspect', target: state.target } };
    await handleExternal(request, okSender, deps);
    expect(deps.page.physicalExam).toHaveBeenCalledOnce();
    await handleExternal(request, { origin: 'https://attacker.example' }, deps);
    await handleInternal(request, { id: 'other', url: 'chrome-extension://other/' }, 'own', deps);
    for (const bad of [ { ...request, tabId: 8 }, { ...request, tabId: '7' }, { ...request, request: {} },
      { ...request, request: { operation: 'open', target: state.target } },
      { ...request, request: { operation: 'inspect', target: { ...state.target, provider: 'instinct' } } }]) {
      expect((await handleExternal(bad as Request, okSender, deps) as { ok: boolean }).ok).toBe(false);
    }
    expect(deps.page.physicalExam).toHaveBeenCalledOnce();
  });
  it.each(['unknown', 'lost', 'opened'])('keeps %s exam attempts blocked after tab, bridge and worker replacement', async outcome => {
    vi.stubGlobal('crypto', webcrypto);
    try {
      const state = fixture();
      const { request } = await state.prepare();
      const durable = new Map<string, unknown>();
      const storage = { get: async (key: string) => durable.get(key), set: async (key: string, value: unknown) => { durable.set(key, value); }, remove: async (key: string) => { durable.delete(key); } };
      const first = makeDeps([{ ...tab(7), url: state.context.url.href }]).deps;
      Object.assign(first, { examAttempts: storage });
      first.page.physicalExam = vi.fn(async (): Promise<PhysicalExamResult> => {
        expect(durable.size).toBe(1);
        if (outcome === 'lost') throw new TypeError();
        return outcome === 'opened' ? { ok: true, state: 'opened', recordId, examId } : { ok: false, code: 'physical_exam_outcome_unknown' };
      });
      await handleExternal({ type: 'physicalExam', tabId: 7, request }, okSender, first);
      expect(first.page.physicalExam).toHaveBeenCalledOnce();
      const replacement = makeDeps([{ ...tab(8), url: state.context.url.href }]).deps;
      Object.assign(replacement, { examAttempts: { ...storage } });
      replacement.page.physicalExam = vi.fn(async (): Promise<PhysicalExamResult> => ({ ok: true, state: 'opened', recordId, examId }));
      expect(await handleExternal({ type: 'physicalExam', tabId: 8, request }, okSender, replacement)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
      expect(await handleExternal({ type: 'physicalExam', tabId: 8, request: { operation: 'inspect', target: state.target } }, okSender, replacement)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
      expect(replacement.page.physicalExam).not.toHaveBeenCalled();
      expect(JSON.stringify([...durable])).not.toContain(recordId);
      expect(JSON.stringify([...durable])).not.toContain('secret');
    } finally { vi.unstubAllGlobals(); }
  });
  it('serializes simultaneous exam opens across two tabs and fails closed without durable storage', async () => {
    vi.stubGlobal('crypto', webcrypto);
    try {
      const state = fixture(), { request } = await state.prepare();
      const durable = new Map<string, unknown>();
      const { deps } = makeDeps([7,8].map(id => ({ ...tab(id), url: state.context.url.href })));
      Object.assign(deps, { examAttempts: { get: async (key: string) => durable.get(key), set: async (key: string, value: unknown) => { await Promise.resolve(); durable.set(key, value); }, remove: async (key: string) => { durable.delete(key); } } });
      deps.page.physicalExam = vi.fn(async (): Promise<PhysicalExamResult> => ({ ok: false, code: 'physical_exam_outcome_unknown' }));
      await Promise.all([7,8].map(tabId => handleExternal({ type: 'physicalExam', tabId, request }, okSender, deps)));
      expect(deps.page.physicalExam).toHaveBeenCalledOnce();
      Object.assign(deps, { examAttempts: undefined });
      await handleExternal({ type: 'physicalExam', tabId: 7, request }, okSender, deps);
      expect(deps.page.physicalExam).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});

const okSender = { origin: 'https://toothops.app' };
it('routes provider sync only to the explicitly selected supported tab and matching origin', async () => {
  const { deps } = makeDeps([{ ...tab(7), url: 'https://clinic.rhapsody.vet/schedule?businessId=business' }]);
  deps.page.providerSync = vi.fn(async () => ({ ok: false, code: 'unavailable' } as const));
  const identity = { provider: 'rhapsody' as const, origin: 'https://clinic.rhapsody.vet', tenant_id: 'business', connection_revision: 1 };
  const request: Request = { type: 'providerSync', tabId: 7, request: { operation: 'open', identity } };
  await handleExternal(request, okSender, deps);
  expect(deps.page.providerSync).toHaveBeenCalledTimes(1);
  await handleExternal({ ...request, tabId: 8 }, okSender, deps);
  await handleExternal(request, { origin: 'https://attacker.example' }, deps);
  await handleExternal({ ...request, request: { operation: 'open', identity: { ...identity, origin: 'https://other.rhapsody.vet' } } }, okSender, deps);
  expect(deps.page.providerSync).toHaveBeenCalledTimes(1);
});
const tab = (id: number, o: { lastAccessed?: number; active?: boolean; focusedWindow?: boolean } = {}) =>
  ({ id, title: `Tab ${id}`, ...o }) as EzyvetTab;
const a: SendItem = { fieldTitle: 'Plan', text: 'a' };
const b: SendItem = { fieldTitle: 'Diagnosis', text: 'b' };

type FakeDeps = Deps & { page: Deps['page'] & { statusValue: unknown } };
const consult = { viewId: '1', recordId: '4521' };
const otherConsult = { viewId: '1', recordId: '9999' };
function makeDeps(tabs: EzyvetTab[] = [tab(1, { active: true, focusedWindow: true })]) {
  const state = { status: { state: 'writable', patientName: 'Bella', patientNumber: null, consult } as unknown };
  const store = new Map<string, unknown>();
  const examStore = new Map<string, unknown>();
  const clock = { now: 1_000_000 };
  const deps = {
    version: 'dev',
    lastCodes: [],
    queryEzyvetTabs: async () => tabs,
    focusTab: vi.fn(async () => undefined),
    page: {
      status: vi.fn(async () => state.status),
      listFields: vi.fn(async () => [{ title: 'Plan', kind: 'note', acceptsImage: false }]),
      write: vi.fn(async () => ({ ok: true })),
      diagnostics: vi.fn(async () => ({ version: 'dev', state: 'writable' })),
      listAppointments: vi.fn(async () => appointmentsResult),
      consultPatientNumber: vi.fn(async () => '12345'),
    },
    openTab: vi.fn(async () => 42 as number | undefined),
    navigateTab: vi.fn(async () => undefined),
    session: {
      get: vi.fn(async (k: string) => store.get(k)),
      set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
      remove: vi.fn(async (k: string) => void store.delete(k)),
      getAll: vi.fn(async () => Object.fromEntries(store)),
    },
    examAttempts: {
      get: vi.fn(async (key: string) => examStore.get(key)),
      set: vi.fn(async (key: string, value: unknown) => { examStore.set(key, value); }),
      remove: vi.fn(async (key: string) => { examStore.delete(key); }),
    },
    now: vi.fn(() => clock.now),
  } as unknown as FakeDeps;
  return { deps, state, store, clock };
}
const appointmentsResult = {
  ok: true,
  appointments: [
    { appointmentId: '7', start: '2026-11-16T09:00:00.000Z', patientName: 'Bella', patientNumber: '12345', ownerName: 'Smith', vet: null },
  ],
  failures: [],
} as const;
const handover: Handover = { userId: 'u1', patientName: 'Bella', patientNumber: '12345', ownerName: 'Smith', latestChartId: null };
const handover2: Handover = { ...handover, patientName: 'Max', patientNumber: '678' };
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const panel = { id: ID, url: `chrome-extension://${ID}/sidepanel.html` };
const webTab = (id: number) => ({ origin: 'https://toothops.app', tab: { id } });

const sendMsg = (o: Partial<Extract<Request, { type: 'send' }>> = {}): Request => ({
  type: 'send',
  tabId: 1,
  expectedPatient: 'Bella',
  confirmedEzyvetPatient: 'Bella',
  expectedConsult: consult,
  items: [a],
  ...o,
});

describe('background', () => {
  it('ignores other origins', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await handleExternal({ type: 'ping' }, { origin: 'https://evil.test' }, makeDeps().deps)).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ping', async () => {
    expect(await handleExternal({ type: 'ping' }, okSender, makeDeps().deps)).toEqual({ version: 'dev', protocol: 1, capabilities: ['inspect', 'send', 'diagnose', 'physicalExam', 'instinctSubmission', 'radiologyAutofill', 'noteAutofill'] });
  });

  it('picks active ezyVet tab of focused window, else most recent', () => {
    expect(pickEzyvetTab([tab(1, { lastAccessed: 9 }), tab(2, { active: true, focusedWindow: true })]).tab!.id).toBe(2);
    expect(pickEzyvetTab([tab(1, { lastAccessed: 3 }), tab(3, { lastAccessed: 9 })])).toMatchObject({
      tab: { id: 3 },
      candidates: 2,
    });
    expect(pickEzyvetTab([])).toEqual({ tab: null, candidates: 0 });
  });

  it('inspect without ezyVet tab', async () => {
    expect(await handleExternal({ type: 'inspect' }, okSender, makeDeps([]).deps)).toMatchObject({
      tab: null,
      status: null,
      fields: [],
    });
  });

  it('inspect offers fields only for a writable consult', async () => {
    const { deps, state } = makeDeps();
    expect(await handleExternal({ type: 'inspect' }, okSender, deps)).toMatchObject({
      tab: { id: 1, title: 'Tab 1' },
      status: { state: 'writable' },
      fields: [{ title: 'Plan' }],
    });
    state.status = { state: 'locked', patientName: 'Bella', consult };
    expect(await handleExternal({ type: 'inspect' }, okSender, deps)).toMatchObject({ fields: [] });
  });

  it('background.send re-checks status and patient', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'writable', patientName: 'Max', consult };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: 'Bella' }), okSender, deps)).toEqual({
      ok: false,
      code: 'patient_changed',
    });
    state.status = { state: 'locked', patientName: 'Bella', consult };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: 'Bella' }), okSender, deps)).toEqual({
      ok: false,
      code: 'not_writable',
    });
    expect(deps.page.write).not.toHaveBeenCalled();
  });

  it('send compares unconfirmed names strictly', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'writable', patientName: null, consult };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: null }), okSender, deps)).toMatchObject({ ok: true });
    state.status = { state: 'writable', patientName: 'Bella', consult };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: null }), okSender, deps)).toEqual({
      ok: false,
      code: 'patient_changed',
    });
  });

  it('send focuses the tab and compares the confirmed ezyVet name exactly once normalised', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'writable', patientName: '  bella ', consult };
    expect(await handleExternal(sendMsg(), okSender, deps)).toMatchObject({ ok: true });
    expect(deps.focusTab).toHaveBeenCalledWith(1);
    // The confirmed name is the one ezyVet showed at inspect: no substring leeway.
    state.status = { state: 'writable', patientName: 'Bella Smith', consult };
    expect(await handleExternal(sendMsg(), okSender, deps)).toEqual({ ok: false, code: 'patient_changed' });
  });

  it('send refuses another consult even when no patient name can be read', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'writable', patientName: null, consult: otherConsult };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: null }), okSender, deps)).toEqual({
      ok: false,
      code: 'patient_changed',
    });
    state.status = { state: 'writable', patientName: null, consult: null };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: null }), okSender, deps)).toEqual({
      ok: false,
      code: 'patient_changed',
    });
    // No readable record id: the next consult in the same view slot would look the same.
    const blank = { viewId: '1', recordId: '' };
    state.status = { state: 'writable', patientName: null, consult: blank };
    expect(
      await handleExternal(sendMsg({ confirmedEzyvetPatient: null, expectedConsult: blank }), okSender, deps),
    ).toEqual({ ok: false, code: 'patient_changed' });
    state.status = { state: 'writable', patientName: null, consult: { viewId: '2', recordId: '4521' } };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: null }), okSender, deps)).toEqual({
      ok: false,
      code: 'patient_changed',
    });
    expect(deps.page.write).not.toHaveBeenCalled();
  });

  it('send stops when the consult changes after the first item', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'writable', patientName: null, consult };
    deps.page.write = vi.fn(async () => {
      state.status = { state: 'writable', patientName: null, consult: otherConsult };
      return { ok: true } as const;
    });
    const r = await handleExternal(sendMsg({ confirmedEzyvetPatient: null, items: [a, b] }), okSender, deps);
    expect(r).toMatchObject({ ok: true, results: [{ result: { ok: true } }, { result: { code: 'patient_changed' } }] });
    expect(deps.page.write).toHaveBeenCalledTimes(1);
  });

  it('send reports no_tab when the tab is unreachable', async () => {
    const { deps } = makeDeps();
    deps.page.status = vi.fn().mockRejectedValue(new Error('gone'));
    expect(await handleExternal(sendMsg(), okSender, deps)).toEqual({ ok: false, code: 'no_tab' });
  });

  it('send continues after a failed item and diagnose reports its codes', async () => {
    const { deps } = makeDeps();
    deps.page.write = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, code: 'field_not_found' })
      .mockResolvedValueOnce({ ok: true });
    const r = await handleExternal(sendMsg({ items: [a, b] }), okSender, deps);
    expect(r).toEqual({
      ok: true,
      results: [
        { fieldTitle: a.fieldTitle, result: { ok: false, code: 'field_not_found' } },
        { fieldTitle: b.fieldTitle, result: { ok: true } },
      ],
    });
    expect(await handleExternal({ type: 'diagnose' }, okSender, deps)).toEqual({
      diagnostics: { version: 'dev', state: 'writable' },
      lastCodes: ['field_not_found'],
    });
  });

  it('send survives a write that returns nothing and keeps earlier results', async () => {
    const { deps } = makeDeps();
    deps.page.write = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ok: true });
    const c: SendItem = { fieldTitle: 'C', text: 'c' };
    expect(await handleExternal(sendMsg({ items: [a, b, c] }), okSender, deps)).toEqual({
      ok: true,
      results: [
        { fieldTitle: a.fieldTitle, result: { ok: true } },
        { fieldTitle: b.fieldTitle, result: { ok: false, code: 'extension_error' } },
        { fieldTitle: 'C', result: { ok: true } },
      ],
    });
  });

  it('a throwing write is extension_error and the loop continues', async () => {
    const { deps } = makeDeps();
    deps.page.write = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ ok: true });
    const r = await handleExternal(sendMsg({ items: [a, b] }), okSender, deps);
    expect(r).toMatchObject({ ok: true, results: [{ result: { code: 'extension_error' } }, { result: { ok: true } }] });
  });

  it('send stops when the patient changes after the first item', async () => {
    const { deps, state } = makeDeps();
    deps.page.write = vi.fn(async () => {
      state.status = { state: 'writable', patientName: 'Max', consult };
      return { ok: true } as const;
    });
    const r = await handleExternal(sendMsg({ items: [a, b, a] }), okSender, deps);
    expect(r).toEqual({
      ok: true,
      results: [
        { fieldTitle: a.fieldTitle, result: { ok: true } },
        { fieldTitle: b.fieldTitle, result: { ok: false, code: 'patient_changed' } },
        { fieldTitle: a.fieldTitle, result: { ok: false, code: 'patient_changed' } },
      ],
    });
    expect(deps.page.write).toHaveBeenCalledTimes(1);
  });

  it('send marks remaining items not_writable when the consult locks mid-send', async () => {
    const { deps, state } = makeDeps();
    deps.page.write = vi.fn(async () => {
      state.status = { state: 'locked', patientName: 'Bella', consult };
      return { ok: true } as const;
    });
    const r = await handleExternal(sendMsg({ items: [a, b] }), okSender, deps);
    expect(r).toMatchObject({ ok: true, results: [{ result: { ok: true } }, { result: { code: 'not_writable' } }] });
  });

  it('refusals are recorded in lastCodes', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'locked', patientName: 'Bella', consult };
    await handleExternal(sendMsg(), okSender, deps);
    expect(deps.lastCodes).toEqual(['not_writable']);
  });

  it('rejects a malformed send', async () => {
    const { deps } = makeDeps();
    const bad = { type: 'send', tabId: 'x', items: 'nope' } as unknown as Request;
    expect(await handleExternal(bad, okSender, deps)).toEqual({ ok: false, code: 'extension_error' });
    expect(deps.page.status).not.toHaveBeenCalled();
  });

  it('diagnose with no tab or after a restart has empty codes', async () => {
    expect(await handleExternal({ type: 'diagnose' }, okSender, makeDeps([]).deps)).toEqual({
      diagnostics: null,
      lastCodes: [],
    });
  });
});

describe('consult patient number', () => {
  it('inspect on a writable consult reads the patient number', async () => {
    const { deps } = makeDeps();
    const r = await handleExternal({ type: 'inspect' }, okSender, deps);
    expect(r).toMatchObject({ status: { state: 'writable', patientNumber: '12345' } });
    expect(deps.page.consultPatientNumber).toHaveBeenCalledWith(1, '4521');
  });

  it('a failed number read leaves patientNumber null and inspect still succeeds', async () => {
    const { deps } = makeDeps();
    deps.page.consultPatientNumber = vi.fn().mockRejectedValue(new Error('x'));
    expect(await handleExternal({ type: 'inspect' }, okSender, deps)).toMatchObject({
      tab: { id: 1 },
      status: { state: 'writable', patientNumber: null },
      fields: [{ title: 'Plan' }],
    });
  });

  it('the number is not read for a non-writable consult', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'locked', patientName: 'Bella', patientNumber: null, consult };
    expect(await handleExternal({ type: 'inspect' }, okSender, deps)).toMatchObject({ status: { patientNumber: null } });
    expect(deps.page.consultPatientNumber).not.toHaveBeenCalled();
  });
});

describe('appointments', () => {
  const msg: Request = { type: 'appointments', date: '2026-11-16', navigate: false };

  it('lists the ezyVet tab appointments for the date', async () => {
    const { deps } = makeDeps();
    expect(await handleInternal(msg, panel, ID, deps)).toEqual({ tab: { id: 1, title: 'Tab 1' }, result: appointmentsResult });
    expect(deps.page.listAppointments).toHaveBeenCalledWith(1, '2026-11-16', false);
  });

  it('no ezyVet tab', async () => {
    expect(await handleInternal(msg, panel, ID, makeDeps([]).deps)).toEqual({ tab: null, result: null });
  });

  it('a failed page call keeps the tab with a null result', async () => {
    const { deps } = makeDeps();
    deps.page.listAppointments = vi.fn().mockRejectedValue(new Error('gone'));
    expect(await handleInternal(msg, panel, ID, deps)).toEqual({ tab: { id: 1, title: 'Tab 1' }, result: null });
  });
});

describe('patient hand-over', () => {
  const start = (h: Handover = handover): Request => ({ type: 'startChart', handover: h });
  const take: Request = { type: 'takePendingPatient' };

  it('panel-only requests are refused from the web app, and the take from the panel', async () => {
    const { deps } = makeDeps();
    expect(await handleExternal({ type: 'appointments', date: '2026-11-16', navigate: true }, okSender, deps)).toBeUndefined();
    expect(await handleExternal(start(), okSender, deps)).toBeUndefined();
    expect(deps.page.listAppointments).not.toHaveBeenCalled();
    expect(deps.openTab).not.toHaveBeenCalled();
    expect(await handleInternal(take, panel, ID, deps)).toBeUndefined();
    expect(deps.session.get).not.toHaveBeenCalled();
  });

  it('startChart opens ToothOps and stores the hand-over under the new tab', async () => {
    const { deps, store, clock } = makeDeps();
    expect(await handleInternal(start(), panel, ID, deps)).toEqual({ ok: true });
    expect(deps.openTab).toHaveBeenCalledWith('about:blank');
    expect(deps.navigateTab).toHaveBeenCalledWith(42, `${WEB_APP_ORIGIN}/#/chart/patient?from=ezyvet`);
    expect(store.get('pending:42')).toEqual({ handover, at: clock.now });
  });

  it('makes the hand-over available before the destination can request it', async () => {
    const { deps } = makeDeps();
    let received: unknown;
    deps.openTab = vi.fn(async (url: string) => {
      if (url !== 'about:blank') received = await handleExternal(take, webTab(42), deps);
      return 42;
    });
    deps.navigateTab = vi.fn(async () => {
      received = await handleExternal(take, webTab(42), deps);
    });
    expect(await handleInternal(start(), panel, ID, deps)).toEqual({ ok: true });
    expect(received).toEqual({ handover });
    expect(await handleExternal(take, webTab(42), deps)).toEqual({ handover: null });
  });

  it('does not navigate to ToothOps when storing the hand-over fails', async () => {
    const { deps, store } = makeDeps();
    deps.session.set = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    expect(await handleInternal(start(), panel, ID, deps)).toEqual({ ok: false });
    expect(deps.navigateTab).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('clears the hand-over if destination navigation fails', async () => {
    const { deps, store } = makeDeps();
    deps.navigateTab = vi.fn().mockRejectedValue(new Error('tab closed'));
    expect(await handleInternal(start(), panel, ID, deps)).toEqual({ ok: false });
    expect(store.size).toBe(0);
  });

  it('startChart without a tab id stores nothing', async () => {
    const { deps, store } = makeDeps();
    deps.openTab = vi.fn(async () => undefined);
    expect(await handleInternal(start(), panel, ID, deps)).toEqual({ ok: false });
    expect(store.size).toBe(0);
  });

  it('the opened tab takes its hand-over once', async () => {
    const { deps } = makeDeps();
    await handleInternal(start(), panel, ID, deps);
    expect(await handleExternal(take, webTab(42), deps)).toEqual({ handover });
    expect(await handleExternal(take, webTab(42), deps)).toEqual({ handover: null });
  });

  it('two quick Start chart clicks give each tab its own patient', async () => {
    const { deps } = makeDeps();
    deps.openTab = vi.fn<() => Promise<number | undefined>>().mockResolvedValueOnce(42).mockResolvedValueOnce(43);
    await handleInternal(start(handover), panel, ID, deps);
    await handleInternal(start(handover2), panel, ID, deps);
    expect(await handleExternal(take, webTab(43), deps)).toEqual({ handover: handover2 });
    expect(await handleExternal(take, webTab(42), deps)).toEqual({ handover });
  });

  it('an expired hand-over is removed and not returned', async () => {
    const { deps, store, clock } = makeDeps();
    await handleInternal(start(), panel, ID, deps);
    clock.now += HANDOVER_TTL_MS + 1;
    expect(await handleExternal(take, webTab(42), deps)).toEqual({ handover: null });
    expect(store.has('pending:42')).toBe(false);
  });

  it('a hand-over stamped in the future (clock went back) is expired', async () => {
    const { deps, store, clock } = makeDeps();
    await handleInternal(start(), panel, ID, deps);
    clock.now -= 1;
    expect(await handleExternal(take, webTab(42), deps)).toEqual({ handover: null });
    expect(store.has('pending:42')).toBe(false);
  });

  it('startChart and takePendingPatient sweep expired hand-overs for other tabs', async () => {
    const { deps, store, clock } = makeDeps();
    store.set('pending:7', { handover, at: clock.now - HANDOVER_TTL_MS - 1 });
    store.set('pending:8', { handover, at: clock.now });
    store.set('other', 'kept');
    await handleInternal(start(), panel, ID, deps);
    expect(store.has('pending:7')).toBe(false);
    expect(store.has('pending:8')).toBe(true);
    expect(store.get('other')).toBe('kept');

    store.set('pending:9', { handover, at: clock.now - HANDOVER_TTL_MS - 1 });
    expect(await handleExternal(take, webTab(42), deps)).toEqual({ handover });
    expect(store.has('pending:9')).toBe(false);
    expect(store.has('pending:8')).toBe(true);
  });

  it('a sender without a tab id gets nothing', async () => {
    const { deps, store } = makeDeps();
    await handleInternal(start(), panel, ID, deps);
    expect(await handleExternal(take, okSender, deps)).toEqual({ handover: null });
    expect(store.has('pending:42')).toBe(true);
  });

  it('another tab cannot take the hand-over', async () => {
    const { deps } = makeDeps();
    await handleInternal(start(), panel, ID, deps);
    expect(await handleExternal(take, webTab(7), deps)).toEqual({ handover: null });
    expect(await handleExternal(take, webTab(42), deps)).toEqual({ handover });
  });
});

describe('internal messages', () => {

  it('internal messages accepted only from own extension pages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { deps } = makeDeps();
    expect(await handleInternal({ type: 'ping' }, panel, ID, deps)).toEqual({ version: 'dev', protocol: 1, capabilities: ['inspect', 'send', 'diagnose', 'physicalExam', 'instinctSubmission', 'radiologyAutofill', 'noteAutofill'] });
    const refused = [
      { id: 'otherextensionidotherextensionid', url: `chrome-extension://otherextensionidotherextensionid/x.html` },
      { id: 'otherextensionidotherextensionid', url: panel.url },
      // A content script: our id, but the web page's URL.
      { id: ID, url: 'https://clinic.ezyvet.com/' },
      { id: ID, url: `chrome-extension://${ID}evil/sidepanel.html` },
      { id: ID },
      { url: panel.url },
    ];
    for (const sender of refused) expect(await handleInternal({ type: 'ping' }, sender, ID, deps)).toBeUndefined();
    // An empty runtime id never matches.
    expect(await handleInternal({ type: 'ping' }, { id: '', url: 'chrome-extension:///' }, '', deps)).toBeUndefined();
    warn.mockRestore();
  });

  it('the panel reaches the same send logic as the web app', async () => {
    const { deps } = makeDeps();
    expect(await handleInternal(sendMsg(), panel, ID, deps)).toEqual(await handleExternal(sendMsg(), okSender, makeDeps().deps));
    expect(deps.page.write).toHaveBeenCalledWith(1, a, { provider: 'ezyvet', consult, patientName: 'Bella' });
  });

  function fakeChrome() {
    const ev = () => {
      const listeners: ((...args: unknown[]) => unknown)[] = [];
      return { listeners, addListener: (l: (...args: unknown[]) => unknown) => listeners.push(l) };
    };
    return {
      runtime: { id: ID, onMessage: ev(), onMessageExternal: ev(), onInstalled: ev(), onStartup: ev() },
      tabs: { onRemoved: ev() },
      sidePanel: { setPanelBehavior: vi.fn(async () => undefined) },
    };
  }

  it('the listener answers the panel and ignores content scripts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = fakeChrome();
    installListeners(api as unknown as typeof chrome, makeDeps().deps);
    const [listener] = api.runtime.onMessage.listeners;
    const reply = vi.fn();
    expect(listener({ type: 'ping' }, panel, reply)).toBe(true);
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ version: 'dev', protocol: 1, capabilities: ['inspect', 'send', 'diagnose', 'physicalExam', 'instinctSubmission', 'radiologyAutofill', 'noteAutofill'] }));
    const ignored = vi.fn();
    expect(listener({ type: 'ping' }, { id: ID, url: 'https://clinic.ezyvet.com/' }, ignored)).toBe(false);
    expect(listener({ type: 'unknown' }, panel, ignored)).toBe(false);
    expect(ignored).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('real listeners route note requests for authorized web and panel senders only', async () => {
    const api = fakeChrome();
    const { deps } = makeDeps([{ ...tab(7), url: 'https://clinic.vetspire.com/notes' }]);
    const result = { state: 'fields' as const, provider: 'vetspire' as const, origin: 'https://clinic.vetspire.com', title: 'Note', fields: ['Assessment'] };
    deps.page.noteAutofill = vi.fn(async () => result);
    installListeners(api as unknown as typeof chrome, deps);
    const message: Request = { type: 'noteAutofill', request: { operation: 'inspect', tabId: 7 } };
    const [external] = api.runtime.onMessageExternal.listeners;
    const [internal] = api.runtime.onMessage.listeners;
    const externalReply = vi.fn(), internalReply = vi.fn(), ignored = vi.fn();
    expect(external(message, webTab(2), externalReply)).toBe(true);
    expect(internal(message, panel, internalReply)).toBe(true);
    await vi.waitFor(() => {
      expect(externalReply).toHaveBeenCalledWith(result);
      expect(internalReply).toHaveBeenCalledWith(result);
    });
    expect(external(message, { origin: 'https://attacker.example' }, ignored)).toBe(false);
    expect(internal(message, { id: ID, url: 'https://clinic.vetspire.com/' }, ignored)).toBe(false);
    expect(internal(message, { ...panel, id: 'another-extension' }, ignored)).toBe(false);
    expect(ignored).not.toHaveBeenCalled();
    expect(deps.page.noteAutofill).toHaveBeenCalledTimes(2);
  });

  it.each(['rhapsody', 'vetspire'] as const)('real listeners pass authorized %s sync requests to the page', async provider => {
    const api = fakeChrome();
    const origin = provider === 'rhapsody' ? 'https://clinic.rhapsody.vet' : 'https://app.vetspire.com';
    const identity = { provider, origin, tenant_id: 'clinic', connection_revision: 1 };
    const { deps } = makeDeps([{ ...tab(7), url: `${origin}/schedule` }]);
    const result = { ok: true as const, operation: 'open' as const, session: 'page-session', identity };
    deps.page.providerSync = vi.fn(async () => result);
    installListeners(api as unknown as typeof chrome, deps);
    const message: Request = { type: 'providerSync', tabId: 7, request: { operation: 'open', identity } };
    const [external] = api.runtime.onMessageExternal.listeners;
    const [internal] = api.runtime.onMessage.listeners;
    const externalReply = vi.fn(), internalReply = vi.fn(), ignored = vi.fn();
    expect(external(message, webTab(2), externalReply)).toBe(true);
    expect(internal(message, panel, internalReply)).toBe(true);
    await vi.waitFor(() => {
      expect(externalReply).toHaveBeenCalledWith(result);
      expect(internalReply).toHaveBeenCalledWith(result);
    });
    expect(deps.page.providerSync).toHaveBeenCalledTimes(2);
    expect(external(message, { origin: 'https://attacker.example' }, ignored)).toBe(false);
    expect(internal(message, { id: ID, url: 'https://clinic.ezyvet.com/' }, ignored)).toBe(false);
    expect(ignored).not.toHaveBeenCalled();
    expect(deps.page.providerSync).toHaveBeenCalledTimes(2);
  });

  it('the listeners route the new requests to the right side only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = fakeChrome();
    const { deps } = makeDeps();
    installListeners(api as unknown as typeof chrome, deps);
    const [internal] = api.runtime.onMessage.listeners;
    const [external] = api.runtime.onMessageExternal.listeners;
    const apptReply = vi.fn();
    expect(internal({ type: 'appointments', date: '2026-11-16', navigate: false }, panel, apptReply)).toBe(true);
    await vi.waitFor(() => expect(apptReply).toHaveBeenCalledWith({ tab: { id: 1, title: 'Tab 1' }, result: appointmentsResult }));
    const startReply = vi.fn();
    expect(internal({ type: 'startChart', handover }, panel, startReply)).toBe(true);
    await vi.waitFor(() => expect(startReply).toHaveBeenCalledWith({ ok: true }));
    const takeReply = vi.fn();
    expect(external({ type: 'takePendingPatient' }, webTab(42), takeReply)).toBe(true);
    await vi.waitFor(() => expect(takeReply).toHaveBeenCalledWith({ handover }));
    // Wrong side: not answered.
    const ignored = vi.fn();
    expect(external({ type: 'appointments', date: '2026-11-16', navigate: true }, webTab(42), ignored)).toBe(false);
    expect(external({ type: 'startChart', handover }, webTab(42), ignored)).toBe(false);
    expect(internal({ type: 'takePendingPatient' }, panel, ignored)).toBe(false);
    expect(ignored).not.toHaveBeenCalled();
    expect(deps.openTab).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('closing a tab removes its hand-over', async () => {
    const api = fakeChrome();
    const { deps, store, clock } = makeDeps();
    installListeners(api as unknown as typeof chrome, deps);
    store.set('pending:42', { handover, at: clock.now });
    store.set('pending:43', { handover, at: clock.now });
    api.tabs.onRemoved.listeners[0](42, {});
    await vi.waitFor(() => expect(store.has('pending:42')).toBe(false));
    expect(store.has('pending:43')).toBe(true);
  });

  it('the toolbar button opens the side panel on install and startup', () => {
    const api = fakeChrome();
    installListeners(api as unknown as typeof chrome, makeDeps().deps);
    api.runtime.onInstalled.listeners[0]();
    api.runtime.onStartup.listeners[0]();
    expect(api.sidePanel.setPanelBehavior).toHaveBeenCalledTimes(2);
    expect(api.sidePanel.setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true });
  });
});

describe('manifest', () => {
  it('has the exact permissions and hosts', () => {
    expect(manifest.permissions).toEqual(['scripting', 'sidePanel', 'identity', 'storage']);
    expect(manifest.host_permissions).toEqual([
      'https://*.ezyvet.com/*', 'https://*.vettersoftware.com/*', 'https://*.instinctvet.cloud/*',
      'https://*.instinctvet.com/*', 'https://*.evetpractice.com/*', 'https://*.rhapsody.vet/*',
      'https://*.shepherd.vet/*', 'https://*.vetspire.com/*', 'https://*.radimal.ai/*', 'https://*.vetology.net/*',
    ]);
    expect(manifest.externally_connectable.matches).toEqual(['https://toothops.app/*', 'http://localhost:5173/*']);
  });

  it('has the side panel and a toolbar action', () => {
    expect(manifest.side_panel).toEqual({ default_path: 'sidepanel.html' });
    expect(manifest.action.default_title).toBe('__MSG_extName__');
    expect(manifest.action.default_icon).toEqual(manifest.icons);
  });

  it('the store build allows toothops.app only; the dev build adds the local server', async () => {
    expect(allowedOrigins(null)).toEqual(['https://toothops.app']);
    expect(ALLOWED_ORIGINS).toEqual(['https://toothops.app', 'http://localhost:5173']);
    vi.stubEnv('VITE_PIMS_STORE_BUILD', '1');
    vi.resetModules();
    try {
      const store = await import('./protocol');
      expect(store.ALLOWED_ORIGINS).toEqual(['https://toothops.app']);
      expect(store.ALLOWED_ORIGINS.some((o) => o.includes('localhost'))).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('key hashes to DEV_EXTENSION_ID', () => {
    const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
    const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
    expect(id).toBe(DEV_EXTENSION_ID);
  });
});


describe('Instinct PDF submission routing', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  afterEach(() => vi.unstubAllGlobals());
  const url = 'https://clinic.instinctvet.cloud/#/patient/123/charts/documents';
  const prepare = { type: 'instinctSubmission', tabId: 1, request: { operation: 'prepare' } } as unknown as Request;
  const submit = (id = 'attempt') => ({ type: 'instinctSubmission', tabId: 1, request: {
    operation: 'submit', ticket: 'ticket', id, expires_at: new Date(Date.now() + 60000).toISOString(),
    bytes: [37,80,68,70,45,49], label: 'Record', recorded_at: new Date().toISOString(), location_id: '1',
    source: { chartId: 'chart', draftId: 'draft', version: 1 },
  } }) as unknown as Request;
  function setup() {
    const tabs: EzyvetTab[] = [{ id: 1, url } as EzyvetTab];
    const { deps } = makeDeps(tabs);
    const execute = vi.fn(async (_tab: number, req: { operation: string; id?: string }) =>
      req.operation === 'prepare' ? { state: 'blocked' } : { state: 'submitted', id: req.id });
    Object.assign(deps.page, { instinctSubmission: execute });
    return { deps, tabs, execute };
  }
  it('rejects unauthenticated senders, wrong providers and malformed requests', async () => {
    const { deps, tabs, execute } = setup();
    expect(await handleExternal(prepare, { origin: 'https://evil.example' }, deps)).toBeUndefined();
    tabs[0].url = 'https://clinic.ezyvet.com/';
    expect(await handleExternal(prepare, webTab(2), deps)).toEqual({ state: 'blocked' });
    tabs[0].url = url;
    expect(await handleExternal({ ...prepare, request: {} } as unknown as Request, webTab(2), deps)).toEqual({ state: 'blocked' });
    expect(execute).not.toHaveBeenCalled();
  });
  it('routes preparation without recording a write', async () => {
    const { deps, execute } = setup();
    expect(await handleExternal(prepare, webTab(2), deps)).toEqual({ state: 'blocked' });
    expect(execute).toHaveBeenCalledWith(1, { operation: 'prepare' });
    expect(deps.examAttempts!.set).not.toHaveBeenCalled();
  });
  it('persists before dispatch and blocks concurrent or restarted attempts with new IDs', async () => {
    const { deps, execute } = setup();
    const results = await Promise.all([handleExternal(submit(), webTab(2), deps), handleExternal(submit('second'), webTab(2), deps)]);
    // Either digest may finish first; the duplicate guard must allow exactly one write.
    expect(results.map(result => result && 'state' in result ? result.state : null).sort()).toEqual(['submitted', 'unknown']);
    expect(results.map(result => result && 'id' in result ? result.id : null)).toEqual(['attempt', 'second']);
    expect(execute).toHaveBeenCalledOnce();
    expect(deps.examAttempts!.set).toHaveBeenCalledOnce();
    expect(await handleExternal(submit('restart'), webTab(2), { ...deps })).toEqual({ state: 'unknown', id: 'restart' });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('keeps the duplicate claim across equivalent encoded patient routes', async () => {
    const { deps, tabs, execute } = setup();
    expect(await handleExternal(submit(), webTab(2), deps)).toEqual({ state: 'submitted', id: 'attempt' });
    tabs[0].url = url.replace('/123/', '/%31%32%33/');
    expect(await handleExternal(submit('encoded'), webTab(2), deps)).toEqual({ state: 'unknown', id: 'encoded' });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('retains the lock when dispatch throws or returns a mismatched receipt', async () => {
    const { deps, execute } = setup();
    execute.mockRejectedValueOnce(new TypeError());
    expect(await handleExternal(submit(), webTab(2), deps)).toEqual({ state: 'unknown', id: 'attempt' });
    expect(await handleExternal(submit('retry'), webTab(2), deps)).toEqual({ state: 'unknown', id: 'retry' });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('treats a mismatched dispatch receipt as unknown and retains its claim', async () => {
    const { deps, execute } = setup();
    execute.mockResolvedValueOnce({ state: 'submitted', id: 'someone-else' });
    expect(await handleExternal(submit(), webTab(2), deps)).toEqual({ state: 'unknown', id: 'attempt' });
    expect(await handleExternal(submit('retry'), webTab(2), deps)).toEqual({ state: 'unknown', id: 'retry' });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('fails closed when durable storage fails', async () => {
    const { deps, execute } = setup();
    vi.mocked(deps.examAttempts!.set).mockRejectedValueOnce(new TypeError());
    expect(await handleExternal(submit(), webTab(2), deps)).toEqual({ state: 'unknown', id: 'attempt' });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('radiology autofill routing', () => {
  const request = (operation: Record<string, unknown>) => ({ type: 'radiologyAutofill', request: operation }) as unknown as Request;
  function setup() {
    const { deps } = makeDeps();
    const tabs = [
      { id: 10, title: 'Radimal', url: 'https://app.radimal.ai/request-consult' },
      { id: 11, title: 'Vetology', url: 'https://app.vetology.net/request' },
      { id: 12, title: 'Other', url: 'https://radimal.ai.evil.example/request-consult' },
    ];
    const execute = vi.fn(async () => ({ state: 'filled' }));
    Object.assign(deps, { queryRadiologyTabs: vi.fn(async () => tabs) });
    Object.assign(deps.page, { radiologyAutofill: execute });
    return { deps, tabs, execute };
  }
  it('lists supported radiology tabs without touching their forms', async () => {
    const { deps, execute } = setup();
    expect(await handleExternal(request({ operation: 'list' }), webTab(2), deps)).toEqual({ state: 'targets', targets: [
      { tabId: 10, title: 'Radimal', origin: 'https://app.radimal.ai', provider: 'radimal' },
      { tabId: 11, title: 'Vetology', origin: 'https://app.vetology.net', provider: 'vetology' },
    ] });
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects unknown senders, malformed requests, unsupported tabs and wrong result phases', async () => {
    const { deps, execute } = setup();
    expect(await handleExternal(request({ operation: 'list' }), { origin: 'https://evil.example' }, deps)).toBeUndefined();
    expect(await handleExternal(request({ operation: 'prepare', tabId: 12 }), webTab(2), deps)).toEqual({ state: 'blocked' });
    expect(await handleExternal(request({ operation: 'fill', tabId: 10, text: 'abc' }), webTab(2), deps)).toEqual({ state: 'blocked' });
    expect(execute).not.toHaveBeenCalled();
    expect(await handleExternal(request({ operation: 'prepare', tabId: 10 }), webTab(2), deps)).toEqual({ state: 'blocked' });
  });
  it('only routes fill to the explicitly selected supported tab and returns unknown after a lost result', async () => {
    const { deps, execute } = setup();
    const fill = { operation: 'fill', tabId: 11, ticket: 'one', text: 'Reviewed radiology findings' };
    expect(await handleExternal(request(fill), webTab(2), deps)).toEqual({ state: 'filled' });
    expect(execute).toHaveBeenCalledWith(11, { operation: 'fill', ticket: 'one', text: fill.text });
    execute.mockRejectedValueOnce(new TypeError());
    expect(await handleExternal(request(fill), webTab(2), deps)).toEqual({ state: 'unknown' });
  });
});


it.each([['ezyvet','ezyvet.com'],['daysmart','vettersoftware.com'],['pulse','evetpractice.com'],['shepherd','shepherd.vet']] as const)('routes configured %s only after explicit user confirmation', async (provider,domain) => {
  const origin = `https://clinic.${domain}`;
  const {deps} = makeDeps([{...tab(7),url:`${origin}/schedule`}]);
  const identity = {provider,origin,tenant_id:'Configured clinic',connection_revision:1};
  deps.page.providerSync = vi.fn(async()=>({ok:true as const,operation:'open' as const,session:'session',identity}));
  expect(await handleExternal({type:'providerSync',tabId:7,request:{operation:'open',identity}},okSender,deps)).toEqual({ok:false,code:'unavailable'});
  expect(deps.page.providerSync).not.toHaveBeenCalled();
  expect(await handleExternal({type:'providerSync',tabId:7,request:{operation:'open',identity,userConfirmed:true}},okSender,deps)).toMatchObject({ok:true,operation:'open'});
  expect(deps.page.providerSync).toHaveBeenCalledOnce();
});


describe('note autofill routing', () => {
  const request = (operation: Record<string, unknown>) => ({ type: 'noteAutofill', request: operation }) as unknown as Request;
  function setup() {
    const tabs = [
      { id: 10, title: 'Pulse', url: 'https://clinic.evetpractice.com/Medical' },
      { id: 11, title: 'Rhapsody', url: 'https://clinic.rhapsody.vet/patient/1' },
      { id: 12, title: 'Spoof', url: 'https://rhapsody.vet.evil.example/' },
      { id: 13, title: 'Other PIMS', url: 'https://clinic.ezyvet.com/' },
    ];
    const { deps } = makeDeps(tabs.map(entry => ({ ...tab(entry.id), ...entry })));
    deps.queryEzyvetTabs = async () => tabs.map(entry => ({ ...tab(entry.id), ...entry }));
    const execute = vi.fn(async (): Promise<unknown> => ({ state: 'filled' }));
    Object.assign(deps.page, { noteAutofill: execute });
    return { deps, tabs, execute };
  }
  it('lists only supported targets without choosing a recent tab or touching editors', async () => {
    const { deps, execute } = setup();
    expect(await handleExternal(request({ operation: 'list' }), okSender, deps)).toEqual({ state: 'targets', targets: [
      { tabId: 10, provider: 'pulse', origin: 'https://clinic.evetpractice.com', title: 'Pulse' },
      { tabId: 11, provider: 'rhapsody', origin: 'https://clinic.rhapsody.vet', title: 'Rhapsody' },
    ] });
    expect(execute).not.toHaveBeenCalled();
  });
  it('rejects unauthorized senders, malformed requests and spoofed/unsupported hosts', async () => {
    const { deps, execute } = setup();
    expect(await handleExternal(request({ operation: 'list' }), { origin: 'https://evil.example' }, deps)).toBeUndefined();
    expect(await handleInternal(request({ operation: 'list' }), { id: ID, url: 'https://clinic.rhapsody.vet/' }, ID, deps)).toBeUndefined();
    for (const value of [{ operation: 'inspect', tabId: 12 }, { operation: 'inspect', tabId: 13 }, { operation: 'prepare', tabId: 10 }, { operation: 'fill', tabId: -1, ticket: 'one', text: 'Notes' }]) {
      expect(await handleExternal(request(value), okSender, deps)).toEqual({ state: 'blocked' });
    }
    expect(execute).not.toHaveBeenCalled();
  });
  it('checks inspect/prepare metadata and response phase', async () => {
    const { deps, execute } = setup();
    const fields = { state: 'fields', provider: 'rhapsody', origin: 'https://clinic.rhapsody.vet', title: 'Rhapsody', fields: ['Plan'] };
    execute.mockResolvedValue(fields);
    expect(await handleExternal(request({ operation: 'inspect', tabId: 11 }), okSender, deps)).toEqual(fields);
    execute.mockResolvedValue({ ...fields, provider: 'pulse' });
    expect(await handleExternal(request({ operation: 'inspect', tabId: 11 }), okSender, deps)).toEqual({ state: 'blocked' });
    execute.mockResolvedValue(fields);
    expect(await handleExternal(request({ operation: 'prepare', tabId: 11, field: 'Plan' }), okSender, deps)).toEqual({ state: 'blocked' });
  });
  it('refuses a selected tab that switches URL before dispatch', async () => {
    const { deps, tabs, execute } = setup();
    let count = 0;
    deps.queryEzyvetTabs = async () => {
      count++;
      return tabs.map(entry => ({ ...tab(entry.id), ...entry, url: count > 1 && entry.id === 11 ? 'https://clinic.rhapsody.vet/other' : entry.url }));
    };
    expect(await handleExternal(request({ operation: 'fill', tabId: 11, ticket: 'one', text: 'Notes' }), okSender, deps)).toEqual({ state: 'blocked' });
    expect(execute).not.toHaveBeenCalled();
  });
  it('refuses a read-only result after the destination switches during its page call', async () => {
    const { deps, tabs, execute } = setup();
    execute.mockImplementationOnce(async () => {
      tabs[1] = { ...tabs[1], url: 'https://another.rhapsody.vet/patient/1' };
      return { state: 'fields', provider: 'rhapsody', origin: 'https://clinic.rhapsody.vet', title: 'Note', fields: ['Plan'] };
    });
    expect(await handleExternal(request({ operation: 'inspect', tabId: 11 }), okSender, deps)).toEqual({ state: 'blocked' });
  });
  it('dispatches one fill and reports unknown for switched tabs, lost and invalid replies', async () => {
    const { deps, tabs, execute } = setup();
    const fill = { operation: 'fill', tabId: 11, ticket: 'one', text: 'Reviewed notes' };
    expect(await handleExternal(request(fill), okSender, deps)).toEqual({ state: 'filled' });
    expect(execute).toHaveBeenCalledExactlyOnceWith(11, { operation: 'fill', ticket: 'one', text: 'Reviewed notes' });
    execute.mockImplementationOnce(async () => { tabs[1] = { ...tabs[1], url: tabs[1].url + '?changed' }; return { state: 'filled' }; });
    expect(await handleExternal(request(fill), okSender, deps)).toEqual({ state: 'unknown' });
    execute.mockRejectedValueOnce(new TypeError());
    expect(await handleExternal(request(fill), okSender, deps)).toEqual({ state: 'unknown' });
    execute.mockResolvedValueOnce({ state: 'saved' });
    expect(await handleExternal(request(fill), okSender, deps)).toEqual({ state: 'unknown' });
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
