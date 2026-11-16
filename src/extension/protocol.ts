// Message types shared by the web app and the extension's background worker.
// Plain TypeScript only: the web app imports this file, so no `chrome` types here.
import type { FieldInfo, SendItem } from '../utils/pims/mapping';
import type { ConsultId, Diagnostics, EzyvetState, Status } from './ezyvet/read';
import type { WriteCode, WriteResult } from './ezyvet/write';

// The local web app dev server, allowed only by the unpacked dev build (`npm run build:extension`).
// The store build (`npm run package:extension`) sets VITE_PIMS_STORE_BUILD=1, which compiles this to
// null, so the published extension accepts toothops.app alone.
const DEV_ORIGIN: string | null = import.meta.env.VITE_PIMS_STORE_BUILD === '1' ? null : 'http://localhost:5173';

/** The web app origins that may message the extension. */
export function allowedOrigins(devOrigin: string | null): readonly string[] {
  return devOrigin ? ['https://toothops.app', devOrigin] : ['https://toothops.app'];
}

export const ALLOWED_ORIGINS = allowedOrigins(DEV_ORIGIN);

export type { ConsultId, Diagnostics, EzyvetState, FieldInfo, SendItem, Status, WriteCode, WriteResult };

export type Request =
  | { type: 'ping' }
  | { type: 'inspect' }
  | {
      type: 'send';
      tabId: number;
      expectedPatient: string;
      confirmedEzyvetPatient: string | null;
      /** The consult seen at inspect; a write to any other consult is refused (`patient_changed`). */
      expectedConsult: ConsultId | null;
      items: SendItem[];
    }
  | { type: 'diagnose'; tabId?: number };

export type PingResult = { version: string };

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
