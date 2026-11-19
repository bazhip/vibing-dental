import { useState } from 'react';
import { createPatientIdentity } from '../utils/patientIds';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChartSnapshot } from '../types';

// --- Supabase mock: a chainable query builder over a fixed set of rows ---
const db = vi.hoisted(() => ({
  identities: {} as Record<string, { patient_name: string; patient_number: string }>,
  identityReadFails: false,
  visits: [] as Array<Record<string, string>>,
  upserts: [] as Array<Record<string, unknown>>,
  opened: [] as string[],
  readAt: '2026-11-12T09:00:00Z',
  readGate: null as Promise<void> | null,
  guardVersions: [] as string[],
  rejectGuardedWrite: false,
  ignoreInitialInsert: false,
  remoteSnapshot: undefined as ChartSnapshot | undefined,
  /** Error the next N chart upserts return (then they succeed). */
  refuseUpserts: 0,
  /** Whether a refused chart's row is still readable by this account. */
  rowVisible: true,
  /** Next N chart upserts fail like a dropped connection (then succeed). */
  failUpserts: 0,
  /** While set, chart upserts wait for it (a save still in flight). */
  gate: null as Promise<void> | null,
  /** Only upserts of this id wait for the gate ('' = all). */
  gateId: '',
  /** Rows a chart delete reports as deleted ([] = row security refused it). */
  deletedRows: [{ id: 'x' }] as unknown[],
}));
vi.mock('../utils/supabaseClient', () => {
  const builder = () => {
    const q: Record<string, unknown> = {};
    let singleId = '';
    const chain = () => q;
    Object.assign(q, {
      select: (cols?: string) => { if (cols === 'data, updated_at') q.__remoteSnapshot = true; if (cols === 'id') q.__existCheck = true; if (cols === 'patient_name, patient_number') q.__identityCheck = true; return q; },
      order: chain, limit: chain, ilike: chain,
      update: (row: Record<string, unknown>) => ('id' in row ? (q.upsert as (row: Record<string, unknown>) => typeof q)(row) : q),
      delete: () => { q.__delete = true; return q; },
      eq: (col: string, v: string) => { if (col === 'id') singleId = v; if (col === 'updated_at') { q.__guard = v; db.guardVersions.push(v); } return q; },
      gt: (_col: string, value: string) => { q.__newerThan = value; return q; },
      maybeSingle: async () => {
        if (typeof q.__newerThan === 'string') {
          if (db.readGate) await db.readGate;
          return {
            data: Date.parse(db.readAt) > Date.parse(q.__newerThan)
              ? { id: singleId, data: snap({}), updated_at: db.readAt }
              : null,
            error: null,
          };
        }
        if (q.__upsert && db.gate && (!db.gateId || q.__upsertId === db.gateId)) await db.gate;
        if (q.__remoteSnapshot && db.remoteSnapshot) return { data: { data: db.remoteSnapshot, updated_at: '2026-11-12T10:00:00Z' }, error: null };
        if ((q.__guard && db.rejectGuardedWrite) || (q.__ignoreDuplicates && db.ignoreInitialInsert)) return { data: null, error: null };
        if (q.__netFail) return { data: null, error: { message: 'Failed to fetch' } };
        if (q.__refused) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
        if (q.__identityCheck) return { data: db.identities[singleId] ?? null, error: db.identityReadFails ? { message: 'Failed to fetch' } : null };
        if (q.__upsert) {
          const row = q.__row as Record<string, string>;
          db.identities[row.id] = { patient_name: row.patient_name, patient_number: row.patient_number };
        }
        if (q.__existCheck && !db.rowVisible) return { data: null, error: null };
        return { data: { id: 'x', updated_at: '2026-11-12T10:00:00Z' }, error: null };
      },
      single: async () => { db.opened.push(singleId); return { data: { id: singleId, data: snap({}), updated_at: db.readAt }, error: null }; },
      upsert: (row: Record<string, unknown>, options?: { ignoreDuplicates?: boolean }) => {
        q.__ignoreDuplicates = options?.ignoreDuplicates;
        db.upserts.push(row);
        q.__upsert = true;
        q.__row = row;
        q.__upsertId = row.id;
        if (db.refuseUpserts > 0) { db.refuseUpserts--; q.__refused = true; }
        else if (db.failUpserts > 0) { db.failUpserts--; q.__netFail = true; }
        return q;
      },
      then: (resolve: (v: unknown) => void) => {
        const go = () => resolve({ data: q.__delete ? db.deletedRows : db.visits, error: null });
        if (q.__upsert && db.gate && (!db.gateId || q.__upsertId === db.gateId)) void db.gate.then(go);
        else go();
      },
    });
    return q;
  };
  return {
    cloudEnabled: true,
    supabase: { from: builder, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) } },
  };
});

const reserveNumber = vi.hoisted(() => vi.fn(async () => '1001'));
vi.mock('../utils/patientNumberAllocation', () => ({ reservePatientNumber: reserveNumber }));
const removeAttachments = vi.hoisted(() => vi.fn(async (_client: unknown, _chartId: string) => {}));
vi.mock('../utils/chartAttachments', () => ({ removeChartAttachments: removeAttachments }));

const confirm = vi.hoisted(() => vi.fn(async () => false));
const choose = vi.hoisted(() => vi.fn(async (): Promise<string | null> => 'keep'));
vi.mock('../components/ui/dialogs', () => ({ confirmDialog: confirm, chooseDialog: choose, toast: vi.fn(), friendlyError: (e: unknown) => String(e) }));

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
import { useChartState } from './useChartState';
import { useAnimalTabs } from './useAnimalTabs';

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
  reserveNumber.mockReset(); reserveNumber.mockResolvedValue('1001');
  store.clear();
  db.identities = {}; db.identityReadFails = false;
  db.visits = []; db.upserts = []; db.opened = []; db.refuseUpserts = 0; db.rowVisible = true; db.failUpserts = 0; db.gate = null; db.gateId = ''; db.deletedRows = [{ id: 'x' }];
  db.readAt = '2026-11-12T09:00:00Z'; db.readGate = null; db.guardVersions = []; db.rejectGuardedWrite = false; db.ignoreInitialInsert = false; db.remoteSnapshot = undefined;
  confirm.mockReset(); confirm.mockResolvedValue(false);
  choose.mockReset(); choose.mockResolvedValue('keep');
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1500); }); };

