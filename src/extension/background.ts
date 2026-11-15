/// <reference types="chrome" />
// MV3 service worker. Logic lives in exported functions that take their `chrome` access as `deps`,
// so it is testable. Chrome may stop and restart the worker at any time: nothing here needs
// in-memory state to be correct (`lastCodes` is diagnostic only).
import { normaliseName } from '../utils/pims/patientMatch';
import type { FieldInfo, SendItem } from '../utils/pims/mapping';
import type { ConsultId, Diagnostics, Status } from './ezyvet/read';
import type { WriteCode, WriteResult } from './ezyvet/write';
import {
  ALLOWED_ORIGINS,
  type DiagnoseResult,
  type InspectResult,
  type ItemResult,
  type PingResult,
  type Request,
  type SendResult,
} from './protocol';
import { EXTENSION_VERSION } from './version';

/** A tab plus whether it is the active tab of the last-focused window. */
export type EzyvetTab = chrome.tabs.Tab & { focusedWindow?: boolean };

/** Calls into `window.__toothopsEzyvet` of one tab (injecting it first). Reject = tab unreachable. */
export type PageApi = {
  status(tabId: number): Promise<Status>;
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

type SendRequest = Extract<Request, { type: 'send' }>;
type Refusal = 'not_writable' | 'patient_changed';

const sameConsult = (a: ConsultId | null | undefined, b: ConsultId | null): boolean =>
  a == null ? b === null : b !== null && a.viewId === b.viewId && a.recordId === b.recordId;

/** Is the consult still writable and still the one seen at inspect, with the same patient name?
 *  Null = yes. The consult id carries the check when the patient name can't be read; names, when
 *  both are known, must be equal once normalised (no substring leeway here). */
async function refusal(msg: SendRequest, deps: Deps): Promise<Refusal | null> {
  const status = await deps.page.status(msg.tabId);
  if (status.state !== 'writable') return 'not_writable';
  // A consult without a readable record id can't be identified: never write to it.
  if (!status.consult || status.consult.recordId === '') return 'patient_changed';
  if (!sameConsult(msg.expectedConsult, status.consult)) return 'patient_changed';
  const confirmed = msg.confirmedEzyvetPatient;
  const same =
    confirmed !== null && status.patientName !== null
      ? normaliseName(confirmed) === normaliseName(status.patientName)
      : confirmed === status.patientName;
  return same ? null : 'patient_changed';
}

async function send(msg: SendRequest, deps: Deps): Promise<SendResult> {
  deps.lastCodes.length = 0;
  const refuse = <C extends 'not_writable' | 'patient_changed' | 'no_tab' | 'extension_error'>(code: C) => {
    deps.lastCodes.push(code as WriteCode);
    return { ok: false, code } as const;
  };
  if (typeof msg.tabId !== 'number' || !Array.isArray(msg.items)) return refuse('extension_error');
  const { tabId } = msg;
  let first: Refusal | null;
  try {
    await deps.focusTab(tabId);
    first = await refusal(msg, deps);
  } catch {
    return refuse('no_tab');
  }
  if (first) return refuse(first);

  const results: { fieldTitle: string; result: ItemResult }[] = [];
  let stopped: Refusal | null = null;
  for (const item of msg.items) {
    let result: ItemResult;
    if (stopped) {
      result = { ok: false, code: stopped };
    } else {
      try {
        // The patient or consult can change between items: check before each write.
        stopped = await refusal(msg, deps);
        result = stopped
          ? { ok: false, code: stopped }
          : ((await deps.page.write(tabId, item)) ?? { ok: false, code: 'extension_error' });
      } catch {
        result = { ok: false, code: 'extension_error' };
      }
    }
    if (!result.ok) deps.lastCodes.push(result.code as WriteCode);
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

// A page function that threw (or a missing page API) leaves `result` undefined: treat as failure.
function resultOf<T>(res: { result?: unknown } | undefined): T {
  if (res?.result === undefined) {
    // eslint-disable-next-line no-restricted-syntax -- dev-only: caught by the callers and reported as extension_error
    throw new Error('page call returned no result');
  }
  return res.result as T;
}

export function createChromeDeps(api: ChromeApi, lastCodes: WriteCode[] = []): Deps {
  // Inject (idempotent: the page script reinstalls only when the version differs), then call in.
  const call = async <T>(tabId: number, func: () => unknown): Promise<T> => {
    await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['ezyvet-page.js'] });
    const [res] = await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func });
    return resultOf<T>(res);
  };
  const callWith = async <T, A>(tabId: number, func: (a: A) => unknown, arg: A): Promise<T> => {
    await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['ezyvet-page.js'] });
    const [res] = await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func, args: [arg] });
    return resultOf<T>(res);
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

const KNOWN_TYPES = ['ping', 'inspect', 'send', 'diagnose'];

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessageExternal) {
  const deps = createChromeDeps(chrome);
  chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    if (!isAllowedOrigin(sender.origin)) {
      console.warn('ToothOps extension: ignoring message from', sender.origin);
      return false;
    }
    if (!KNOWN_TYPES.includes(msg?.type)) return false;
    handleExternal(msg, sender, deps).then(
      (res) => {
        if (res !== undefined) sendResponse(res);
      },
      () => sendResponse({ ok: false, code: 'extension_error' }),
    );
    return true; // keep the channel open for the async response
  });
}
