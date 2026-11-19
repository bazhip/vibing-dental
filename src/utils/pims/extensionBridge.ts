import { isNoteRequest, isNoteResponse, type NoteRequest, type NoteResponse } from '../../extension/noteProtocol';
import { isRadiologyRequest, isRadiologyResponse, type RadiologyRequest, type RadiologyResponse } from '../../extension/radiologyProtocol';
import i18n from '../../i18n';
import { LocalizedError } from '../apiErrors';
import { isNativeApp } from '../../native/platform';
import { DEV_EXTENSION_ID } from '../../extension/extensionId';
import { compatibleExtension } from '../../extension/protocol';
import { isPhysicalExamRequest, isPhysicalExamResult, type PhysicalExamRequest, type PhysicalExamResult } from '../../extension/pims/types';
import { isInstinctSubmissionRequest, isInstinctSubmissionResult, type InstinctSubmissionRequest, type InstinctSubmissionResult } from '../../extension/pims/instinctSubmission';
import type { ProviderSyncRequest, ProviderSyncResponse } from '../../extension/pims/syncBridge';
import type { AppointmentsResponse, DiagnoseResult, Handover, InspectResult, PingResult, Request, SendResult, StartChartResult, TakePendingResult } from '../../extension/protocol';

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
const APPOINTMENTS_TIMEOUT_MS = 30_000;
const START_CHART_TIMEOUT_MS = 5_000;
// One attempt, long enough for Chrome to start a stopped service worker: a timed-out first
// attempt may still have taken the one-use entry, so a retry would only get null.
const TAKE_PENDING_TIMEOUT_MS = 5_000;
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
          const reply = await raw<unknown>({ type: 'ping' }, timeoutMs);
          return compatibleExtension(reply) ? reply : null;
        } catch { /* retry once, then give up */ }
      }
      return null;
    },
    inspect: () => call<InspectResult>({ type: 'inspect' }, INSPECT_TIMEOUT_MS),
    async noteAutofill(request) {
      if (!isNoteRequest(request)) return { state: 'blocked' };
      const failure: NoteResponse = request.operation === 'fill' ? { state: 'unknown' } : { state: 'blocked' };
      try {
        const reply = await raw<unknown>({ type: 'noteAutofill', request }, 20_000);
        if (!isNoteResponse(reply)) return failure;
        if (reply.state === 'blocked') return reply;
        if (request.operation === 'list') return reply.state === 'targets' ? reply : failure;
        if (request.operation === 'inspect') return reply.state === 'fields' ? reply : failure;
        if (request.operation === 'prepare') return reply.state === 'prepared' && reply.field === request.field ? reply : failure;
        return reply.state === 'filled' || reply.state === 'unknown' ? reply : failure;
      } catch { return failure; }
    },
    async radiologyAutofill(request) {
      if (!isRadiologyRequest(request)) return { state: 'blocked' };
      const failure: RadiologyResponse = request.operation === 'fill' ? { state: 'unknown' } : { state: 'blocked' };
      try {
        const reply = await raw<unknown>({ type: 'radiologyAutofill', request }, 20_000);
        if (!isRadiologyResponse(reply)) return failure;
        if (reply.state === 'blocked') return reply;
        if (request.operation === 'list') return reply.state === 'targets' ? reply : failure;
        if (request.operation === 'prepare') return reply.state === 'prepared' ? reply : failure;
        return reply.state === 'filled' || reply.state === 'unknown' ? reply : failure;
      } catch { return failure; }
    },
    async instinctSubmission(tabId, request) {
      if (!Number.isSafeInteger(tabId) || tabId < 0 || !isInstinctSubmissionRequest(request)) return { state: 'blocked' };
      const failure: InstinctSubmissionResult = request.operation === 'submit' ? { state: 'unknown', id: request.id } : { state: 'blocked' };
      try {
        const reply = await raw<unknown>({ type: 'instinctSubmission', tabId, request }, SEND_TIMEOUT_MS);
        if (!isInstinctSubmissionResult(reply)) return failure;
        if (reply.state === 'blocked') return reply;
        if (request.operation === 'prepare') return reply.state === 'prepared' ? reply : failure;
        return (reply.state === 'submitted' || reply.state === 'unknown') && reply.id === request.id ? reply : failure;
      } catch { return failure; }
    },
    async physicalExam(tabId, request) {
      if (!Number.isSafeInteger(tabId) || tabId < 0 || !isPhysicalExamRequest(request)) return { ok: false, code: 'invalid_request' };
      const failure: PhysicalExamResult = { ok: false, code: request.operation === 'open' ? 'physical_exam_outcome_unknown' : 'unavailable' };
      try {
        const reply = await raw<unknown>({ type: 'physicalExam', tabId, request }, 20_000);
        return isPhysicalExamResult(reply, request) ? reply : failure;
      } catch { return failure; }
    },
    providerSync: (tabId, request) => call<ProviderSyncResponse>({ type: 'providerSync', tabId, request }, SEND_TIMEOUT_MS),
    /** A `{ ok: false, code }` reply is returned, not thrown. */
    send: (req) => call<SendResult>(req, SEND_TIMEOUT_MS),
    /** The page's structure report and the failure codes of the last send. */
    diagnose: (tabId) =>
      call<DiagnoseResult>(tabId === undefined ? { type: 'diagnose' } : { type: 'diagnose', tabId }, DIAGNOSE_TIMEOUT_MS),
    /** The day's appointments read from the ezyVet calendar tab. */
    appointments: (date, navigate) =>
      call<AppointmentsResponse>({ type: 'appointments', date, navigate }, APPOINTMENTS_TIMEOUT_MS),
    startChart: (handover) => call<StartChartResult>({ type: 'startChart', handover }, START_CHART_TIMEOUT_MS),
    /** The hand-over stored for this tab, or null when the extension doesn't answer or
     *  doesn't know the request (an older extension). */
    async takePendingPatient() {
      try {
        return await raw<TakePendingResult>({ type: 'takePendingPatient' }, TAKE_PENDING_TIMEOUT_MS);
      } catch {
        return null;
      }
    },
  };
}

