import { renderClinicalTextPdf } from '../textPdf';
import { isRadiologyReportReviewed } from '../radiologyReportState';
import i18n from '../../i18n';
import { isAppLanguage, type AppLanguage } from '../../i18n/config';
import { isChartSnapshot, normalizeSnapshot } from '../../hooks/useChartState';
import { buildRecordNote, recordNoteBasis, recordNoteT, recordNoteText } from '../recordNote';
import type { RpcClient } from './sync';

export type DraftKind = 'history' | 'radiology';
export interface DraftSource {
  chart_id: string;
  practice_id: string;
  patient_name: string;
  patient_number: string;
  chart_date: string;
  updated_at: string;
  hash: string;
  data?: unknown;
}
export interface ClinicalDraft {
  id: string;
  chart_id: string;
  practice_id: string;
  kind: DraftKind;
  language: AppLanguage;
  body: string;
  source_hash: string;
  source: DraftSource;
  version: number;
  reviewed_version: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}
export interface DraftContext { source: DraftSource; drafts: ClinicalDraft[] }
export interface DraftRef { chart_id: string; draft_id: string; expected_version: number }
export type DraftWrite = DraftRef & { request_id: string } & (
  { action: 'review' } |
  { action: 'save'; kind: DraftKind; language: AppLanguage; body: string; source_hash: string }
);
export interface DraftBackend {
  context(chartId: string): Promise<DraftContext>;
  write(input: DraftWrite): Promise<ClinicalDraft>;
  export(input: DraftRef): Promise<ClinicalDraft>;
}
const errorCodes = ['schema', 'stale', 'forbidden', 'conflict', 'unreviewed', 'font', 'source', 'limit', 'unknown'] as const;
export type DraftError = typeof errorCodes[number];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const instant = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
function validSource(value: unknown): value is DraftSource {
  return record(value) && text(value.chart_id) && text(value.practice_id) && typeof value.patient_name === 'string'
    && typeof value.patient_number === 'string' && text(value.chart_date) && instant(value.updated_at)
    && typeof value.hash === 'string' && /^[a-f0-9]{64}$/.test(value.hash);
}
function validDraft(value: unknown): value is ClinicalDraft {
  return record(value) && text(value.id) && text(value.chart_id) && text(value.practice_id)
    && (value.kind === 'history' || value.kind === 'radiology') && isAppLanguage(value.language)
    && text(value.body) && value.body.trim().length > 0 && value.body.length <= 60000 && version(value.version)
    && validSource(value.source) && value.source_hash === value.source.hash && value.source.chart_id === value.chart_id
    && value.source.practice_id === value.practice_id
    && (value.reviewed_version === null ? value.reviewed_by === null && value.reviewed_at === null
      : value.reviewed_version === value.version && text(value.reviewed_by) && instant(value.reviewed_at));
}
export function draftError(cause: unknown): DraftError {
  return record(cause) && errorCodes.includes(cause.code as DraftError) ? cause.code as DraftError : 'unknown';
}
export function createDraftBackend(client: RpcClient): DraftBackend {
  const invoke = async (name: string, payload: unknown): Promise<unknown> => {
    const { data, error } = await client.rpc(name, { payload });
    if (error || data === null) {
      const code = error?.message?.replace(/^pims_/, '');
      throw { code: error?.code === 'PGRST202' || error?.code === '42883' ? 'schema'
        : errorCodes.includes(code as DraftError) ? code : 'unknown' };
    }
    return data;
  };
  return {
    context: async (chartId) => {
      const data = await invoke('pims_draft_context', { chart_id: chartId });
      if (!record(data) || !validSource(data.source) || data.source.chart_id !== chartId || !Array.isArray(data.drafts)
        || data.drafts.length > 20 || new Set(data.drafts.map((item: unknown) => record(item) ? item.id : null)).size !== data.drafts.length) throw { code: 'unknown' };
      const source = data.source;
      if (data.drafts.some((item) => !validDraft(item) || item.chart_id !== chartId || item.practice_id !== source.practice_id)) throw { code: 'unknown' };
      return { source, drafts: data.drafts as ClinicalDraft[] };
    },
    write: async (input) => {
      const data = await invoke('pims_draft_write', input);
      if (!validDraft(data) || data.id !== input.draft_id || data.chart_id !== input.chart_id || data.version !== input.expected_version + 1
        || (input.action === 'save' ? data.body !== input.body || data.kind !== input.kind || data.language !== input.language
          || data.source_hash !== input.source_hash || data.reviewed_version !== null : data.reviewed_version !== data.version)) throw { code: 'unknown' };
      return data;
    },
    export: async (input) => {
      const data = await invoke('pims_draft_export', input);
      if (!validDraft(data) || data.id !== input.draft_id || data.chart_id !== input.chart_id
        || data.version !== input.expected_version || data.reviewed_version !== data.version) throw { code: 'unknown' };
      return data;
    },
  };
}

export function composeDraft(source: DraftSource, kind: DraftKind, language: AppLanguage): string {
  if (!isChartSnapshot(source.data)) throw { code: 'source' };
  if (source.data.patientInfo.patientName !== source.patient_name || (source.data.patientInfo.patientNumber ?? '') !== source.patient_number) throw { code: 'source' };
  const snapshot = normalizeSnapshot(source.data);
  if (kind === 'radiology' && isRadiologyReportReviewed(snapshot, language)) return snapshot.patientInfo.radiologyReport!;
  if (kind === 'history' && snapshot.recordNote?.lng === language && snapshot.recordNote.basedOn === recordNoteBasis(snapshot)) return snapshot.recordNote.text;
  const note = buildRecordNote(snapshot, recordNoteT(language));
  return recordNoteText(kind === 'radiology' ? { sections: note.sections.filter((section) => ['header', 'findings', 'radiographs'].includes(section.key)) } : note);
}

export function draftText(draft: ClinicalDraft): string {
  const translate = i18n.getFixedT(draft.language, 'pims');
  return [translate(`drafts.${draft.kind}`), translate('drafts.attribution', {
    patient: draft.source.patient_name, number: draft.source.patient_number, date: draft.source.chart_date,
    chart: draft.source.chart_id, revision: draft.source.updated_at,
  }), draft.body, translate('drafts.manual')].join('\n\n');
}

export async function renderDraftPdf(draft: ClinicalDraft): Promise<Uint8Array<ArrayBuffer>> {
  return renderClinicalTextPdf(draftText(draft), i18n.getFixedT(draft.language, 'pims')(`drafts.${draft.kind}`));
}