it('refreshes a clean open chart only when the cloud has a newer version', async () => {
  const chart = fakeChart(snap({}));
  const { result } = renderHook(() => useCloudSync(chart));
  await act(async () => { await result.current.openChart('chart-1', { skipConfirm: true }); });
  const apply = vi.mocked(chart.applySnapshot);
  apply.mockClear();
  await act(async () => { await result.current.refreshOpenChart(); });
  expect(apply).not.toHaveBeenCalled();
  db.readAt = '2026-11-12T10:00:00Z';
  await act(async () => { await result.current.refreshOpenChart(); });
  expect(apply).toHaveBeenCalledWith(expect.anything(), 'chart-1', { preserveSession: true });
  expect(result.current.lastSavedAt).toBe(db.readAt);
  expect(result.current.dirty).toBe(false);
});

it('preserves local changes when another device wins the versioned write', async () => {
  const chart = fakeChart(snap({ exam: true }));
  store.set('vibing-dental.chart.lastSaved.v1', JSON.stringify({
    chartId: chart.cloudChartId, at: '2026-11-12T10:00:00Z',
  }));
  db.rejectGuardedWrite = true;
  const { result } = renderHook(() => useCloudSync(chart));
  await act(async () => { await expect(result.current.saveNow()).rejects.toThrow(); });
  expect(db.guardVersions).toEqual(['2026-11-12T10:00:00Z']);
  expect(result.current.dirty).toBe(true);
  expect(result.current.status).toBe('error');
});

it('saves independent edits from two devices against the newer server version', async () => {
  const base = snap({});
  const ours = { ...base, patientInfo: { ...base.patientInfo, ownerPhone: '555' } };
  db.remoteSnapshot = { ...base, patientInfo: { ...base.patientInfo, treatmentReport: 'Phone dictation' } };
  const chart = fakeChart(ours);
  store.set('vibing-dental.chart.lastSaved.v1', JSON.stringify({
    chartId: chart.cloudChartId, at: '2026-11-12T09:00:00Z', snapshot: base,
  }));
  const { result } = renderHook(() => useCloudSync(chart));
  await flush();
  expect(db.guardVersions).toContain('2026-11-12T10:00:00Z');
  expect(db.upserts[0]?.data).toMatchObject({ patientInfo: { ownerPhone: '555', treatmentReport: 'Phone dictation' } });
  expect(chart.applySnapshot).toHaveBeenCalledWith(db.upserts[0]?.data, chart.cloudChartId, { preserveSession: true });
  expect(result.current.status).toBe('saved');
  expect(confirm).not.toHaveBeenCalled();
});

it('preserves local edits made while a foreground refresh is pending', async () => {
  const chart = fakeChart(snap({}));
  const { result, rerender } = renderHook(({ current }) => useCloudSync(current), { initialProps: { current: chart } });
  await act(async () => { await result.current.openChart('chart-1', { skipConfirm: true }); });
  const apply = vi.mocked(chart.applySnapshot);
  apply.mockClear();
  db.readAt = '2026-11-12T10:00:00Z';
  let release!: () => void;
  db.readGate = new Promise<void>(resolve => { release = resolve; });
  const refresh = result.current.refreshOpenChart();
  rerender({ current: { ...chart, getSnapshot: () => snap({ exam: true }) } });
  await act(async () => { release(); await refresh; });
  expect(apply).not.toHaveBeenCalled();
  expect(result.current.dirty).toBe(true);
});

describe('hasClinicalContent', () => {
  it('ignores patient and owner details; counts charting', () => {
    expect(hasClinicalContent(snap({}))).toBe(false);
    expect(hasClinicalContent(snap({ exam: true }))).toBe(true);
  });

  it('counts an imaging report or planned extraction as clinical charting', () => {
    const snapshot = snap({});
    expect(hasClinicalContent({ ...snapshot, patientInfo: { ...snapshot.patientInfo, ctReport: 'Fracture' } })).toBe(true);
    expect(hasClinicalContent({ ...snapshot, plannedExtractions: [108] })).toBe(true);
  });

  it('ignores teeth carried forward as missing (a new visit nobody has charted yet)', () => {
    const carried = { ...snap({}), preMarks: { 305: 'missing', 405: 'missing' } } as unknown as ChartSnapshot;
    expect(hasClinicalContent(carried)).toBe(false);
    const examined = { ...snap({ exam: true }), preMarks: { 305: 'missing' } } as unknown as ChartSnapshot;
    expect(hasClinicalContent(examined)).toBe(true);
    const extracted = { ...snap({}), preMarks: { 305: 'missing' }, postMarks: { 108: 'extracted' } } as unknown as ChartSnapshot;
    expect(hasClinicalContent(extracted)).toBe(true);
  });
});

describe('autosave of new charts', () => {
  it('uploads named patient and owner details before clinical charting starts', async () => {
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({}))));
    expect(result.current.preclinical).toBe(true);
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(result.current.preclinical).toBe(true);
    expect(result.current.dirty).toBe(false);
  });

  it('recovers a successful first upload when its original response was lost', async () => {
    const snapshot = snap({});
    db.remoteSnapshot = snapshot;
    db.ignoreInitialInsert = true;
    const { result } = renderHook(() => useCloudSync(fakeChart(snapshot)));
    await flush();
    expect(result.current.status).toBe('saved');
    expect(result.current.dirty).toBe(false);
    expect(db.upserts).toHaveLength(1);
  });

  it('keeps owner-only details local until the patient has a name', async () => {
    const snapshot = snap({ name: '' });
    const { rerender } = renderHook(({ current }) => useCloudSync(fakeChart(current)), { initialProps: { current: snapshot } });
    await flush();
    expect(db.upserts).toHaveLength(0);
    rerender({ current: { ...snapshot, patientInfo: { ...snapshot.patientInfo, patientName: 'Fluffy' } } });
    await flush();
    expect(db.upserts).toHaveLength(1);
  });

  it('flushes a pending named draft when switching charts before the timer fires', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({}))));
    await act(async () => {
      const draft = await result.current.captureWorkspace!({ flush: true });
      expect(draft.lastSaved.chartId).toBe(draft.id);
    });
    expect(db.upserts).toHaveLength(1);
  });

  it('saves an eligible draft before leaving the chart without asking to discard it', async () => {
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({}))));
    await act(async () => { expect(await result.current.confirmDiscardIfDirty('openOther')).toBe(true); });
    expect(db.upserts).toHaveLength(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('autosaves clinical content too', async () => {
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    expect(result.current.preclinical).toBe(false);
    await flush();
    expect(db.upserts).toHaveLength(1);
  });
});