/** What the send flow needs from the extension, so the page and the side panel can each supply their own. */
export type PimsTransport = {
  noteAutofill?(request: NoteRequest): Promise<NoteResponse>;
  radiologyAutofill?(request: RadiologyRequest): Promise<RadiologyResponse>;
  instinctSubmission?(tabId: number, request: InstinctSubmissionRequest): Promise<InstinctSubmissionResult>;
  physicalExam?(tabId: number, request: PhysicalExamRequest): Promise<PhysicalExamResult>;
  providerSync?(tabId: number, request: ProviderSyncRequest): Promise<ProviderSyncResponse>;
  ping(): Promise<PingResult | null>;
  inspect(): Promise<InspectResult>;
  send(req: Extract<Request, { type: 'send' }>): Promise<SendResult>;
  diagnose(tabId?: number): Promise<DiagnoseResult | null>;
  appointments(date: string, navigate: boolean): Promise<AppointmentsResponse>;
  startChart(handover: Handover): Promise<StartChartResult>;
  takePendingPatient(): Promise<TakePendingResult | null>;
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

export const { ping, inspect, send, diagnose, appointments, startChart, takePendingPatient } = externalTransport;

export function physicalExam(tabId: number, request: PhysicalExamRequest): Promise<PhysicalExamResult> {
  return externalTransport.physicalExam!(tabId, request);
}

export function instinctSubmission(tabId: number, request: InstinctSubmissionRequest): Promise<InstinctSubmissionResult> {
  return externalTransport.instinctSubmission!(tabId, request);
}

export function radiologyAutofill(request: RadiologyRequest): Promise<RadiologyResponse> {
  return externalTransport.radiologyAutofill!(request);
}

export function noteAutofill(request: NoteRequest): Promise<NoteResponse> {
  return externalTransport.noteAutofill!(request);
}
