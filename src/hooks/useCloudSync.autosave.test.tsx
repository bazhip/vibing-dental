import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartSnapshot } from '../types';

// --- Supabase mock: a chainable query builder over a fixed set of rows ---
const db = vi.hoisted(() => ({
  visits: [] as Array<Record<string, string>>,
  upserts: [] as Array<Record<string, unknown>>,
  opened: [] as string[],
  /** Error the next N chart upserts return (then they succeed). */
  refuseUpserts: 0,
  /** Whether a refused chart's row is still readable by this account. */
  rowVisible: true,
}));
vi.mock('../utils/supabaseClient', () => {
  const builder = () => {
    const q: Record<string, unknown> = {};
    let singleId = '';
    const chain = () => q;
    Object.assign(q, {
      select: (cols?: string) => { if (cols === 'id') q.__existCheck = true; return q; },
      order: chain, limit: chain, ilike: chain,
      eq: (col: string, v: string) => { if (col === 'id') singleId = v; return q; },
      maybeSingle: async () => {
        if (q.__refused) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
        if (q.__existCheck && !db.rowVisible) return { data: null, error: null };
        return { data: { id: 'x', updated_at: '2026-11-12T10:00:00Z' }, error: null };
      },
      single: async () => { db.opened.push(singleId); return { data: { id: singleId, data: snap({}), updated_at: '2026-11-12T09:00:00Z' }, error: null }; },
      upsert: (row: Record<string, unknown>) => {
        db.upserts.push(row);
        if (db.refuseUpserts > 0) { db.refuseUpserts--; q.__refused = true; }
        return q;
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: db.visits, error: null }),
    });
    return q;
  };
  return {
    cloudEnabled: true,
    supabase: { from: builder, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } },
  };
});

const confirm = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../components/ui/dialogs', () => ({ confirmDialog: confirm, toast: vi.fn(), friendlyError: (e: unknown) => String(e) }));

// This test environment has no working localStorage (as in GoogleSignIn.test).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

import { hasClinicalContent, useCloudSync } from './useCloudSync';

function snap(over: { name?: string; exam?: boolean; date?: string }): ChartSnapshot {
  const exam: Record<string, { status: string; comment: string }> = {};
  if (over.exam) exam.tongue = { status: 'normal', comment: '' };
  return {
    species: 'canine',
    toothData: [],
    patientInfo: {
      patientName: over.name ?? 'Fluffy', patientNumber: '', ownerName: 'Pat', ownerPhone: '', ownerEmail: '',
      date: over.date ?? '2026-11-12', complaint: '', treatmentReport: '', nerveBlocks: {}, exam,
    },
  } as unknown as ChartSnapshot;
}

const fakeChart = (s: ChartSnapshot, id = 'chart-1') => ({
  getSnapshot: () => s,
  cloudChartId: id,
  resetCloudChartId: () => 'forked',
  openedExisting: false,
  setOpenedExisting: vi.fn(),
  applySnapshot: vi.fn(),
}) as unknown as Parameters<typeof useCloudSync>[0];

beforeEach(() => {
  store.clear();
  db.visits = []; db.upserts = []; db.opened = []; db.refuseUpserts = 0; db.rowVisible = true;
  confirm.mockReset(); confirm.mockResolvedValue(false);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1500); }); };

describe('hasClinicalContent', () => {
  it('ignores patient and owner details; counts charting', () => {
    expect(hasClinicalContent(snap({}))).toBe(false);
    expect(hasClinicalContent(snap({ exam: true }))).toBe(true);
  });
});

describe('autosave of new charts', () => {
  it('waits for clinical content, offering a manual Save meanwhile', async () => {
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({}))));
    await flush();
    expect(db.upserts).toHaveLength(0);
    expect(result.current.awaitingClinical).toBe(true);

    await act(async () => { await result.current.saveNow(); });
    expect(db.upserts).toHaveLength(1);
    expect(result.current.awaitingClinical).toBe(false); // saved once → no Save button
  });

  it('autosaves as soon as charting starts', async () => {
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    expect(result.current.awaitingClinical).toBe(false);
    await flush();
    expect(db.upserts).toHaveLength(1);
  });
});

describe('same-day duplicate guard', () => {
  const sameDay = { id: 'older', chart_date: '2026-11-12', species: 'canine', patient_name: 'Fluffy', patient_number: '' };

  it('asks once before the first save, and "Keep both" saves', async () => {
    db.visits = [sameDay];
    renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(db.upserts).toHaveLength(1);
  });

  it('"Open existing visit" opens it instead of saving a duplicate', async () => {
    db.visits = [sameDay];
    confirm.mockResolvedValue(true);
    renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(db.upserts).toHaveLength(0);
    expect(db.opened).toEqual(['older']);
  });

  it("doesn't ask for a different visit date", async () => {
    db.visits = [{ ...sameDay, chart_date: '2026-11-01' }];
    renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(confirm).not.toHaveBeenCalled();
    expect(db.upserts).toHaveLength(1);
  });

  it('skips the question when it was already answered (new visit)', async () => {
    db.visits = [sameDay];
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({}))));
    act(() => result.current.skipNextDuplicateCheck());
    await act(async () => { await result.current.saveNow(); });
    expect(confirm).not.toHaveBeenCalled();
    expect(db.upserts).toHaveLength(1);
  });
});

describe('refused saves', () => {
  it("never copies the user's own chart into a new record", async () => {
    db.refuseUpserts = 1; // the row is readable → it's ours
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(db.upserts.map((r) => r.id)).toEqual(['chart-1']); // no fork
    expect(result.current.status).toBe('error');
  });

  it("forks only when the row belongs to another account (hidden by RLS)", async () => {
    db.refuseUpserts = 1;
    db.rowVisible = false;
    renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(db.upserts.map((r) => r.id)).toEqual(['chart-1', 'forked']);
  });
});