describe('retry when the connection comes back', () => {
  it('a failed autosave is re-attempted when the online event fires', async () => {
    db.failUpserts = 1;
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(result.current.status).toBe('error');

    // No further attempts on their own…
    await flush();
    expect(db.upserts).toHaveLength(1);

    // …but the connection coming back retries the save.
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await flush();
    expect(db.upserts).toHaveLength(2);
    expect(result.current.status).toBe('saved');
  });

  it('offline then online also saves (existing behaviour)', async () => {
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    await flush();
    expect(db.upserts).toHaveLength(0);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(result.current.status).toBe('saved');
  });
});

describe('same-day duplicate guard', () => {
  const sameDay = { id: 'older', chart_date: '2026-11-12', species: 'canine', patient_name: 'Fluffy', patient_number: '' };

  it('asks once before the first save, and "Keep both" saves', async () => {
    db.visits = [sameDay];
    renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(db.upserts).toHaveLength(1);
  });

  it('"Open existing visit" opens it instead of saving a duplicate', async () => {
    db.visits = [sameDay];
    choose.mockResolvedValue('open');
    renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(db.upserts).toHaveLength(0);
    expect(db.opened).toEqual(['older']);
  });

  it('dismissing the question saves nothing, and the next save asks again', async () => {
    db.visits = [sameDay];
    choose.mockResolvedValue(null);
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(db.upserts).toHaveLength(0);

    choose.mockResolvedValue('keep');
    await act(async () => { await result.current.saveNow(); });
    expect(choose).toHaveBeenCalledTimes(2);
    expect(db.upserts).toHaveLength(1);
  });

  it("doesn't ask for a different visit date", async () => {
    db.visits = [{ ...sameDay, chart_date: '2026-11-01' }];
    renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await flush();
    expect(choose).not.toHaveBeenCalled();
    expect(db.upserts).toHaveLength(1);
  });

  it('skips the question when it was already answered (new visit)', async () => {
    db.visits = [sameDay];
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({}))));
    act(() => result.current.skipDuplicateCheckFor('chart-1'));
    await act(async () => { await result.current.saveNow(); });
    expect(choose).not.toHaveBeenCalled();
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

  it('a forked save is recorded as saved (no second save, no repeat duplicate question)', async () => {
    db.refuseUpserts = 1;
    db.rowVisible = false;
    const s = snap({ exam: true });
    const chart = { ...fakeChart(s, 'chart-1'), getSnapshot: () => s } as unknown as Parameters<typeof useCloudSync>[0] & { cloudChartId: string };
    chart.resetCloudChartId = () => { chart.cloudChartId = 'forked'; return 'forked'; };
    // The forked save is still in flight when the app re-renders with the
    // new id (as on a real network).
    let release!: () => void;
    db.gate = new Promise<void>((r) => { release = r; });
    db.gateId = 'forked';
    const { result, rerender } = renderHook(() => useCloudSync(chart));
    await flush();
    expect(db.upserts.map((r) => r.id)).toEqual(['chart-1', 'forked']);
    rerender();
    await act(async () => { release(); await Promise.resolve(); });
    await flush();
    expect(db.upserts).toHaveLength(2); // no redundant re-save of the fork
    expect(result.current.dirty).toBe(false);
    expect(result.current.lastSavedAt).not.toBe('');
  });
});

describe('which practice a chart belongs to', () => {
  it('only a chart’s first save sets its practice; later saves never move it', async () => {
    let s = snap({ exam: true });
    const { result, rerender } = renderHook(() => useCloudSync(fakeChart(s), true, 'practice-a'));
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].practice_id).toBe('practice-a');

    s = { ...snap({ exam: true }), patientInfo: { ...snap({ exam: true }).patientInfo, treatmentReport: 'more' } } as ChartSnapshot;
    rerender();
    await act(async () => { await result.current.saveNow(); });
    expect(db.upserts).toHaveLength(2);
    expect('practice_id' in db.upserts[1]).toBe(false);
  });

  it('a saved chart opened from My charts keeps its practice when saved', async () => {
    const chart = { ...fakeChart(snap({ exam: true })), openedExisting: true } as unknown as Parameters<typeof useCloudSync>[0];
    const { result } = renderHook(() => useCloudSync(chart, true, 'practice-b', true));
    await act(async () => { await result.current.saveNow(); });
    expect(db.upserts).toHaveLength(1);
    expect('practice_id' in db.upserts[0]).toBe(false);
  });

  it('with the practice unknown, an existing chart still saves (practice untouched); a new chart is not saved as practice-less', async () => {
    const opened = { ...fakeChart(snap({ exam: true }), 'open-1'), openedExisting: true } as unknown as Parameters<typeof useCloudSync>[0];
    const a = renderHook(() => useCloudSync(opened, true, '', true, false));
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect('practice_id' in db.upserts[0]).toBe(false);
    a.unmount();
    db.upserts = [];

    const b = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }), 'new-1'), true, '', false, false));
    await act(async () => { await b.result.current.saveNow().catch(() => {}); });
    expect(db.upserts).toHaveLength(0);
    expect(b.result.current.status).toBe('error');
  });

  it('autosave waits until the profile (and so the practice) has loaded', async () => {
    let ready = false;
    const { rerender } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true })), true, ready ? 'practice-a' : '', false, ready));
    await flush();
    expect(db.upserts).toHaveLength(0);
    ready = true;
    rerender();
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].practice_id).toBe('practice-a');
  });
});

