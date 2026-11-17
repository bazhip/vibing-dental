import type { AppointmentsResult } from '../ezyvet/appointments';
import type { Status } from '../ezyvet/read';
import type { Diagnostics } from '../ezyvet/read';
import type { WriteResult } from '../ezyvet/write';
import type { FieldInfo, SendItem } from '../../utils/pims/mapping';
import type { SyncSource } from '../../utils/pims/sync';

export type { Appointment, AppointmentsResult } from '../ezyvet/appointments';
export type { Status } from '../ezyvet/read';
export type { WriteResult } from '../ezyvet/write';
export type { FieldInfo, SendItem } from '../../utils/pims/mapping';
export type PimsId = 'ezyvet' | 'daysmart' | 'instinct' | 'pulse' | 'rhapsody' | 'shepherd' | 'vetspire';

export type AdapterContext = {
  doc: Document;
  url: URL;
  fetch: typeof fetch;
  localStorage: Storage;
  sessionStorage: Storage;
  wait: (ms: number) => Promise<void>;
  currentUrl?: () => URL;
};

export type PimsAdapter = {
  id: PimsId;
  status(context: AdapterContext): Status;
  listFields(context: AdapterContext): FieldInfo[];
  write(item: SendItem, context: AdapterContext): Promise<WriteResult>;
  listAppointments(date: string, context: AdapterContext, options?: { navigate: boolean }): Promise<AppointmentsResult>;
  patientNumber(recordId: string, context: AdapterContext): Promise<string | null>;
  diagnostics?(context: AdapterContext): Diagnostics;
  syncSource?(context: AdapterContext): SyncSource;
};

export type WriteTarget = { provider: PimsId; consult: Status['consult']; patientName: string | null };
