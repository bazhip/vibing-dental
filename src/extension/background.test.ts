import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import manifest from './manifest.json';
import { DEV_EXTENSION_ID } from './extensionId';
import { handleExternal, handleInternal, installListeners, pickEzyvetTab, type Deps, type EzyvetTab } from './background';
import { ALLOWED_ORIGINS, allowedOrigins, HANDOVER_TTL_MS, WEB_APP_ORIGIN, type Handover, type Request } from './protocol';
import type { SendItem } from '../utils/pims/mapping';

const okSender = { origin: 'https://toothops.app' };
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
    session: {
      get: vi.fn(async (k: string) => store.get(k)),
      set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
      remove: vi.fn(async (k: string) => void store.delete(k)),
      getAll: vi.fn(async () => Object.fromEntries(store)),
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
    expect(await handleExternal({ type: 'ping' }, okSender, makeDeps().deps)).toEqual({ version: 'dev' });
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
    expect(deps.openTab).toHaveBeenCalledWith(`${WEB_APP_ORIGIN}/#/chart/patient?from=ezyvet`);
    expect(store.get('pending:42')).toEqual({ handover, at: clock.now });
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
    expect(await handleInternal({ type: 'ping' }, panel, ID, deps)).toEqual({ version: 'dev' });
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
    expect(deps.page.write).toHaveBeenCalledWith(1, a);
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
    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ version: 'dev' }));
    const ignored = vi.fn();
    expect(listener({ type: 'ping' }, { id: ID, url: 'https://clinic.ezyvet.com/' }, ignored)).toBe(false);
    expect(listener({ type: 'unknown' }, panel, ignored)).toBe(false);
    expect(ignored).not.toHaveBeenCalled();
    warn.mockRestore();
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
    expect(manifest.host_permissions).toEqual(['https://*.ezyvet.com/*']);
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