describe('deleting the chart that is open', () => {
  it('does not re-create it by autosave; a later edit saves it as a new chart', async () => {
    let s = snap({ exam: true });
    const chart = {
      ...fakeChart(s, 'open-1'),
      getSnapshot: () => s,
      resetCloudChartId: () => { chart.cloudChartId = 'fresh-1'; return 'fresh-1'; },
    } as unknown as Parameters<typeof useCloudSync>[0] & { cloudChartId: string };
    const { result, rerender, unmount } = renderHook(() => useCloudSync(chart));
    await flush();
    expect(db.upserts).toHaveLength(1); // saved once, as normal
    db.upserts = [];

    await act(async () => { await result.current.deleteChart('open-1'); });
    rerender();
    await flush();
    expect(db.upserts).toHaveLength(0);

    // Nor after a reload (state comes back from storage).
    unmount();
    const reloaded = renderHook(() => useCloudSync(chart));
    await flush();
    expect(db.upserts).toHaveLength(0);
    expect(reloaded.result.current.dirty).toBe(false);

    s = { ...s, patientInfo: { ...s.patientInfo, treatmentReport: 'kept working' } } as ChartSnapshot;
    reloaded.rerender();
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].id).toBe('fresh-1');
  });
});

describe('a save that finishes after another chart was opened', () => {
  it('is not credited to the chart now on screen', async () => {
    let s = snap({ exam: true });
    const chart = { ...fakeChart(s, 'chart-a'), getSnapshot: () => s } as unknown as Parameters<typeof useCloudSync>[0] & { cloudChartId: string };
    const { result, rerender } = renderHook(() => useCloudSync(chart));
    // Save of chart A starts; before it resolves, a new visit replaces it.
    let release!: () => void;
    db.gate = new Promise<void>((r) => { release = r; });
    let savePromise!: Promise<void>;
    await act(async () => { savePromise = result.current.saveNow(); await Promise.resolve(); });
    expect(db.upserts).toHaveLength(1); // in flight
    chart.cloudChartId = 'new-visit';
    s = snap({ name: 'Fluffy' });
    rerender();
    await act(async () => { release(); await savePromise; });
    expect(result.current.lastSavedAt).toBe(''); // the new visit has never been saved
    expect(result.current.dirty).toBe(true);
  });
});

describe('clearing the recheck on the chart that is open', () => {
  it('is our own change: the next save of that chart is not a conflict', async () => {
    const chart = { ...fakeChart(snap({ exam: true }), 'open-1'), openedExisting: true } as unknown as Parameters<typeof useCloudSync>[0];
    // Opened and saved earlier at 09:00 (server time).
    store.set('vibing-dental.chart.lastSaved.v1', JSON.stringify({ chartId: 'open-1', at: '2026-11-12T09:00:00Z' }));
    const { result } = renderHook(() => useCloudSync(chart, true, '', true));
    // Clearing it on the server bumps updated_at to 10:00.
    await act(async () => { await result.current.clearRecalls(['open-1']); });
    await act(async () => { await result.current.saveNow(); });
    expect(confirm).not.toHaveBeenCalled(); // no "changed by someone else"
    expect(db.upserts).toHaveLength(1);
  });

  it('a teammate’s save before the clear is still caught at the next save', async () => {
    const chart = { ...fakeChart(snap({ exam: true }), 'open-1'), openedExisting: true } as unknown as Parameters<typeof useCloudSync>[0];
    // We know the 08:00 version; a teammate saved at 09:00 (what the clear reads).
    store.set('vibing-dental.chart.lastSaved.v1', JSON.stringify({ chartId: 'open-1', at: '2026-11-12T08:00:00Z' }));
    const { result } = renderHook(() => useCloudSync(chart, true, '', true));
    await act(async () => { await result.current.clearRecalls(['open-1']); });
    await act(async () => { await result.current.saveNow().catch(() => {}); });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});

describe('restoring an earlier version', () => {
  it('stamps the save as a restore, so history keeps the version it replaces', async () => {
    const chart = { ...fakeChart(snap({ exam: true }), 'open-1'), openedExisting: true } as unknown as Parameters<typeof useCloudSync>[0];
    confirm.mockResolvedValue(true); // discard the unsaved edits on screen
    const { result } = renderHook(() => useCloudSync(chart, true, '', true));
    await act(async () => { await result.current.restoreRevision('open-1', snap({ name: 'Older' })); });
    expect(db.upserts).toHaveLength(1);
    expect(typeof db.upserts[0].restored_at).toBe('string');
  });

  it('ordinary saves are not stamped', async () => {
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    await act(async () => { await result.current.saveNow(); });
    expect('restored_at' in db.upserts[0]).toBe(false);
  });
});

describe('two tabs', () => {
  it('when the chart state rewrites the working copy, the save bookkeeping is rewritten too', async () => {
    store.set('vibing-dental.chart.lastSaved.v1', JSON.stringify({ chartId: 'chart-1', at: '2026-11-12T09:00:00Z' }));
    renderHook(() => useCloudSync(fakeChart(snap({ exam: true }))));
    store.set('vibing-dental.chart.lastSaved.v1', JSON.stringify({ chartId: 'other-tab', at: 'x' }));
    act(() => { window.dispatchEvent(new Event('vibing-dental:chart-storage-rewrite')); });
    expect(JSON.parse(store.get('vibing-dental.chart.lastSaved.v1')!).chartId).toBe('chart-1');
  });
});

describe('opening a chart identical to the one on screen', () => {
  it('the next edit is still unsaved (the "saved baseline" flag does not stay armed)', async () => {
    let s = snap({ exam: true });
    const chart = { ...fakeChart(s, 'c-1'), getSnapshot: () => s } as unknown as Parameters<typeof useCloudSync>[0];
    const { result, rerender } = renderHook(() => useCloudSync(chart));
    // applySnapshot is a no-op here: the opened content equals what's shown.
    await act(async () => { await result.current.openChart('c-1', { skipConfirm: true }); });
    expect(result.current.dirty).toBe(false);

    s = { ...s, patientInfo: { ...s.patientInfo, treatmentReport: 'new finding' } } as ChartSnapshot;
    rerender();
    expect(result.current.dirty).toBe(true);
  });
});

describe('a restore that fails', () => {
  it('leaves edit-conflict checks on for later saves', async () => {
    const chart = { ...fakeChart(snap({ exam: true }), 'open-1'), openedExisting: true } as unknown as Parameters<typeof useCloudSync>[0];
    store.set('vibing-dental.chart.lastSaved.v1', JSON.stringify({ chartId: 'open-1', at: '2026-11-12T09:00:00Z' }));
    confirm.mockResolvedValue(true);
    db.failUpserts = 1;
    const { result } = renderHook(() => useCloudSync(chart, true, '', true));
    await act(async () => { await result.current.restoreRevision('open-1', snap({ name: 'Older' })).catch(() => {}); });
    // A teammate saved at 10:00; our next save must ask, not overwrite.
    confirm.mockReset(); confirm.mockResolvedValue(false);
    await act(async () => { await result.current.saveNow().catch(() => {}); });
    expect(confirm).toHaveBeenCalledTimes(1);
  });
});

describe('the "already answered" skip for a new visit', () => {
  const sameDay = { id: 'older', chart_date: '2026-11-12', species: 'canine', patient_name: 'Fluffy', patient_number: '' };
  it('applies only to the chart it was for, not to the next unrelated chart', async () => {
    db.visits = [sameDay];
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }), 'pdf-import')));
    act(() => result.current.skipDuplicateCheckFor('abandoned-visit'));
    await flush();
    expect(choose).toHaveBeenCalledTimes(1); // still asked
  });
});

