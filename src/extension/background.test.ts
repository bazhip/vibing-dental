import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import manifest from './manifest.json';
import { DEV_EXTENSION_ID } from './extensionId';
import { handleExternal, pickEzyvetTab, type Deps, type EzyvetTab } from './background';
import type { Request } from './protocol';
import type { SendItem } from '../utils/pims/mapping';

const okSender = { origin: 'https://toothops.app' };
const tab = (id: number, o: { lastAccessed?: number; active?: boolean; focusedWindow?: boolean } = {}) =>
  ({ id, title: `Tab ${id}`, ...o }) as EzyvetTab;
const a: SendItem = { fieldTitle: 'Plan', text: 'a' };
const b: SendItem = { fieldTitle: 'Diagnosis', text: 'b' };

type FakeDeps = Deps & { page: Deps['page'] & { statusValue: unknown } };
function makeDeps(tabs: EzyvetTab[] = [tab(1, { active: true, focusedWindow: true })]) {
  const state = { status: { state: 'writable', patientName: 'Bella' } as unknown };
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
    },
  } as unknown as FakeDeps;
  return { deps, state };
}
const sendMsg = (o: Partial<Extract<Request, { type: 'send' }>> = {}): Request => ({
  type: 'send',
  tabId: 1,
  expectedPatient: 'Bella',
  confirmedEzyvetPatient: 'Bella',
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
    state.status = { state: 'locked', patientName: 'Bella' };
    expect(await handleExternal({ type: 'inspect' }, okSender, deps)).toMatchObject({ fields: [] });
  });

  it('background.send re-checks status and patient', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'writable', patientName: 'Max' };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: 'Bella' }), okSender, deps)).toEqual({
      ok: false,
      code: 'patient_changed',
    });
    state.status = { state: 'locked', patientName: 'Bella' };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: 'Bella' }), okSender, deps)).toEqual({
      ok: false,
      code: 'not_writable',
    });
    expect(deps.page.write).not.toHaveBeenCalled();
  });

  it('send compares unconfirmed names strictly', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'writable', patientName: null };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: null }), okSender, deps)).toMatchObject({ ok: true });
    state.status = { state: 'writable', patientName: 'Bella' };
    expect(await handleExternal(sendMsg({ confirmedEzyvetPatient: null }), okSender, deps)).toEqual({
      ok: false,
      code: 'patient_changed',
    });
  });

  it('send focuses the tab and tolerates an owner suffix on the patient name', async () => {
    const { deps, state } = makeDeps();
    state.status = { state: 'writable', patientName: 'Bella Smith' };
    expect(await handleExternal(sendMsg(), okSender, deps)).toMatchObject({ ok: true });
    expect(deps.focusTab).toHaveBeenCalledWith(1);
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

  it('diagnose with no tab or after a restart has empty codes', async () => {
    expect(await handleExternal({ type: 'diagnose' }, okSender, makeDeps([]).deps)).toEqual({
      diagnostics: null,
      lastCodes: [],
    });
  });
});

describe('manifest', () => {
  it('has the exact permissions and hosts', () => {
    expect(manifest.permissions).toEqual(['scripting', 'storage']);
    expect(manifest.host_permissions).toEqual(['https://*.ezyvet.com/*']);
    expect(manifest.externally_connectable.matches).toEqual(['https://toothops.app/*', 'http://localhost:5173/*']);
  });

  it('key hashes to DEV_EXTENSION_ID', () => {
    const hex = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32);
    const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
    expect(id).toBe(DEV_EXTENSION_ID);
  });
});
