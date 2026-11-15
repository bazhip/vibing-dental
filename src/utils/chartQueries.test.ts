import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';

const db = vi.hoisted(() => ({
  calls: [] as Array<[string, ...unknown[]]>,
  rows: [] as unknown[],
  single: { data: null as unknown, error: null as { message: string } | null },
}));
vi.mock('./supabaseClient', () => {
  const q: Record<string, unknown> = {};
  const rec = (name: string) => (...args: unknown[]) => { db.calls.push([name, ...args]); return q; };
  Object.assign(q, {
    select: rec('select'), or: rec('or'), eq: rec('eq'), gt: rec('gt'), lte: rec('lte'), order: rec('order'),
    range: async (...args: unknown[]) => { db.calls.push(['range', ...args]); return { data: db.rows, error: null }; },
    single: async () => db.single,
  });
  return { supabase: { from: (t: string) => { db.calls.push(['from', t]); return q; } }, cloudEnabled: true };
});

import { listChartsPage, loadChartSnapshot } from './chartQueries';
import { LocalizedError } from './apiErrors';

beforeEach(() => { db.calls.length = 0; db.rows = []; });

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

  it('throws a translated error for a damaged snapshot', async () => {
    db.single = { data: { data: { nope: true }, pims_sent_at: null }, error: null };
    await expect(loadChartSnapshot('c1')).rejects.toThrow(/damaged/);
  });
});
