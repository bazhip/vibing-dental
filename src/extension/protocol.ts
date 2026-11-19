import type { NoteRequest } from './noteProtocol';
import type { RadiologyRequest } from './radiologyProtocol';
// Message types shared by the web app and the extension's background worker.
// Plain TypeScript only: the web app imports this file, so no `chrome` types here.
import type { FieldInfo, SendItem } from '../utils/pims/mapping';
import type { AppointmentsResult } from './ezyvet/appointments';
import type { ConsultId, Diagnostics, EzyvetState, Status } from './ezyvet/read';
import type { WriteCode, WriteResult } from './ezyvet/write';
import type { PimsId } from './pims/types';
import type { PhysicalExamRequest } from './pims/types';
import type { InstinctSubmissionRequest } from './pims/instinctSubmission';
import type { ProviderSyncRequest } from './pims/syncBridge';

// The local web app dev server, allowed only by the unpacked dev build (`npm run build:extension`).
// The store build (`npm run package:extension`) sets VITE_PIMS_STORE_BUILD=1, which compiles this to
// null, so the published extension accepts toothops.app alone.
const DEV_ORIGIN: string | null = import.meta.env.VITE_PIMS_STORE_BUILD === '1' ? null : 'http://localhost:5173';

/** The web app origins that may message the extension. */
export function allowedOrigins(devOrigin: string | null): readonly string[] {
  return devOrigin ? ['https://toothops.app', devOrigin] : ['https://toothops.app'];
}

export const ALLOWED_ORIGINS = allowedOrigins(DEV_ORIGIN);

/** Where Start chart opens ToothOps: the dev origin in the unpacked dev build, else https://toothops.app. */
export const WEB_APP_ORIGIN: string = DEV_ORIGIN ?? 'https://toothops.app';

/** How long a Start chart hand-over waits for the opened ToothOps tab to take it. */
export const HANDOVER_TTL_MS = 120_000;

export type { AppointmentsResult, ConsultId, Diagnostics, EzyvetState, FieldInfo, SendItem, Status, WriteCode, WriteResult };

export type Request =
  | { type: 'noteAutofill'; request: NoteRequest }
  | { type: 'radiologyAutofill'; request: RadiologyRequest }
  | { type: 'instinctSubmission'; tabId: number; request: InstinctSubmissionRequest }
  | { type: 'physicalExam'; tabId: number; request: PhysicalExamRequest }
  | { type: 'providerSync'; tabId: number; request: ProviderSyncRequest }
  | { type: 'ping' }
  | { type: 'inspect' }
  | {
      type: 'send';
      tabId: number;
      expectedPatient: string;
      confirmedEzyvetPatient: string | null;
      /** The consult seen at inspect; a write to any other consult is refused (`patient_changed`). */
      expectedConsult: ConsultId | null;
      expectedPims?: PimsId;
      items: SendItem[];
    }
  | { type: 'diagnose'; tabId?: number }
  /** Side panel only. */
  | { type: 'appointments'; date: string; navigate: boolean }
  /** Side panel only. */
  | { type: 'startChart'; handover: Handover }
  /** Web app only: the hand-over stored for the sender's own tab. */
  | { type: 'takePendingPatient' };

/** The patient picked in the side panel, held for the ToothOps tab that Start chart opened. */
export type Handover = {
  userId: string;
  patientName: string;
  patientNumber: string;
  ownerName: string;
  latestChartId: string | null;
};

export type AppointmentsResponse = { tab: { id: number; title: string } | null; result: AppointmentsResult | null };
export type StartChartResult = { ok: boolean };
export type TakePendingResult = { handover: Handover | null };

export const BRIDGE_PROTOCOL = 1;
export const SEND_CAPABILITIES = ['inspect', 'send', 'diagnose'] as const;
export type PingResult = { version: string; protocol: number; capabilities: readonly string[] };

export function compatibleExtension(value: unknown): value is PingResult {
  if (!value || typeof value !== 'object') return false;
  const reply = value as Partial<PingResult>;
  return typeof reply.version === 'string' && reply.version.trim().length > 0
    && reply.protocol === BRIDGE_PROTOCOL && Array.isArray(reply.capabilities)
    && SEND_CAPABILITIES.every((capability) => reply.capabilities!.includes(capability));
}

export type InspectResult = {
  tab: { id: number; title: string } | null;
  candidates: number;
  status: Status | null;
  fields: FieldInfo[];
};

export type ItemResult =
  | WriteResult
  | { ok: false; code: 'extension_error' | 'patient_changed' | 'not_writable' };

export type SendResult =
  | { ok: false; code: 'not_writable' | 'patient_changed' | 'no_tab' | 'extension_error' }
  | { ok: true; results: { fieldTitle: string; result: ItemResult }[] };

export type DiagnoseResult = { diagnostics: Diagnostics | null; lastCodes: WriteCode[] };