describe('deleting a chart', () => {
  it('also removes its images, after the chart row is gone', async () => {
    removeAttachments.mockClear();
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }), 'open-1')));
    await act(async () => { await result.current.deleteChart('other-chart'); });
    expect(removeAttachments).toHaveBeenCalledWith(expect.anything(), 'other-chart');
  });

  it('a delete row security refused (nothing deleted) fails, and leaves the images alone', async () => {
    removeAttachments.mockClear();
    db.deletedRows = [];
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }), 'open-1')));
    await expect(result.current.deleteChart('other-chart')).rejects.toThrow('permission to delete');
    expect(removeAttachments).not.toHaveBeenCalled();
  });

  it('a failed image cleanup does not fail the delete', async () => {
    removeAttachments.mockRejectedValueOnce(new Error('storage down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true }), 'open-1')));
    await expect(act(async () => { await result.current.deleteChart('other-chart'); })).resolves.not.toThrow();
    spy.mockRestore();
  });
});


describe('saved patient identity guard', () => {
  const original = { patient_name: 'Luffy', patient_number: 'SP0001' };
  const patient = (name = 'Novmi', number = 'SP9111') => {
    const s = snap({ name, exam: true });
    s.patientInfo.patientNumber = number;
    return s;
  };
  beforeEach(() => { db.identities['chart-1'] = { ...original }; });

  it('blocks the production rename even when reloaded as a working chart', async () => {
    const { result } = renderHook(() => useCloudSync(fakeChart(patient())));
    await flush();
    expect(db.upserts).toHaveLength(0);
    expect(choose).toHaveBeenCalledWith(expect.objectContaining({ title: 'Are these details for the same patient?' }));
    expect(result.current.dirty).toBe(true);
    expect(result.current.saveError).toContain('Patient details');
    expect(db.identities['chart-1']).toEqual(original);
  });

  it('only an explicit correction saves; later clinical edits do not ask again', async () => {
    choose.mockResolvedValue('correct');
    let s = patient();
    const { rerender } = renderHook(() => useCloudSync(fakeChart(s)));
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(db.identities['chart-1'].patient_name).toBe('Novmi');
    s = { ...s, patientInfo: { ...s.patientInfo, treatmentReport: 'more work' } };
    rerender();
    await flush();
    expect(db.upserts).toHaveLength(2);
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it('dismissal pauses autosave for the same change but explicit Save asks again', async () => {
    choose.mockResolvedValue(null);
    let s = patient();
    const { result, rerender } = renderHook(() => useCloudSync(fakeChart(s)));
    await flush();
    s = { ...s, patientInfo: { ...s.patientInfo, treatmentReport: 'more work' } };
    rerender();
    await flush();
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await flush();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(db.upserts).toHaveLength(0);
    choose.mockResolvedValue('correct');
    await act(async () => { await result.current.saveNow(); });
    expect(choose).toHaveBeenCalledTimes(2);
    expect(db.upserts).toHaveLength(1);
  });

  it.each([['LUFFY ', ' sp0001 '], ['Luffy', 'SP0001']])('allows normalized identity %s / %s', async (name, number) => {
    renderHook(() => useCloudSync(fakeChart(patient(name, number))));
    await flush();
    expect(choose).not.toHaveBeenCalled();
    expect(db.upserts).toHaveLength(1);
  });

  it('allows filling a previously blank identifier', async () => {
    db.identities['chart-1'].patient_number = '';
    renderHook(() => useCloudSync(fakeChart(patient('Luffy', 'SP0001'))));
    await flush();
    expect(choose).not.toHaveBeenCalled();
    expect(db.upserts).toHaveLength(1);
  });

  it('requires approval for removing an established number', async () => {
    renderHook(() => useCloudSync(fakeChart(patient('Luffy', ''))));
    await flush();
    expect(db.upserts).toHaveLength(0);
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it('resumes saving when the user returns to the saved identity', async () => {
    let s = patient();
    const { rerender } = renderHook(() => useCloudSync(fakeChart(s)));
    await flush();
    s = patient('Luffy', 'SP0001');
    rerender();
    await flush();
    expect(db.upserts).toHaveLength(1);
    expect(choose).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the saved identity cannot be read', async () => {
    db.identityReadFails = true;
    const { result } = renderHook(() => useCloudSync(fakeChart(patient())));
    await flush();
    expect(db.upserts).toHaveLength(0);
    expect(result.current.status).toBe('error');
  });

  it.each(['chart', 'identity'])('does not use approval after the %s changes during the question', async (change) => {
    let resolve!: (answer: string) => void;
    choose.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    let s = patient();
    let id = 'chart-1';
    const { result, rerender } = renderHook(() => useCloudSync(fakeChart(s, id)));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.saveNow().catch(() => {}); });
    expect(choose).toHaveBeenCalledTimes(1);
    if (change === 'chart') id = 'chart-2';
    else s = patient('Someone else', 'SP2222');
    rerender();
    await act(async () => { resolve('correct'); await pending; });
    expect(db.upserts).toHaveLength(0);
  });

  it('rejects approval if the saved identity changed while the dialog was open', async () => {
    let resolve!: (answer: string) => void;
    choose.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useCloudSync(fakeChart(patient())));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.saveNow().catch(() => {}); });
    db.identities['chart-1'] = { patient_name: 'Milo', patient_number: 'SP0002' };
    await act(async () => { resolve('correct'); await pending; });
    expect(db.upserts).toHaveLength(0);
    expect(db.identities['chart-1'].patient_name).toBe('Milo');
  });

  it('saves clinical edits made while approval was pending, even after their autosave tick', async () => {
    let resolve!: (answer: string) => void;
    choose.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    let s = patient();
    store.set('vibing-dental.chart.lastSaved.v1', JSON.stringify({ chartId: 'chart-1', at: '2026-11-12T10:00:00Z' }));
    const { result, rerender } = renderHook(() => useCloudSync({ ...fakeChart(s), openedExisting: true }, true, '', true));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.saveNow(); });
    s = { ...s, patientInfo: { ...s.patientInfo, treatmentReport: 'New clinical notes' } };
    rerender();
    await flush();
    await act(async () => { resolve('correct'); await pending; });
    expect((db.upserts[0].data as ChartSnapshot).patientInfo.treatmentReport).toBe('New clinical notes');
    expect(result.current.dirty).toBe(false);
  });

  it('does not write while a confirmation is pending', async () => {
    let resolve!: (answer: string | null) => void;
    choose.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useCloudSync(fakeChart(patient())));
    let pending!: Promise<void>;
    await act(async () => { pending = result.current.saveNow().catch(() => {}); });
    await flush();
    await act(async () => { await result.current.saveNow(); });
    expect(db.upserts).toHaveLength(0);
    expect(choose).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(null); await pending; });
  });
});

