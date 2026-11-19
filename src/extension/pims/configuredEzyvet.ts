import { listAppointments } from '../ezyvet/appointments';
import * as S from '../ezyvet/selectors';
import { configuredSyncSource, type ConfiguredCapture } from './configuredSync';
import type { AdapterContext } from './types';
import type { SyncIdentity } from '../../utils/pims/sync';

const id = (value: string | null): string | null => value && value.trim() === value && value.length <= 200
  && !/[\u0000-\u001f\u007f]/.test(value) && value !== '0' ? value : null;
const fail = (code: 'invalid_capture' | 'identity_changed'): never => { throw { code }; };

/** Selected visible calendar only. Name keys mirror recovered provider-name linking, not opaque clinician IDs. */
export async function captureEzyvetAppointments(date: string, context: AdapterContext): Promise<ConfiguredCapture> {
  const calendar = context.doc.querySelector(S.DASHBOARD_ACTIVE);
  const input = context.doc.querySelector<HTMLInputElement>(S.CALENDAR_DATE_INPUT);
  const day = context.doc.querySelector(S.DAY_VIEW_ACTIVE);
  if (!calendar || !input || input.value !== date || !day) return fail('invalid_capture');
  const blocks = Array.from(context.doc.querySelectorAll<HTMLElement>(S.APPOINTMENT_BLOCK));
  const columns = Array.from(context.doc.querySelectorAll(S.CALENDAR_COLUMN_NAMES));
  const attributes = ['data-record-id', 'data-appointment', 'data-animal', 'data-start', 'data-col'];
  const snapshot = JSON.stringify([blocks.map(block => attributes.map(key => block.getAttribute(key))), columns.map(column => column.textContent)]);
  const initialUrl = context.url.href, initialRoot = context.doc.documentElement, initialCookies = context.doc.cookie;
  const unchanged = (): void => {
    const currentBlocks = Array.from(context.doc.querySelectorAll(S.APPOINTMENT_BLOCK));
    const currentColumns = Array.from(context.doc.querySelectorAll(S.CALENDAR_COLUMN_NAMES));
    if (context.doc.documentElement !== initialRoot || context.doc.cookie !== initialCookies
      || (context.currentUrl?.() ?? context.url).href !== initialUrl || context.doc.querySelector(S.DASHBOARD_ACTIVE) !== calendar
      || context.doc.querySelector(S.CALENDAR_DATE_INPUT) !== input || input.value !== date
      || context.doc.querySelector(S.DAY_VIEW_ACTIVE) !== day || currentBlocks.length !== blocks.length
      || currentBlocks.some((block, index) => block !== blocks[index]) || currentColumns.length !== columns.length
      || currentColumns.some((column,index) => column !== columns[index])
      || JSON.stringify([currentBlocks.map(block => attributes.map(key => block.getAttribute(key))),currentColumns.map(column => column.textContent)]) !== snapshot) {
      return fail('identity_changed');
    }
  };
  const sourceRows = new Map<string, HTMLElement>();
  for (const block of blocks) {
    const key = id(block.getAttribute('data-appointment'));
    if (!key) continue;
    const previous = sourceRows.get(key);
    if (previous && ['data-record-id','data-animal','data-start'].some(attribute => previous.getAttribute(attribute) !== block.getAttribute(attribute))) return fail('invalid_capture');
    if (!previous) sourceRows.set(key,block);
  }
  const result = await listAppointments(date, { navigate: false }, {
    doc: context.doc,
    wait: async ms => { unchanged(); await context.wait(ms); unchanged(); },
    fetchTooltip: async (recordClass, recordId) => {
      unchanged();
      const response = await context.fetch('/General/MouseOver', {
        method: 'POST', credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { accept: '*/*', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: new URLSearchParams({ recordClass, recordId }).toString(),
      });
      unchanged();
      if (!response.ok) throw new TypeError();
      const html = await response.text();
      unchanged();
      return html;
    },
  });
  unchanged();
  if (!result.ok) return fail('invalid_capture');
  const captured: ConfiguredCapture = { items: [], failures: result.failures.map(() => ({ appointment_id:null,code:'read_failed' })) };
  for (const row of result.appointments) {
    const patientId = id(sourceRows.get(row.appointmentId)?.getAttribute('data-animal') ?? null);
    const clinicianId = row.vet ? id(`name:${row.vet}`) : null;
    if (!id(row.appointmentId) || !patientId || !clinicianId || !Number.isFinite(Date.parse(row.start))) {
      captured.failures.push({ appointment_id: id(row.appointmentId), code:'identity_missing' });
      continue;
    }
    captured.items.push({ appointment_id:row.appointmentId,patient_id:patientId,clinician_id:clinicianId,encounter_id:null,
      starts_at:row.start,ends_at:null,status:'active' });
  }
  return captured;
}

export const ezyvetConfiguredSyncSource = (context: AdapterContext, binding: SyncIdentity, options?: { userConfirmed?: boolean }) =>
  configuredSyncSource(context,binding,date => captureEzyvetAppointments(date,context),options);
