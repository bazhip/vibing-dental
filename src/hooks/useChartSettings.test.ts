import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useChartSettings } from './useChartSettings';
import { readJson, writeJson } from '../utils/storage';

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
beforeEach(() => store.clear());

describe('useChartSettings', () => {
  it("starts from this browser's existing choices, so nobody's setup changes", () => {
    writeJson('charting.mirrorToDiagnosis', 1, true);
    writeJson('charting.view', 1, 'tooth');
    const { result } = renderHook(() => useChartSettings(true));
    expect(result.current.prefs).toMatchObject({ mirrorToDiagnosis: true, chartingView: 'tooth', pocketMode: 'tooth', hideRecheck: false });
  });

  it('defaults to the original layout with nothing saved', () => {
    const { result } = renderHook(() => useChartSettings(true));
    expect(result.current.prefs).toMatchObject({ mirrorToDiagnosis: false, chartingView: 'grid', pdfIncludeGrid: true, pdfIncludeImages: true });
  });

  it('applies changes and keeps them (no account here: this browser)', async () => {
    const { result } = renderHook(() => useChartSettings(true));
    await act(async () => { await result.current.update({ hideRecheck: true, pocketMode: 'root' }); });
    expect(result.current.prefs).toMatchObject({ hideRecheck: true, pocketMode: 'root' });
    expect(readJson('chart.prefs', 1, null)).toMatchObject({ hideRecheck: true, pocketMode: 'root' });
  });
});


it('persists procedure shortcuts separately from diagnosis across reopening', async () => {
  const first = renderHook(() => useChartSettings(true));
  await act(async () => { await first.result.current.update({ quickCodes: ['T/SN'], procedureQuickCodes: ['EXT'] }); });
  first.unmount();
  const second = renderHook(() => useChartSettings(true));
  expect(second.result.current.prefs.quickCodes).toEqual(['T/SN']);
  expect(second.result.current.prefs.procedureQuickCodes).toEqual(['EXT']);
  await act(async () => { await second.result.current.update({ procedureQuickCodes: [] }); });
  expect(readJson('chart.prefs', 1, null)).toMatchObject({ quickCodes: ['T/SN'], procedureQuickCodes: [] });
});

it('starts new phone users in By tooth but preserves a stored grid choice', () => {
  const original = window.matchMedia;
  window.matchMedia = vi.fn(() => ({ matches: true } as MediaQueryList));
  const first = renderHook(() => useChartSettings(true));
  expect(first.result.current.prefs.chartingView).toBe('tooth');
  first.unmount();
  writeJson('chart.prefs', 1, { chartingView: 'grid' });
  const second = renderHook(() => useChartSettings(true));
  expect(second.result.current.prefs.chartingView).toBe('grid');
  second.unmount();
  window.matchMedia = original;
});

it('defaults older preferences to touch-only score buttons and retains an explicit choice after reopening', async () => {
  writeJson('chart.prefs', 1, { hideRecheck: true });
  const first = renderHook(() => useChartSettings(true));
  expect(first.result.current.prefs.scorePicker).toBe('touch');
  await act(async () => { await first.result.current.update({ scorePicker: 'always' }); });
  first.unmount();
  const second = renderHook(() => useChartSettings(true));
  expect(second.result.current.prefs.scorePicker).toBe('always');
});
