import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// This test environment has no working localStorage (as in useCloudSync.autosave.test).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});
afterAll(() => vi.unstubAllGlobals());

import { useChartState } from './useChartState';

const ID_KEY = 'vibing-dental.chart.cloudId.v1';
const LAST_SAVED_KEY = 'vibing-dental.chart.lastSaved.v1';

beforeEach(() => store.clear());

// A chart started on an empty store (first use, "+ New patient", which
// clears storage and reloads, or after signing in) got a fresh id that was
// never written: every page load (Google sign-in redirect, a phone
// reloading a background tab) minted another, and the next save copied
// the chart into a duplicate record instead of updating it.
describe('the working chart keeps its cloud id across page loads', () => {
  it('a freshly generated id is persisted straight away', () => {
    const first = renderHook(() => useChartState());
    const id = first.result.current.cloudChartId;
    expect(JSON.parse(store.get(ID_KEY) ?? 'null')).toBe(id);
    first.unmount();

    const reloaded = renderHook(() => useChartState());
    expect(reloaded.result.current.cloudChartId).toBe(id);
  });

  it('with the id missing, the chart this browser last saved keeps its id (heals charts already orphaned)', () => {
    store.set(LAST_SAVED_KEY, JSON.stringify({ chartId: 'saved-chart', at: '2026-11-14T18:49:28Z' }));
    const { result } = renderHook(() => useChartState());
    expect(result.current.cloudChartId).toBe('saved-chart');
    expect(JSON.parse(store.get(ID_KEY) ?? 'null')).toBe('saved-chart');
  });

  it('a stored id wins over the last-saved record', () => {
    store.set(ID_KEY, JSON.stringify('open-chart'));
    store.set(LAST_SAVED_KEY, JSON.stringify({ chartId: 'other', at: '' }));
    const { result } = renderHook(() => useChartState());
    expect(result.current.cloudChartId).toBe('open-chart');
  });

  it('opening another chart still replaces the id', () => {
    const { result } = renderHook(() => useChartState());
    act(() => result.current.applySnapshot(result.current.getSnapshot(), 'opened'));
    expect(JSON.parse(store.get(ID_KEY) ?? 'null')).toBe('opened');
  });
});
