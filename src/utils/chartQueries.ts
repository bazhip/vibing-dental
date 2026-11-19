import type { ChartSnapshot } from '../types';
import i18n from '../i18n';
import { isChartSnapshot, normalizeSnapshot } from '../hooks/useChartState';
import { supabase } from './supabaseClient';
import { localDateISO } from './localDate';
import { LocalizedError, describeError, detailOnly } from './apiErrors';

/** Chart queries shared by the cloud-sync hook and the extension side panel. */

export interface CloudChartMeta {
  finalized_at?: string | null;
  patient_id?: string;
  id: string;
  patient_name: string;
  patient_number: string;
  owner_name: string;
  owner_phone: string;
  owner_email: string;
  species: string;
  dentition: string;
  chart_date: string;
  recall_date: string;
  updated_at: string;
  /** The visit's author — a patient can be seen by different doctors
   *  across visits, so this is per-chart, not per-patient. */
  created_by: string;
}

/** Server-side chart listing — filters, search, and pagination all run
 *  in Postgres so chart #501+ is exactly as findable as chart #1. */
export interface ChartListQuery {
  /** Case-insensitive substring match over patient name/number and
   *  owner name/phone. */
  search?: string;
  /** 'canine' | 'feline' | 'equine' | 'rabbit'. */
  species?: string;
  /** Visit author (user id). */
  createdBy?: string;
  /** Only charts whose recheck date is today or past. */
  dueOnly?: boolean;
  sortKey?: 'patient' | 'updated' | 'recall';
  sortDir?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface ChartListPage {
  rows: CloudChartMeta[];
  /** True when another `offset += limit` page exists. */
  hasMore: boolean;
}

export const CHART_META_COLUMNS =
  'finalized_at:data->>finalizedAt, patient_id:data->patientInfo->>patientId, id, patient_name, patient_number, owner_name, owner_phone, owner_email, species, dentition, chart_date, recall_date, updated_at, created_by';

const DEFAULT_PAGE_SIZE = 200;

/** Escape LIKE wildcards so user input matches literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The patient a chart belongs to: the same rule the library groups by
 *  (patient number when present, else name; case-insensitive). */
export function patientKey(c: Pick<CloudChartMeta, 'id' | 'patient_number' | 'patient_name' | 'patient_id'>): string {
  const num = (c.patient_number ?? '').trim().toLowerCase();
  const name = (c.patient_name ?? '').trim().toLowerCase();
  return c.patient_id ? `patient:${c.patient_id}` : num ? `n:${num}` : name ? `p:${name}` : `id:${c.id}`;
}

/** Blank recheck dates a later visit has superseded. A visit's recheck
 *  date stops counting once the same patient has a visit dated after it
 *  (normally the recheck itself); before, the patient stayed "overdue" until
 *  someone cleared the old date by hand. Rows are kept (blanked, not
 *  dropped) so paging offsets still line up. `visits` = any of the
 *  patients' visits. */
export function blankSupersededRecalls<T extends Pick<CloudChartMeta, 'id' | 'patient_number' | 'patient_name' | 'patient_id' | 'chart_date' | 'recall_date'>>(
  due: T[],
  visits: Array<Pick<CloudChartMeta, 'id' | 'patient_number' | 'patient_name' | 'patient_id' | 'chart_date'>>
): T[] {
  const latest = new Map<string, string>();
  for (const v of [...due, ...visits]) {
    const k = patientKey(v);
    const d = v.chart_date || '';
    if (d > (latest.get(k) ?? '')) latest.set(k, d);
  }
  return due.map((c) => ((latest.get(patientKey(c)) ?? '') > (c.chart_date || '') ? { ...c, recall_date: '' } : c));
}

const IN_CHUNK = 80; // values per .in() — keeps the request URL short

/** Visits of the patients behind these due charts (for
 *  blankSupersededRecalls). Exact-match lookups: a patient whose other
 *  visits differ in case or spacing just stays listed as due (fail-safe). */
async function visitsOfPatients(due: CloudChartMeta[]): Promise<CloudChartMeta[]> {
  if (!supabase || due.length === 0) return [];
  const client = supabase;
  const ids = [...new Set(due.map(c => c.patient_id).filter((id): id is string => !!id))];
  const nums = [...new Set(due.filter(c => !c.patient_id).map((c) => c.patient_number.trim()).filter(Boolean))];
  const names = [...new Set(due.filter((c) => !c.patient_id && !c.patient_number.trim()).map((c) => c.patient_name.trim()).filter(Boolean))];
  const cols = 'patient_id:data->patientInfo->>patientId, id, patient_number, patient_name, chart_date';
  const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / IN_CHUNK) }, (_, i) => xs.slice(i * IN_CHUNK, (i + 1) * IN_CHUNK));
  const results = await Promise.all([
    ...chunks(ids).map(part => client.from('charts').select(cols).in('data->patientInfo->>patientId', part).range(0, 999)),
    ...chunks(nums).map((part) => client.from('charts').select(cols).in('patient_number', part).range(0, 999)),
    ...chunks(names).map((part) => client.from('charts').select(cols).eq('patient_number', '').in('patient_name', part).range(0, 999)),
  ]);
  const out: CloudChartMeta[] = [];
  for (const r of results) {
    if (r.error) throw new Error(r.error.message);
    out.push(...((r.data ?? []) as CloudChartMeta[]));
  }
  return out;
}

