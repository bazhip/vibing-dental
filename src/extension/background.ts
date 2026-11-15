/// <reference types="chrome" />
// MV3 service worker. Logic lives in exported functions that take their `chrome` access as `deps`,
// so it is testable. Chrome may stop and restart the worker at any time: nothing here needs
// in-memory state to be correct (`lastCodes` is diagnostic only).
import { patientsMatch } from '../utils/pims/patientMatch';
import type { FieldInfo, SendItem } from '../utils/pims/mapping';
import type { Diagnostics, EzyvetState } from './ezyvet/read';
import type { WriteCode, WriteResult } from './ezyvet/write';
import {
  ALLOWED_ORIGINS,
  type DiagnoseResult,
  type InspectResult,
  type PingResult,
  type Request,
  type SendResult,
} from './protocol';
import { EXTENSION_VERSION } from './version';

/** A tab plus whether it is the active tab of the last-focused window. */
export type EzyvetTab = chrome.tabs.Tab & { focusedWindow?: boolean };

type PageStatus = { state: EzyvetState; patientName: string | null };

/** Calls into `window.__toothopsEzyvet` of one tab (injecting it first). Reject = tab unreachable. */
export type PageApi = {
  status(tabId: number): Promise<PageStatus>;
  listFields(tabId: number): Promise<FieldInfo[]>;
  write(tabId: number, item: SendItem): Promise<WriteResult>;
  diagnostics(tabId: number): Promise<Diagnostics>;
};

export type Deps = {
  version: string;
  queryEzyvetTabs(): Promise<EzyvetTab[]>;
  focusTab(tabId: number): Promise<void>;
  page: PageApi;
  /** Failure codes of the last send in this worker's lifetime. Diagnostic only. */
  lastCodes: WriteCode[];
};

export type Sender = { origin?: string };

const isAllowedOrigin = (origin: string | undefined): boolean =>
  !!origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin);

export function pickEzyvetTab(tabs: EzyvetTab[]): { tab: EzyvetTab | null; candidates: number } {
  const focused = tabs.find((t) => t.active && t.focusedWindow);
  if (focused) return { tab: focused, candidates: tabs.length };
  const byRecent = [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  return { tab: byRecent[0] ?? null, candidates: tabs.length };
}

async function inspect(deps: Deps): Promise<InspectResult> {
  const { tab, candidates } = pickEzyvetTab(await deps.queryEzyvetTabs());
  if (!tab || tab.id === undefined) return { tab: null, candidates, status: null, fields: [] };
  const info = { id: tab.id, title: tab.title ?? '' };
  try {
    const status = await deps.page.status(tab.id);
    // Fields are only offered for a writable consult.
    const fields = status.state === 'writable' ? await deps.page.listFields(tab.id) : [];
    return { tab: info, candidates, status, fields };
  } catch {
    return { tab: info, candidates, status: null, fields: [] };
  }
}

async function send(msg: Extract<Request, { type: 'send' }>, deps: Deps): Promise<SendResult> {
  const { tabId } = msg;
  let status: PageStatus;
  try {
    await deps.focusTab(tabId);
    status = await deps.page.status(tabId);
  } catch {
    return { ok: false, code: 'no_tab' };
  }
  if (status.state !== 'writable') return { ok: false, code: 'not_writable' };
  const { confirmedEzyvetPatient: confirmed } = msg;
  const same =
    confirmed !== null && status.patientName !== null
      ? patientsMatch(confirmed, status.patientName)
      : confirmed === status.patientName;
  if (!same) return { ok: false, code: 'patient_changed' };

  deps.lastCodes.length = 0;
  const results: { fieldTitle: string; result: WriteResult }[] = [];
  for (const item of msg.items) {
    let result: WriteResult;
    try {
      result = await deps.page.write(tabId, item);
    } catch {
      result = { ok: false, code: 'not_writable' };
    }
    if (!result.ok) deps.lastCodes.push(result.code);
    results.push({ fieldTitle: item.fieldTitle, result });
  }
  return { ok: true, results };
}

async function diagnose(tabId: number | undefined, deps: Deps): Promise<DiagnoseResult> {
  const lastCodes = [...deps.lastCodes];
  let id = tabId;
  if (id === undefined) id = pickEzyvetTab(await deps.queryEzyvetTabs()).tab?.id;
  if (id === undefined) return { diagnostics: null, lastCodes };
  try {
    return { diagnostics: await deps.page.diagnostics(id), lastCodes };
  } catch {
    return { diagnostics: null, lastCodes };
  }
}

export async function handleExternal(
  msg: Request,
  sender: Sender,
  deps: Deps,
): Promise<PingResult | InspectResult | SendResult | DiagnoseResult | undefined> {
  if (!isAllowedOrigin(sender.origin)) {
    console.warn('ToothOps extension: ignoring message from', sender.origin);
    return undefined;
  }
  switch (msg?.type) {
    case 'ping':
      return { version: deps.version };
    case 'inspect':
      return inspect(deps);
    case 'send':
      return send(msg, deps);
    case 'diagnose':
      return diagnose(msg.tabId, deps);
    default:
      return undefined;
  }
}

// ---- Real chrome wiring ----

type ChromeApi = typeof chrome;

export function createChromeDeps(api: ChromeApi, lastCodes: WriteCode[] = []): Deps {
  // Inject (idempotent: the page script reinstalls only when the version differs), then call in.
  const call = async <T>(tabId: number, func: () => unknown): Promise<T> => {
    await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['ezyvet-page.js'] });
    const [res] = await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func });
    return res?.result as T;
  };
  const callWith = async <T, A>(tabId: number, func: (a: A) => unknown, arg: A): Promise<T> => {
    await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['ezyvet-page.js'] });
    const [res] = await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args: [arg] });
    return res?.result as T;
  };
  return {
    version: EXTENSION_VERSION,
    lastCodes,
    async queryEzyvetTabs() {
      const [all, active] = await Promise.all([
        api.tabs.query({ url: 'https://*.ezyvet.com/*' }),
        api.tabs.query({ url: 'https://*.ezyvet.com/*', active: true, lastFocusedWindow: true }),
      ]);
      const focused = new Set(active.map((t) => t.id));
      return all.map((t) => ({ ...t, focusedWindow: focused.has(t.id) }));
    },
    async focusTab(tabId) {
      const tab = await api.tabs.update(tabId, { active: true });
      if (tab?.windowId !== undefined) await api.windows.update(tab.windowId, { focused: true });
    },
    page: {
      status: (tabId) => call(tabId, () => window.__toothopsEzyvet!.status()),
      listFields: (tabId) => call(tabId, () => window.__toothopsEzyvet!.listFields()),
      write: (tabId, item) => callWith(tabId, (i: SendItem) => window.__toothopsEzyvet!.write(i), item),
      diagnostics: (tabId) => call(tabId, () => window.__toothopsEzyvet!.diagnostics()),
    },
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessageExternal) {
  const deps = createChromeDeps(chrome);
  chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    handleExternal(msg, sender, deps).then(
      (res) => {
        if (res !== undefined) sendResponse(res);
      },
      () => undefined,
    );
    return true; // keep the channel open for the async response
  });
}