describe('tab workspace snapshots', () => {
  it('restores separate unsaved charts and their dirty state without saving', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => { const chart = useChartState(); return { chart, cloud: useCloudSync(chart) }; });
    act(() => { result.current.chart.handlePatientInfoChange('patientName', 'Luna'); result.current.chart.handlePatientInfoChange('complaint', 'Luna draft'); });
    const luna = await result.current.cloud.captureWorkspace!();
    act(() => { result.current.chart.startNewVisit({ identity: { patientName: 'Oliver', patientNumber: '2', ownerName: '', ownerPhone: '', ownerEmail: '', species: 'feline' }, goneTeeth: [] }); });
    act(() => result.current.chart.handlePatientInfoChange('complaint', 'Oliver draft'));
    const oliver = await result.current.cloud.captureWorkspace!();
    act(() => result.current.cloud.restoreWorkspace!(luna));
    expect(result.current.chart.patientInfo.complaint).toBe('Luna draft');
    expect(result.current.cloud.dirty).toBe(true);
    act(() => result.current.cloud.restoreWorkspace!(oliver));
    expect(result.current.chart.patientInfo.complaint).toBe('Oliver draft');
    expect(result.current.cloud.dirty).toBe(true);
    expect(db.upserts).toHaveLength(0);
  });
  it('restores a saved baseline without treating the next edit as already saved', async () => {
    vi.useRealTimers();
    const { result } = renderHook(() => { const chart = useChartState(); return { chart, cloud: useCloudSync(chart) }; });
    act(() => result.current.chart.handlePatientInfoChange('patientName', 'Luna'));
    await act(async () => { await result.current.cloud.saveNow(); });
    const luna = await result.current.cloud.captureWorkspace!();
    act(() => result.current.chart.startNewVisit());
    act(() => result.current.cloud.restoreWorkspace!(luna));
    expect(result.current.cloud.dirty).toBe(false);
    act(() => result.current.chart.handlePatientInfoChange('complaint', 'New finding'));
    expect(result.current.cloud.dirty).toBe(true);
  });
});

it('switches unsaved animals and dates through the tab controller without forcing a save', async () => {
  vi.useRealTimers();
  const { result } = renderHook(() => {
    const chart = useChartState(); const cloud = useCloudSync(chart, true, '', false, true, false);
    return { chart, cloud, tabs: useAnimalTabs(chart, cloud, true) };
  });
  act(() => { result.current.chart.handlePatientInfoChange('patientName', 'Luna'); result.current.chart.handlePatientInfoChange('complaint', 'First visit draft'); });
  const firstId = result.current.chart.cloudChartId;
  await act(async () => { expect(await result.current.tabs.prepareLeave()).toBe(true); });
  act(() => result.current.chart.startNewVisit());
  act(() => result.current.chart.handlePatientInfoChange('complaint', 'Second visit draft'));
  const secondId = result.current.chart.cloudChartId;
  await act(async () => { expect(await result.current.tabs.openChart(firstId)).toBe(true); });
  expect(result.current.chart.patientInfo.complaint).toBe('First visit draft');
  expect(result.current.tabs.tabs).toHaveLength(1);
  await act(async () => { expect(await result.current.tabs.openChart(secondId)).toBe(true); });
  expect(result.current.chart.patientInfo.complaint).toBe('Second visit draft');
  expect(db.upserts).toHaveLength(0);
});

