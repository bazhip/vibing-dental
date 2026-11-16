import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';

const db = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  rows: [] as unknown[],
  single: { data: null as unknown, error: null as { message: string } | null },
  singleQueue: [] as Array<{ data: unknown; error: { message: string } | null }>,
}));
vi.mock('./supabaseClient', () => {
  const q: Record<string, unknown> = {};
  const rec = (name: string) => (...args: unknown[]) => { db.calls.push([name, ...args]); return q; };
  Object.assign(q, {
    select: rec('select'), or: rec('or'), eq: rec('eq'), in: rec('in'), gt: rec('gt'), lte: rec('lte'), order: rec('order'),
    range: async (...args: unknown[]) => { db.calls.push(['range', ...args]); return { data: db.rows, error: null }; },
    single: async () => db.singleQueue.shift() ?? db.single,
  });
  return { supabase: { from: (t: string) => { db.calls.push(['from', t]); return q; } }, cloudEnabled: true };
});

import { listChartsPage, loadChartSnapshot, blankSupersededRecalls } from './chartQueries';
import { LocalizedError } from './apiErrors';

beforeEach(() => { db.calls.length = 0; db.rows = []; db.singleQueue = []; });

describe('listChartsPage', () => {
  it('searches the four columns (LIKE-escaped), orders and pages', async () => {
    db.rows = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}` }));
    const page = await listChartsPage({ search: '50%_(a,b)', limit: 2, offset: 4, sortKey: 'patient' });
    expect(db.calls).toContainEqual([
      'or',
      ['patient_name', 'patient_number', 'owner_name', 'owner_phone'].map((c) => `${c}.ilike.%50\\%\\_ a b%`).join(','),
    ]);
    expect(db.calls).toContainEqual(['order', 'patient_name', { ascending: true }]);
    expect(db.calls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(db.calls).toContainEqual(['range', 4, 6]);
    expect(page.rows).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it('due list: superseded rows keep their place (blanked), so paging still lines up', async () => {
    db.rows = [
      { id: 'old', patient_number: '7', patient_name: 'Rex', chart_date: '2026-10-01', recall_date: '2026-10-15' },
      { id: 'new', patient_number: '7', patient_name: 'Rex', chart_date: '2026-11-01', recall_date: '' },
      { id: 'x', patient_number: '9', patient_name: 'Max', chart_date: '2026-10-01', recall_date: '2026-10-15' },
    ];
    const page = await listChartsPage({ dueOnly: true, limit: 2 });
    expect(page.hasMore).toBe(true);
    expect(page.rows.map((r) => [r.id, r.recall_date])).toEqual([['old', ''], ['new', '']]);
    expect(db.calls).toContainEqual(['in', 'patient_number', ['7']]);
  });

  it('defaults to newest first, 200 per page', async () => {
    const page = await listChartsPage();
    expect(db.calls).toContainEqual(['order', 'updated_at', { ascending: false }]);
    expect(db.calls).toContainEqual(['range', 0, 200]);
    expect(page).toEqual({ rows: [], hasMore: false });
  });
});

const rawData = {
  patientInfo: {
    patientName: 'Bella', patientNumber: '1', doctor: '', tech: '', date: '2026-11-11',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  toothData: [], species: 'canine', logo: 'socal',
};

describe('loadChartSnapshot', () => {
  it('returns the normalized snapshot and pims_sent_at', async () => {
    db.single = { data: { data: rawData, pims_sent_at: '2026-11-02T09:00:00Z' }, error: null };
    const out = await loadChartSnapshot('c1');
    expect(db.calls).toContainEqual(['select', 'data, pims_sent_at']);
    expect(out.pimsSentAt).toBe('2026-11-02T09:00:00Z');
    expect(out.snapshot.patientInfo.patientName).toBe('Bella');
    expect(out.snapshot.preMarks).toEqual({});
    expect(out.snapshot.patientInfo.complaint).toBe('');
  });

  it('loads the chart without pims_sent_at before the migration adds the column', async () => {
    db.singleQueue = [
      { data: null, error: { message: 'column charts.pims_sent_at does not exist' } },
      { data: { data: rawData }, error: null },
    ];
    const out = await loadChartSnapshot('c1');
    expect(db.calls).toContainEqual(['select', 'data']);
    expect(out.pimsSentAt).toBeNull();
    expect(out.snapshot.patientInfo.patientName).toBe('Bella');
  });

  it('null pims_sent_at when never sent', async () => {
    db.single = { data: { data: rawData, pims_sent_at: null }, error: null };
    expect((await loadChartSnapshot('c1')).pimsSentAt).toBeNull();
  });

  it('a Supabase error is a load failure, not a damaged chart', async () => {
    db.single = { data: null, error: { message: 'Failed to fetch' } };
    const err = await loadChartSnapshot('c1').then(() => null, (e: unknown) => e as Error);
    expect(err).toBeInstanceOf(LocalizedError);
    expect(err?.message).toMatch(/Couldn.t open that visit/);
    expect(err?.message).not.toMatch(/damaged/);
  });

  it('a network error reads as the translated network message in another language', async () => {
    const i18n = (await import('../i18n')).default;
    await i18n.changeLanguage('fr');
    try {
      db.single = { data: null, error: { message: 'Failed to fetch' } };
      const err = await loadChartSnapshot('c1').then(() => null, (e: unknown) => e as Error);
      expect(err?.message).toContain(i18n.t('errors.network', { ns: 'common' }));
      expect(err?.message).not.toMatch(/Failed to fetch|Details/);
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('throws a translated error for a damaged snapshot', async () => {
    db.single = { data: { data: { nope: true }, pims_sent_at: null }, error: null };
    await expect(loadChartSnapshot('c1')).rejects.toThrow(/damaged/);
  });
});

describe('blankSupersededRecalls', () => {
  const v = (id: string, num: string, name: string, date: string, recall = '2026-10-15') => ({ id, patient_number: num, patient_name: name, chart_date: date, recall_date: recall });
  const due = (rows: ReturnType<typeof v>[]) => rows.filter((r) => r.recall_date).map((r) => r.id);

  it('a later visit of the same patient supersedes an earlier visit’s recheck date (row kept, date blanked)', () => {
    const out = blankSupersededRecalls([v('old', '7', 'Rex', '2026-10-01'), v('other', '8', 'Max', '2026-10-01')], [v('recheck', '7', 'Rex', '2026-11-01', '')]);
    expect(out.map((r) => r.id)).toEqual(['old', 'other']);
    expect(due(out)).toEqual(['other']);
  });

  it('matches patients like the library does (number first, case-insensitive; name only without a number)', () => {
    const out = blankSupersededRecalls([v('a', '', 'Bella', '2026-10-01'), v('b', 'X1', 'Bo', '2026-10-01')], [v('a2', '', 'bella', '2026-11-01'), v('b2', 'x1', 'Someone else', '2026-11-01')]);
    expect(due(out)).toEqual([]);
  });

  it('a visit on the same day, or earlier, does not supersede it', () => {
    const out = blankSupersededRecalls([v('a', '7', 'Rex', '2026-10-01')], [v('same', '7', 'Rex', '2026-10-01'), v('before', '7', 'Rex', '2026-09-01')]);
    expect(due(out)).toEqual(['a']);
  });
});