/** The practice's charts for these patients (the extension side panel's "today's appointments").
 *  Matches by patient number, and by exact case-insensitive name for charts that may have no number.
 *  De-duplicated by id. */
export async function chartsForPatients(patients: { patientNumber: string; patientName: string }[]): Promise<CloudChartMeta[]> {
  if (!supabase || patients.length === 0) return [];
  const client = supabase;
  const nums = [...new Set(patients.map((p) => p.patientNumber.trim()).filter(Boolean))];
  const names = [...new Set(patients.map((p) => p.patientName.trim()).filter(Boolean))];
  const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / IN_CHUNK) }, (_, i) => xs.slice(i * IN_CHUNK, (i + 1) * IN_CHUNK));
  const results = await Promise.all([
    ...chunks(nums).map((part) => client.from('charts').select(CHART_META_COLUMNS).in('patient_number', part).range(0, 999)),
    ...names.map((name) => client.from('charts').select(CHART_META_COLUMNS).ilike('patient_name', escapeLike(name)).range(0, 999)),
  ]);
  const byId = new Map<string, CloudChartMeta>();
  for (const r of results) {
    if (r.error) {
      const t = i18n.getFixedT(null, 'app');
      throw new LocalizedError(t('errors.loadCharts', { error: describeError(new Error(r.error.message), i18n.t('errors.generic', { ns: 'common' }), detailOnly) }));
    }
    for (const c of (r.data ?? []) as CloudChartMeta[]) byId.set(c.id, c);
  }
  return [...byId.values()];
}

/** One page of the practice's charts: search, filters, order and paging all run in Postgres. */
export async function listChartsPage(q: ChartListQuery = {}): Promise<ChartListPage> {
  if (!supabase) return { rows: [], hasMore: false };
  const limit = q.limit ?? DEFAULT_PAGE_SIZE;
  const offset = q.offset ?? 0;
  let query = supabase.from('charts').select(CHART_META_COLUMNS);
  // PostgREST's or= syntax splits on commas/parens, so those can't
  // appear in the pattern; spaces stand in for them (names never need
  // them to match). %/_ are LIKE wildcards — escape so they're literal.
  const term = (q.search ?? '').replace(/[(),]/g, ' ').trim();
  if (term) {
    const pattern = `%${escapeLike(term)}%`;
    query = query.or(
      ['patient_name', 'patient_number', 'owner_name', 'owner_phone', 'owner_email']
        .map((col) => `${col}.ilike.${pattern}`)
        .join(',')
    );
  }
  if (q.species) query = query.eq('species', q.species);
  if (q.createdBy) query = query.eq('created_by', q.createdBy);
  // recall_date is text, '' when unset — gt('') keeps only real dates.
  if (q.dueOnly) query = query.gt('recall_date', '').lte('recall_date', localDateISO());
  const sortCol =
    q.sortKey === 'patient' ? 'patient_name'
    : q.sortKey === 'recall' ? 'recall_date'
    : 'updated_at';
  const ascending = (q.sortDir ?? (sortCol === 'updated_at' ? 'desc' : 'asc')) === 'asc';
  query = query.order(sortCol, { ascending });
  if (sortCol !== 'updated_at') query = query.order('updated_at', { ascending: false });
  // One row past the page tells us whether more exist without a
  // second count query.
  const { data, error } = await query.range(offset, offset + limit);
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as CloudChartMeta[];
  const hasMore = rows.length > limit;
  rows = rows.slice(0, limit);
  if (q.dueOnly) rows = blankSupersededRecalls(rows, await visitsOfPatients(rows));
  return { rows, hasMore };
}

/**
 * A chart's saved snapshot (parsed and migrated exactly as opening it in the
 * app does) plus when its record note was last sent to the PIMS.
 */
export async function loadChartSnapshot(
  id: string,
): Promise<{ snapshot: ChartSnapshot; pimsSentAt: string | null }> {
  const t = i18n.getFixedT(null, 'app');
  if (!supabase) throw new LocalizedError(i18n.t('panel.notConnected', { ns: 'pims' }));
  let { data, error } = await supabase
    .from('charts')
    .select('data, pims_sent_at')
    .eq('id', id)
    .single();
  // Before the pims_send migration is applied the column doesn't exist; load the chart without it.
  if (error && /pims_sent_at/.test(error.message)) {
    ({ data, error } = await supabase.from('charts').select('data').eq('id', id).single());
  }
  // A Supabase or network failure says so; "damaged" is only for a snapshot that won't parse.
  if (error) throw new LocalizedError(t('errors.openVisit', { error: describeError(new Error(error.message), i18n.t('errors.generic', { ns: 'common' }), detailOnly) }));
  if (!data) throw new LocalizedError(t('errors.damagedChart'));
  const row = data as { data: unknown; pims_sent_at?: string | null };
  if (!isChartSnapshot(row.data)) throw new LocalizedError(t('errors.damagedChart'));
  return { snapshot: normalizeSnapshot(row.data), pimsSentAt: row.pims_sent_at ?? null };
}