it('syncs a locally parked draft after restarting on a different chart', async () => {
  vi.useRealTimers();
  store.set('vibing-dental.chart.owner.v1', JSON.stringify('u1'));
  const mount = () => renderHook(() => {
    const chart = useChartState();
    const cloud = useCloudSync(chart);
    return { chart, cloud, tabs: useAnimalTabs(chart, cloud, true) };
  });
  const offline = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  try {
    const first = mount();
    act(() => first.result.current.chart.handlePatientInfoChange('patientName', 'Drafted offline'));
    const id = first.result.current.chart.cloudChartId;
    await act(async () => { expect(await first.result.current.tabs.prepareLeave()).toBe(true); });
    act(() => first.result.current.chart.startNewVisit());
    first.unmount();
    const second = mount();
    expect(second.result.current.chart.cloudChartId).not.toBe(id);
    expect(db.upserts).toHaveLength(0);
    offline.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(db.upserts).toEqual([expect.objectContaining({ id, patient_name: 'Drafted offline' })]));
    expect(second.result.current.chart.cloudChartId).not.toBe(id);
  } finally {
    offline.mockRestore();
  }
});

it('keeps manual saving available while autosave is disabled and resumes when enabled', async () => {
  const chart = fakeChart(snap({ exam: true }));
  const { result, rerender } = renderHook(({ enabled }) => useCloudSync(chart, true, '', false, true, enabled), { initialProps: { enabled: false } });
  await flush();
  expect(db.upserts).toHaveLength(0);
  await act(async () => { await result.current.saveNow(); });
  expect(db.upserts).toHaveLength(1);
  rerender({ enabled: true });
  await flush();
  expect(db.upserts).toHaveLength(1);
});
it('cancels a pending autosave when the preference is turned off', async () => {
  const chart = fakeChart(snap({ exam: true }));
  const { rerender } = renderHook(({ enabled }) => useCloudSync(chart, true, '', false, true, enabled), { initialProps: { enabled: true } });
  rerender({ enabled: false });
  await flush();
  expect(db.upserts).toHaveLength(0);
  rerender({ enabled: true });
  await flush();
  expect(db.upserts).toHaveLength(1);
});

it('does not treat an automatically numbered blank patient as unsaved clinical work', async () => {
  const snapshot = snap({});
  snapshot.patientInfo = { ...snapshot.patientInfo, patientName: '', ownerName: '', ...createPatientIdentity() };
  const { result } = renderHook(() => useCloudSync(fakeChart(snapshot)));
  expect(result.current.dirty).toBe(false);
  await flush();
  expect(db.upserts).toHaveLength(0);
});

it('reserves a short patient number before saving a new patient', async () => {
  const snapshot = snap({ exam: true });
  snapshot.patientInfo = { ...snapshot.patientInfo, ...createPatientIdentity() };
  const { result } = renderHook(() => {
    const [info, setPatientInfo] = useState(snapshot.patientInfo);
    const sync = useCloudSync({ ...fakeChart({ ...snapshot, patientInfo: info }), setPatientInfo }, true, 'practice', false, true, false);
    return { info, sync };
  });
  await flush();
  expect(result.current.info.patientNumber).toBe('1001');
  expect(result.current.info.generatedPatientNumber).toBe('1001');
  await act(async () => { await result.current.sync.saveNow(); });
  expect(db.upserts.at(-1)).toMatchObject({ patient_number: '1001' });
});

it('allows explicit Save after autosave is paused for a close confirmation', async () => {
  vi.useRealTimers();
  const { result } = renderHook(() => useCloudSync(fakeChart(snap({ exam: true })), true, '', false, true, false));
  await act(async () => { await result.current.captureWorkspace!(); });
  await act(async () => { await result.current.saveNow(); });
  expect(db.upserts).toHaveLength(1);
});
it('does not save a patient without a number when reservation fails', async () => {
  reserveNumber.mockRejectedValue(new Error('offline'));
  const snapshot = snap({ exam: true });
  snapshot.patientInfo = { ...snapshot.patientInfo, ...createPatientIdentity() };
  const { result } = renderHook(() => useCloudSync(fakeChart(snapshot), true, '', false, true, false));
  await act(async () => { await expect(result.current.saveNow()).rejects.toThrow(); });
  expect(db.upserts).toHaveLength(0);
});
it('ignores a delayed number reservation after switching to another chart', async () => {
  let resolve!: (number: string) => void;
  reserveNumber.mockImplementation(() => new Promise(done => { resolve = done; }));
  const snapshot = snap({ exam: true });
  snapshot.patientInfo = { ...snapshot.patientInfo, ...createPatientIdentity() };
  const setter = vi.fn();
  const { rerender } = renderHook(({ chart }) => useCloudSync(chart, true, '', false, true, false), {
    initialProps: { chart: { ...fakeChart(snapshot, 'first'), setPatientInfo: setter } },
  });
  rerender({ chart: { ...fakeChart(snap({ name: 'Other patient' }), 'second'), setPatientInfo: setter } });
  await act(async () => { resolve('1001'); });
  expect(setter).not.toHaveBeenCalled();
});

