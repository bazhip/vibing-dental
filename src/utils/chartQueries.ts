import type { ChartSnapshot } from '../types';
import i18n from '../i18n';
import { isChartSnapshot, normalizeSnapshot } from '../hooks/useChartState';
import { supabase } from './supabaseClient';
import { localDateISO } from './localDate';
import { LocalizedError } from './apiErrors';
import { friendlyDetail } from '../components/ui/dialogs';

/** Chart queries shared by the cloud-sync hook and the extension side panel. */

export interface CloudChartMeta {
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
  /** 'canine' | 'feline' | 'equine'. */
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
  'id, patient_name, patient_number, owner_name, owner_phone, owner_email, species, dentition, chart_date, recall_date, updated_at, created_by';

const DEFAULT_PAGE_SIZE = 200;

/** Escape LIKE wildcards so user input matches literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
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
      ['patient_name', 'patient_number', 'owner_name', 'owner_phone']
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
  const rows = (data ?? []) as CloudChartMeta[];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

/**
 * A chart's saved snapshot (parsed and migrated exactly as opening it in the
 * app does) plus when its record note was last sent to the PIMS.
 */
export async function loadChartSnapshot(
  id: string,
): Promise<{ snapshot: ChartSnapshot; pimsSentAt: string | null }> {
  const t = i18n.getFixedT(null, 'app');
  if (!supabase) throw new LocalizedError(t('errors.damagedChart'));
  const { data, error } = await supabase
    .from('charts')
    .select('data, pims_sent_at')
    .eq('id', id)
    .single();
  // A Supabase or network failure says so; "damaged" is only for a snapshot that won't parse.
  if (error) throw new LocalizedError(t('errors.openVisit', { error: friendlyDetail(new Error(error.message)) }));
  if (!data) throw new LocalizedError(t('errors.damagedChart'));
  const row = data as { data: unknown; pims_sent_at?: string | null };
  if (!isChartSnapshot(row.data)) throw new LocalizedError(t('errors.damagedChart'));
  return { snapshot: normalizeSnapshot(row.data), pimsSentAt: row.pims_sent_at ?? null };
}
