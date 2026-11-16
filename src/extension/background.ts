/// <reference types="chrome" />
// MV3 service worker. Logic lives in exported functions that take their `chrome` access as `deps`,
// so it is testable. Chrome may stop and restart the worker at any time: nothing here needs
// in-memory state to be correct (`lastCodes` is diagnostic only).
import { normaliseName } from '../utils/pims/patientMatch';
import type { FieldInfo, SendItem } from '../utils/pims/mapping';
import type { AppointmentsResult } from './ezyvet/appointments';
import type { ConsultId, Diagnostics, Status } from './ezyvet/read';
import type { WriteCode, WriteResult } from './ezyvet/write';
import {
  ALLOWED_ORIGINS,
  HANDOVER_TTL_MS,
  WEB_APP_ORIGIN,
  type AppointmentsResponse,
  type DiagnoseResult,
  type Handover,
  type InspectResult,
  type ItemResult,
  type PingResult,
  type Request,
  type SendResult,
  type StartChartResult,
  type TakePendingResult,
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
  listAppointments(tabId: number, date: string, navigate: boolean): Promise<AppointmentsResult>;
  consultPatientNumber(tabId: number, recordId: string): Promise<string | null>;
};

/** `chrome.storage.session`: in memory only, cleared when the browser closes. */
export type SessionStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
};

export type Deps = {
  version: string;
  queryEzyvetTabs(): Promise<EzyvetTab[]>;
  focusTab(tabId: number): Promise<void>;
  page: PageApi;
  /** Failure codes of the last send in this worker's lifetime. Diagnostic only. */
  lastCodes: WriteCode[];
  /** Opens a tab; resolves to its id (undefined when Chrome gave none). */
  openTab(url: string): Promise<number | undefined>;
  session: SessionStore;
  now(): number;
};

export type Sender = { origin?: string; tab?: { id?: number } };
/** Who sent an internal (`chrome.runtime.onMessage`) message. */
export type InternalSender = { id?: string; url?: string };

const isAllowedOrigin = (origin: string | undefined): boolean =>
  !!origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin);

/** Only this extension's own pages (the side panel). Content scripts share the extension id but
 *  report the web page's URL, and other extensions or pages have another id: all refused. */
export const isOwnExtensionPage = (sender: InternalSender, runtimeId: string): boolean =>
  !!runtimeId && sender.id === runtimeId && !!sender.url?.startsWith(`chrome-extension://${runtimeId}/`);

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
    // Fields and the patient number are only read for a writable consult.
    if (status.state !== 'writable') return { tab: info, candidates, status, fields: [] };
    const fields = await deps.page.listFields(tab.id);
    const patientNumber = await readPatientNumber(tab.id, status, deps);
    return { tab: info, candidates, status: { ...status, patientNumber }, fields };
  } catch {
    return { tab: info, candidates, status: null, fields: [] };
  }
}

/** The open consult's patient number, or null when it can't be read (inspect still succeeds). */
async function readPatientNumber(tabId: number, status: Status, deps: Deps): Promise<string | null> {
  if (!status.consult?.recordId) return null;
  try {
    return (await deps.page.consultPatientNumber(tabId, status.consult.recordId)) ?? null;
  } catch {
    return null;
  }
}

async function appointments(date: string, navigate: boolean, deps: Deps): Promise<AppointmentsResponse> {
  const { tab } = pickEzyvetTab(await deps.queryEzyvetTabs());
  if (!tab || tab.id === undefined) return { tab: null, result: null };
  const info = { id: tab.id, title: tab.title ?? '' };
  try {
    return { tab: info, result: (await deps.page.listAppointments(tab.id, date, navigate)) ?? null };
  } catch {
    return { tab: info, result: null };
  }
}

type PendingEntry = { handover: Handover; at: number };
const pendingKey = (tabId: number) => `pending:${tabId}`;

/** Opens ToothOps and holds the hand-over for that tab only, so two quick clicks can't swap
 *  patients. The URL carries no patient data. */
async function startChart(handover: Handover, deps: Deps): Promise<StartChartResult> {
  const tabId = await deps.openTab(`${WEB_APP_ORIGIN}/#/chart/patient?from=ezyvet`);
  if (tabId === undefined) return { ok: false };
  const entry: PendingEntry = { handover, at: deps.now() };
  await deps.session.set(pendingKey(tabId), entry);
  return { ok: true };
}

