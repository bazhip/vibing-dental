// Message types shared by the web app and the extension's background worker.
// Plain TypeScript only: the web app imports this file, so no `chrome` types here.
import type { FieldInfo, SendItem } from '../utils/pims/mapping';
import type { Diagnostics, EzyvetState } from './ezyvet/read';
import type { WriteCode, WriteResult } from './ezyvet/write';

export const ALLOWED_ORIGINS = ['https://toothops.app', 'http://localhost:5173'] as const;

export type { Diagnostics, EzyvetState, FieldInfo, SendItem, WriteCode, WriteResult };

export type Request =
  | { type: 'ping' }
  | { type: 'inspect' }
  | {
      type: 'send';
      tabId: number;
      expectedPatient: string;
      confirmedEzyvetPatient: string | null;
      items: SendItem[];
    }
  | { type: 'diagnose'; tabId?: number };

export type PingResult = { version: string };

export type InspectResult = {
  tab: { id: number; title: string } | null;
  candidates: number;
  status: { state: EzyvetState; patientName: string | null } | null;
  fields: FieldInfo[];
};

export type ItemResult =
  | WriteResult
  | { ok: false; code: 'extension_error' | 'patient_changed' | 'not_writable' };

export type SendResult =
  | { ok: false; code: 'not_writable' | 'patient_changed' | 'no_tab' | 'extension_error' }
  | { ok: true; results: { fieldTitle: string; result: ItemResult }[] };

export type DiagnoseResult = { diagnostics: Diagnostics | null; lastCodes: WriteCode[] };
