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

// The second ping waits longer: Chrome may be starting a stopped service worker.
const PING_TIMEOUTS_MS = [500, 1_500];
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

/** One way to message the background worker: a `sendMessage` taking just the message and a
 *  callback, and the `lastError` Chrome sets when that callback reports a failure. */
export type RuntimeChannel = {
  sendMessage(message: Request, callback: (response?: unknown) => void): void;
  readonly lastError?: { message?: string };
};

/** The send flow's transport over `channel` (read on every call; undefined = not available). */
export function createTransport(channel: () => RuntimeChannel | undefined): PimsTransport {
  function raw<T>(message: Request, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const ch = channel();
      if (!ch) {
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
        ch.sendMessage(message, (response) => {
          // Reading lastError marks it handled; do it before anything else.
          const failed = ch.lastError;
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

  return {
    /** The extension's version, or null when it isn't installed or doesn't
     *  answer (500 ms, then 1.5 s for a cold service worker). */
    async ping() {
      for (const timeoutMs of PING_TIMEOUTS_MS) {
        try {
          return await raw<PingResult>({ type: 'ping' }, timeoutMs);
        } catch { /* retry once, then give up */ }
      }
      return null;
    },
    inspect: () => call<InspectResult>({ type: 'inspect' }, INSPECT_TIMEOUT_MS),
    /** A `{ ok: false, code }` reply is returned, not thrown. */
    send: (req) => call<SendResult>(req, SEND_TIMEOUT_MS),
    /** The page's structure report and the failure codes of the last send. */
    diagnose: (tabId) =>
      call<DiagnoseResult>(tabId === undefined ? { type: 'diagnose' } : { type: 'diagnose', tabId }, DIAGNOSE_TIMEOUT_MS),
  };
}

/** What the send flow needs from the extension, so the page and the side panel can each supply their own. */
export type PimsTransport = {
  ping(): Promise<PingResult | null>;
  inspect(): Promise<InspectResult>;
  send(req: Extract<Request, { type: 'send' }>): Promise<SendResult>;
  diagnose(tabId?: number): Promise<DiagnoseResult | null>;
};

/** The page talking to the extension through `externally_connectable`. */
export const externalTransport: PimsTransport = createTransport(() => {
  const rt = runtime();
  if (!rt?.sendMessage) return undefined;
  return {
    sendMessage: (message, callback) => rt.sendMessage!(EXTENSION_ID, message, callback),
    get lastError() {
      return rt.lastError;
    },
  };
});

export const { ping, inspect, send, diagnose } = externalTransport;
