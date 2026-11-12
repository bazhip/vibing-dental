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
