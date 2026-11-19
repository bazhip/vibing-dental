import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { composeDraft, createDraftBackend, draftError, draftText, renderDraftPdf } from './drafts';
import { radiologySourceBasis, radiologyReviewBasis } from '../radiologyReportState';
import { normalizeSnapshot } from '../../hooks/useChartState';
import type { ChartSnapshot } from '../../types';

export const source = { chart_id: 'chart', practice_id: 'practice', patient_name: 'Milo', patient_number: 'P-1',
  chart_date: '2026-11-16', updated_at: '2026-11-16T12:00:00Z', hash: 'a'.repeat(64), data: {} };
export const draft = { id: 'draft', chart_id: source.chart_id, practice_id: source.practice_id, kind: 'history' as const,
  language: 'en' as const, body: '108: 4.5 mm; 0.05 mg/kg', source_hash: source.hash, source,
  version: 2, reviewed_version: 2, reviewed_by: 'vet', reviewed_at: source.updated_at };

function transport(data: unknown, error: { code?: string; message?: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, backend: createDraftBackend({ rpc }) };
}
describe('persisted draft transport', () => {
  it('retains identities and versions through each boundary', async () => {
    const { rpc, backend } = transport({ source, drafts: [draft] });
    expect(await backend.context('chart')).toEqual({ source, drafts: [draft] });
    expect(rpc).toHaveBeenCalledWith('pims_draft_context', { payload: { chart_id: 'chart' } });
    rpc.mockResolvedValue({ data: draft, error: null });
    expect(await backend.export({ chart_id: 'chart', draft_id: 'draft', expected_version: 2 })).toEqual(draft);
    expect(rpc).toHaveBeenLastCalledWith('pims_draft_export', { payload: { chart_id: 'chart', draft_id: 'draft', expected_version: 2 } });
  });
  it.each([
    { ...draft, chart_id: 'other' }, { ...draft, id: 'other' }, { ...draft, version: 3 },
    { ...draft, reviewed_version: null }, { ...draft, language: 'xx' }, { ...draft, source_hash: 'wrong' },
    { ...draft, source: { ...source, chart_id: 'other' } }, { ...draft, body: '' },
  ])('rejects malformed or unreviewed export receipts', async (data) => {
    const { backend, rpc } = transport(data);
    await expect(backend.export({ chart_id: 'chart', draft_id: 'draft', expected_version: 2 })).rejects.toEqual({ code: 'unknown' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('rejects cross-practice draft pages and duplicate IDs', async () => {
    for (const drafts of [[{ ...draft, practice_id: 'other' }], [draft, draft]]) {
      await expect(transport({ source, drafts }).backend.context('chart')).rejects.toEqual({ code: 'unknown' });
    }
  });
  it.each([
    [{ code: 'PGRST202' }, 'schema'], [{ message: 'pims_stale' }, 'stale'],
    [{ message: 'pims_forbidden' }, 'forbidden'], [{ message: 'pims_conflict' }, 'conflict'],
    [{ message: 'pims_unreviewed' }, 'unreviewed'], [{ message: 'secret SQL detail' }, 'unknown'],
  ] as const)('keeps server detail out of clinical errors', async (error, code) => {
    await expect(transport(null, error).backend.context('chart')).rejects.toEqual({ code });
    expect(draftError({ code })).toBe(code);
  });
});
describe('clinical manual export', () => {
  it('composes radiology from recorded findings, without including unselected treatment or interpreting images', () => {
    const content = { ...source, data: { patientInfo: { patientName: 'Milo', patientNumber: 'P-1', radiographicFindings: '108: 4.5 mm lucency', treatmentReport: 'Do not include this procedure' }, toothData: [], species: 'canine' } };
    expect(composeDraft(content, 'radiology', 'en')).toContain('108: 4.5 mm lucency');
    expect(composeDraft(content, 'radiology', 'en')).not.toContain('Do not include this procedure');
    expect(composeDraft(content, 'history', 'en')).toContain('Do not include this procedure');
  });
  it('refuses composition when the saved snapshot and chart identity disagree', () => {
    for (const patientInfo of [{ patientName: 'Another patient', patientNumber: 'P-1' }, { patientName: 'Milo', patientNumber: 'OTHER' }]) {
      expect(() => composeDraft({ ...source, data: { patientInfo, toothData: [], species: 'canine' } }, 'history', 'en')).toThrow();
    }
  });
  it('preserves literal clinical text and records source attribution', () => {
    const text = draftText(draft);
    expect(text).toContain(draft.body);
    expect(text).toContain('Milo');
    expect(text).toContain('P-1');
    expect(text).toContain(source.chart_id);
    expect(text).toContain(source.updated_at);
    expect(text).toContain('ToothOps');
  });
  it('paginates long words, lines and paragraphs without dropping text', async () => {
    const bytes = await renderDraftPdf({ ...draft, body: ('4.5mm'.repeat(40) + '\n').repeat(90) });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(2);
  });
  it('fails safely for unsupported glyphs instead of silently corrupting names or findings', async () => {
    await expect(renderDraftPdf({ ...draft, body: '犬: 4.5 mm' })).rejects.toEqual({ code: 'font' });
    expect(draftText({ ...draft, body: '犬: 4.5 mm' })).toContain('犬: 4.5 mm');
  });
});

it('reuses a reviewed current radiology report only in its recorded language', () => {
  const data=normalizeSnapshot({patientInfo:{patientName:'Milo',patientNumber:'P-1',radiographicFindings:'108 lucency',radiologyReport:'Reviewed clinical report',radiologyReportLanguage:'en'},toothData:[],species:'canine'} as unknown as ChartSnapshot);
  data.patientInfo.radiologyReportBasis=radiologySourceBasis(data);data.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(data,'en');
  expect(composeDraft({...source,data},'radiology','en')).toBe('Reviewed clinical report');
  expect(composeDraft({...source,data},'radiology','fr')).not.toBe('Reviewed clinical report');
  data.patientInfo.radiographicFindings='Changed source';
  expect(composeDraft({...source,data},'radiology','en')).not.toBe('Reviewed clinical report');
});