describe('explicit finalization saves', () => {
  function lifecycle() {
    const chart = useChartState();
    const cloud = useCloudSync(chart, true, 'practice-a', !chart.finalizedAt, true, false);
    return { chart, cloud };
  }
  it('atomically saves the current content and finalization, and persists reopening', async () => {
    const { result } = renderHook(lifecycle);
    act(() => result.current.chart.setPatientInfo(p => ({ ...p, patientName: 'Rex', patientNumber: '7', complaint: 'Fractured tooth' })));
    await act(async () => { expect(await result.current.cloud.setFinalized(true)).toBe(true); });
    const saved = db.upserts.at(-1)!.data as ChartSnapshot;
    expect(saved.patientInfo.complaint).toBe('Fractured tooth');
    expect(saved.finalizedAt).toBeTruthy();
    expect(result.current.chart.finalizedAt).toBe(saved.finalizedAt);
    expect(result.current.cloud.dirty).toBe(false);
    await act(async () => { expect(await result.current.cloud.setFinalized(false)).toBe(true); });
    expect((db.upserts.at(-1)!.data as ChartSnapshot).finalizedAt).toBeUndefined();
    expect(result.current.chart.finalizedAt).toBeNull();
    expect(result.current.cloud.dirty).toBe(false);
  });
  it('leaves the record editable if the finalization save fails', async () => {
    const { result } = renderHook(lifecycle);
    act(() => result.current.chart.setPatientInfo(p => ({ ...p, patientName: 'Rex', patientNumber: '7' })));
    db.failUpserts = 1;
    await act(async () => { await expect(result.current.cloud.setFinalized(true)).rejects.toBeDefined(); });
    expect(result.current.chart.finalizedAt).toBeNull();
    expect(result.current.cloud.status).toBe('error');
  });
  it('does not finalize a new record when the duplicate dialog is dismissed', async () => {
    const { result } = renderHook(lifecycle);
    act(() => result.current.chart.setPatientInfo(p => ({ ...p, patientName: 'Rex', patientNumber: '7' })));
    db.visits = [{ id: 'other', patient_name: 'Rex', patient_number: '7', species: 'canine', chart_date: result.current.chart.patientInfo.date }];
    choose.mockResolvedValueOnce(null);
    await act(async () => { expect(await result.current.cloud.setFinalized(true)).toBe(false); });
    expect(result.current.chart.finalizedAt).toBeNull();
    expect(db.upserts).toHaveLength(0);
  });
});


describe('finalization and workspace save races', () => {
  function lifecycle() {
    const chart = useChartState();
    const cloud = useCloudSync(chart, true, 'practice-a', !chart.finalizedAt, true, false);
    return { chart, cloud };
  }
  const nameRecord = (result: { current: ReturnType<typeof lifecycle> }) => {
    act(() => result.current.chart.setPatientInfo(p => ({ ...p, patientName: 'Rex', patientNumber: '7' })));
  };
  it('drains an in-flight save before writing the finalized record', async () => {
    const { result } = renderHook(lifecycle);
    nameRecord(result);
    let release!: () => void;
    db.gate = new Promise(resolve => { release = resolve; });
    let saving!: Promise<void>;
    await act(async () => { saving = result.current.cloud.saveNow(); });
    expect(db.upserts).toHaveLength(1);
    let finalizing!: Promise<boolean>;
    await act(async () => { finalizing = result.current.cloud.setFinalized(true); });
    expect(db.upserts).toHaveLength(1);
    await act(async () => { release(); await saving; await finalizing; });
    expect(db.upserts).toHaveLength(2);
    expect((db.upserts.at(-1)!.data as ChartSnapshot).finalizedAt).toBeTruthy();
    expect(result.current.chart.finalizedAt).toBeTruthy();
  });
  it('does not apply a completed finalization to another chart opened while it was saving', async () => {
    const { result } = renderHook(lifecycle);
    nameRecord(result);
    const next = { ...result.current.chart.getSnapshot(), patientInfo: { ...result.current.chart.patientInfo, patientName: 'Bella' } };
    let release!: () => void;
    db.gate = new Promise(resolve => { release = resolve; });
    let finalizing!: Promise<boolean>;
    await act(async () => { finalizing = result.current.cloud.setFinalized(true); });
    expect(db.upserts).toHaveLength(1);
    act(() => result.current.chart.applySnapshot(next, 'bella'));
    await act(async () => { release(); await finalizing; });
    expect(result.current.chart.patientInfo.patientName).toBe('Bella');
    expect(result.current.chart.finalizedAt).toBeNull();
  });
  it('waits for finalization before capturing the workspace for another animal tab', async () => {
    const { result } = renderHook(lifecycle);
    nameRecord(result);
    let release!: () => void;
    db.gate = new Promise(resolve => { release = resolve; });
    let finalizing!: Promise<boolean>;
    await act(async () => { finalizing = result.current.cloud.setFinalized(true); });
    expect(db.upserts).toHaveLength(1);
    let captured = false;
    let workspace!: Promise<import('./useCloudSync').ChartWorkspace>;
    await act(async () => {
      workspace = result.current.cloud.captureWorkspace!().then(value => { captured = true; return value; });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(captured).toBe(false);
    await act(async () => { release(); await finalizing; });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect((await workspace).snapshot.finalizedAt).toBeTruthy();
  });
});

it('does not finalize a different chart when a forked save completes', async () => {
  const { result } = renderHook(() => {
    const chart = useChartState();
    const cloud = useCloudSync(chart, true, 'practice-a', true, true, false);
    return { chart, cloud };
  });
  act(() => result.current.chart.setPatientInfo(p => ({ ...p, patientName: 'Rex', patientNumber: '7' })));
  const next = { ...result.current.chart.getSnapshot(), patientInfo: { ...result.current.chart.patientInfo, patientName: 'Bella' } };
  const forkId = '00000000-0000-4000-8000-000000000099';
  const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValue(forkId);
  let release!: () => void;
  db.refuseUpserts = 1;
  db.rowVisible = false;
  db.gateId = forkId;
  db.gate = new Promise(resolve => { release = resolve; });
  let finalizing!: Promise<boolean>;
  await act(async () => { finalizing = result.current.cloud.setFinalized(true); });
  expect(db.upserts).toHaveLength(2);
  act(() => result.current.chart.applySnapshot(next, 'bella'));
  await act(async () => { release(); await finalizing; });
  expect(result.current.chart.patientInfo.patientName).toBe('Bella');
  expect(result.current.chart.finalizedAt).toBeNull();
  uuid.mockRestore();
});

it('never autosaves a finalized record, including one originally created on this device', async () => {
  const { result } = renderHook(() => {
    const chart = useChartState();
    return { chart, cloud: useCloudSync(chart, true, 'practice-a', !chart.finalizedAt) };
  });
  act(() => {
    result.current.chart.setPatientInfo(p => ({ ...p, patientName: 'Rex', patientNumber: '7', exam: { ...p.exam, tongue: { status: 'normal', comment: '' } } }));
    result.current.chart.setFinalizedAt('2026-11-18T12:00:00Z');
  });
  await flush();
  expect(db.upserts).toHaveLength(0);
});