/** The hand-over for the sender's own tab: one use, and only within HANDOVER_TTL_MS. */
async function takePendingPatient(sender: Sender, deps: Deps): Promise<TakePendingResult> {
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') return { handover: null };
  const key = pendingKey(tabId);
  const entry = (await deps.session.get(key)) as PendingEntry | undefined;
  if (!entry) return { handover: null };
  await deps.session.remove(key);
  const fresh = typeof entry.at === 'number' && deps.now() - entry.at <= HANDOVER_TTL_MS;
  return { handover: fresh ? entry.handover : null };
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

type Response =
  | PingResult
  | InspectResult
  | SendResult
  | DiagnoseResult
  | AppointmentsResponse
  | StartChartResult
  | TakePendingResult
  | undefined;

/** A message from the ToothOps web app (`externally_connectable`). */
export async function handleExternal(msg: Request, sender: Sender, deps: Deps): Promise<Response> {
  if (!isAllowedOrigin(sender.origin)) {
    console.warn('ToothOps extension: ignoring message from', sender.origin);
    return undefined;
  }
  return dispatchExternal(msg, sender, deps);
}

/** A message from the extension's own side panel: the shared requests plus the panel-only ones. */
export async function handleInternal(msg: Request, sender: InternalSender, runtimeId: string, deps: Deps): Promise<Response> {
  if (!isOwnExtensionPage(sender, runtimeId)) {
    console.warn('ToothOps extension: ignoring internal message from', sender.id);
    return undefined;
  }
  return dispatchInternal(msg, deps);
}

/** Requests both the web app and the side panel may send. */
function dispatchShared(msg: Request, deps: Deps): Promise<Response> | Response {
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

function dispatchInternal(msg: Request, deps: Deps): Promise<Response> | Response {
  switch (msg?.type) {
    case 'appointments':
      return appointments(msg.date, msg.navigate, deps);
    case 'startChart':
      return startChart(msg.handover, deps);
    default:
      return dispatchShared(msg, deps);
  }
}

function dispatchExternal(msg: Request, sender: Sender, deps: Deps): Promise<Response> | Response {
  switch (msg?.type) {
    case 'takePendingPatient':
      return takePendingPatient(sender, deps);
    default:
      return dispatchShared(msg, deps);
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
      listAppointments: (tabId, date, navigate) =>
        callWith(
          tabId,
          (a: { date: string; navigate: boolean }) => window.__toothopsEzyvet!.listAppointments(a.date, { navigate: a.navigate }),
          { date, navigate },
        ),
      consultPatientNumber: (tabId, recordId) =>
        callWith(tabId, (id: string) => window.__toothopsEzyvet!.consultPatientNumber(id), recordId),
    },
    async openTab(url) {
      return (await api.tabs.create({ url })).id;
    },
    session: {
      get: async (key) => (await api.storage.session.get(key))[key],
      set: (key, value) => api.storage.session.set({ [key]: value }),
      remove: (key) => api.storage.session.remove(key),
    },
    now: () => Date.now(),
  };
}

const SHARED_TYPES = ['ping', 'inspect', 'send', 'diagnose'];
/** Per side, so a request for the other side is never even answered. */
const INTERNAL_TYPES = [...SHARED_TYPES, 'appointments', 'startChart'];
const EXTERNAL_TYPES = [...SHARED_TYPES, 'takePendingPatient'];

/** Answers `msg` with `handle` (async) when the sender is `accepted` and the type is known. */
function respond(
  accepted: boolean,
  knownTypes: readonly string[],
  msg: Request,
  handle: () => Promise<Response>,
  sendResponse: (res: unknown) => void,
): boolean {
  if (!accepted || !knownTypes.includes(msg?.type)) return false;
  handle().then(
    (res) => {
      if (res !== undefined) sendResponse(res);
    },
    () => sendResponse({ ok: false, code: 'extension_error' }),
  );
  return true; // keep the channel open for the async response
}

/** Registers the listeners. Exported for tests; runs below when loaded as the service worker. */
export function installListeners(api: ChromeApi, deps: Deps = createChromeDeps(api)): void {
  api.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    const ok = isAllowedOrigin(sender.origin);
    if (!ok) console.warn('ToothOps extension: ignoring message from', sender.origin);
    // The real sender (with its tab) goes through: takePendingPatient keys on the tab id.
    return respond(ok, EXTERNAL_TYPES, msg, () => handleExternal(msg, sender, deps), sendResponse);
  });
  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const ok = isOwnExtensionPage(sender, api.runtime.id);
    if (!ok) console.warn('ToothOps extension: ignoring internal message from', sender.id);
    return respond(ok, INTERNAL_TYPES, msg, () => handleInternal(msg, sender, api.runtime.id, deps), sendResponse);
  });
  // The toolbar button opens the side panel.
  const openPanelOnClick = () =>
    void api.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  api.runtime.onInstalled.addListener(openPanelOnClick);
  api.runtime.onStartup.addListener(openPanelOnClick);
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessageExternal) installListeners(chrome);
