import type { AppointmentsResult } from '../ezyvet/appointments';
import type { Status } from '../ezyvet/read';
import type { Diagnostics } from '../ezyvet/read';
import type { WriteResult } from '../ezyvet/write';
import type { FieldInfo, SendItem } from '../../utils/pims/mapping';
import type { SyncIdentity, SyncSource } from '../../utils/pims/sync';

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
  syncSource?(context: AdapterContext, binding: SyncIdentity): SyncSource;
};

export type WriteTarget = { provider: PimsId; consult: Status['consult']; patientName: string | null };

export type PhysicalExamTarget = { provider: 'shepherd'; consult: NonNullable<Status['consult']> };
export type PhysicalExamRequest =
  | { operation: 'inspect'; target: PhysicalExamTarget }
  | { operation: 'prepare'; target: PhysicalExamTarget; pageId: string }
  | { operation: 'open'; target: PhysicalExamTarget; pageId: string; ticket: string; templateId: string };
export type PhysicalExamCode = 'invalid_request' | 'unavailable' | 'patient_changed' | 'not_writable'
  | 'physical_exam_template_not_found' | 'supervising_doctor_not_set' | 'physical_exam_outcome_unknown';
export type PhysicalExamResult =
  | { ok: true; state: 'available'; pageId: string }
  | { ok: true; state: 'prepared'; pageId: string; ticket: string; templates: { id: string; label: string }[]; doctor: string }
  | { ok: true; state: 'opened'; recordId: string; examId: string }
  | { ok: false; code: PhysicalExamCode };

const examText = (value: unknown, max = 2048): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const examObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export const shepherdObjectiveRecord = (url: URL): string | null =>
  /^\/soap\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\/objective\/?$/i.exec(url.pathname)?.[1] ?? null;

export function isPhysicalExamRequest(value: unknown): value is PhysicalExamRequest {
  if (!examObject(value) || !examObject(value.target) || value.target.provider !== 'shepherd'
    || !examObject(value.target.consult) || !examText(value.target.consult.recordId, 36)
    || !examText(value.target.consult.viewId)) return false;
  if (value.operation === 'inspect') return true;
  if (!examText(value.pageId, 100)) return false;
  return value.operation === 'prepare' || value.operation === 'open' && examText(value.ticket, 100) && examText(value.templateId, 100);
}

export function isPhysicalExamResult(value: unknown, request: PhysicalExamRequest): value is PhysicalExamResult {
  if (!examObject(value)) return false;
  if (value.ok === false) return ['invalid_request', 'unavailable', 'patient_changed', 'not_writable',
    'physical_exam_template_not_found', 'supervising_doctor_not_set', 'physical_exam_outcome_unknown'].includes(String(value.code));
  if (value.ok !== true) return false;
  if (request.operation === 'inspect') return value.state === 'available' && examText(value.pageId, 100);
  if (request.operation === 'open') return value.state === 'opened' && value.recordId === request.target.consult.recordId
    && typeof value.examId === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value.examId);
  return value.state === 'prepared' && value.pageId === request.pageId && examText(value.ticket, 100) && examText(value.doctor, 300)
    && Array.isArray(value.templates) && value.templates.length > 0 && value.templates.length <= 200
    && value.templates.every(template => examObject(template) && examText(template.id, 100) && examText(template.label, 300))
    && new Set(value.templates.map(template => template.id)).size === value.templates.length;
}
