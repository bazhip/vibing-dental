import i18n from '../../i18n';
import { LocalizedError } from '../apiErrors';
import { isNativeApp } from '../../native/platform';
import { DEV_EXTENSION_ID } from '../../extension/extensionId';
import type { DiagnoseResult, InspectResult, PingResult, Request, SendResult } from '../../extension/protocol';

/** Minimal shape of the part of `chrome.runtime` the page can see when an
 *  extension lists this origin in `externally_connectable`. */
type ChromeRuntime = {
  sendMessage?: (extensionId: string, message: unknown, callback: (response?: unknown) => void) => void;
  lastError?: { message?: string };
};
type ChromeWindow = Window & { chrome?: { runtime?: ChromeRuntime } };

export const EXTENSION_ID: string = import.meta.env.VITE_EXTENSION_ID ?? DEV_EXTENSION_ID;

const PING_TIMEOUT_MS = 500;
const INSPECT_TIMEOUT_MS = 5_000;
const DIAGNOSE_TIMEOUT_MS = 5_000;
// A multi-field send waits on one ezyVet save per field.
const SEND_TIMEOUT_MS = 120_000;

const runtime = (): ChromeRuntime | undefined => (window as ChromeWindow).chrome?.runtime;

export function extensionAvailable(): boolean {
  return !!runtime()?.sendMessage && !isNativeApp();
}

class BridgeFailure extends Error {
  constructor(readonly kind: 'timeout' | 'extension_error') {
    // eslint-disable-next-line no-restricted-syntax -- dev-only: internal marker, callers map it to a translated message
    super(kind);
  }
}

function raw<T>(message: Request, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const rt = runtime();
    if (!rt?.sendMessage) {
      reject(new BridgeFailure('extension_error'));
      return;
    }
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new BridgeFailure('timeout'));
    }, timeoutMs);
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    try {
      rt.sendMessage(EXTENSION_ID, message, (response) => {
        // Reading lastError marks it handled; do it before anything else.
        const failed = rt.lastError;
        finish(() => (failed || response === undefined ? reject(new BridgeFailure('extension_error')) : resolve(response as T)));
      });
    } catch {
      finish(() => reject(new BridgeFailure('extension_error')));
    }
  });
}

async function call<T>(message: Request, timeoutMs: number): Promise<T> {
  try {
    return await raw<T>(message, timeoutMs);
  } catch (err) {
    if (err instanceof BridgeFailure) {
      throw new LocalizedError(i18n.t(err.kind === 'timeout' ? 'pims:errors.timeout' : 'pims:errors.extension_error'));
    }
    throw err;
  }
}

/** The extension's version, or null when it isn't installed (or doesn't
 *  answer within 500 ms, twice). */
export async function ping(): Promise<PingResult | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await raw<PingResult>({ type: 'ping' }, PING_TIMEOUT_MS);
    } catch { /* retry once, then give up */ }
  }
  return null;
}

export function inspect(): Promise<InspectResult> {
  return call<InspectResult>({ type: 'inspect' }, INSPECT_TIMEOUT_MS);
}

/** A `{ ok: false, code }` reply is returned, not thrown. */
export function send(req: Extract<Request, { type: 'send' }>): Promise<SendResult> {
  return call<SendResult>(req, SEND_TIMEOUT_MS);
}

export async function diagnose(tabId?: number): Promise<DiagnoseResult['diagnostics']> {
  const res = await call<DiagnoseResult>(
    tabId === undefined ? { type: 'diagnose' } : { type: 'diagnose', tabId },
    DIAGNOSE_TIMEOUT_MS,
  );
  return res.diagnostics;
}
