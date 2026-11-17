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

// Two tabs share one localStorage working copy, one key per field. Tab 2
// opening chart B writes every key; tab 1 editing chart A then wrote only
// the field it changed, so a reload assembled B's patient and id with A's
// findings, and saved them into B's record.
describe('two tabs: storage always holds one whole chart', () => {
  it('after another tab switches charts, this tab’s next edit rewrites every key', () => {
    const { result } = renderHook(() => useChartState());
    const myId = result.current.cloudChartId;
    act(() => result.current.handlePatientInfoChange('patientName', 'Alpha'));

    // Tab 2 opens chart B.
    store.set(ID_KEY, JSON.stringify('chart-b'));
    store.set('vibing-dental.chart.patientInfo.v1', JSON.stringify({ ...result.current.patientInfo, patientName: 'Bravo' }));
    store.set('vibing-dental.chart.openedExisting.v1', 'true');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: ID_KEY, newValue: JSON.stringify('chart-b') })); });

    // Tab 1 changes one field of chart A.
    act(() => result.current.handlePatientInfoChange('complaint', 'Fractured tooth'));

    expect(JSON.parse(store.get(ID_KEY)!)).toBe(myId);
    const info = JSON.parse(store.get('vibing-dental.chart.patientInfo.v1')!);
    expect(info.patientName).toBe('Alpha');
    expect(info.complaint).toBe('Fractured tooth');
    expect(JSON.parse(store.get('vibing-dental.chart.openedExisting.v1')!)).toBe(false);
  });

  it('another tab WIPING the working chart (sign-out) does not make this tab rewrite it', () => {
    const { result } = renderHook(() => useChartState());
    act(() => result.current.handlePatientInfoChange('patientName', 'Alpha'));
    store.clear();
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: ID_KEY, newValue: null })); });
    act(() => result.current.handlePatientInfoChange('complaint', 'x'));
    expect(store.has(ID_KEY)).toBe(false);
    expect(store.has('vibing-dental.chart.species.v1')).toBe(false);
  });

  it('without another tab, edits still write only what changed', () => {
    const { result } = renderHook(() => useChartState());
    store.delete('vibing-dental.chart.species.v1');
    act(() => result.current.handlePatientInfoChange('patientName', 'Alpha'));
    expect(store.has('vibing-dental.chart.species.v1')).toBe(false);
  });
});

it('creates an editable generated patient ID and carries permanent identity to later visits', () => {
  const { result } = renderHook(() => useChartState());
  const original = result.current.patientInfo;
  expect(original.patientNumber).toBe('');
  act(() => result.current.setPatientInfo(previous => ({ ...previous, patientNumber: '1001', generatedPatientNumber: '1001' })));
  expect(original.patientId).toBeTruthy();
  act(() => result.current.handlePatientInfoChange('patientName', 'Luna'));
  act(() => result.current.handlePatientInfoChange('patientNumber', '666'));
  act(() => { result.current.startNewVisit(); });
  expect(result.current.patientInfo.patientId).toBe(original.patientId);
  expect(result.current.patientInfo.patientNumber).toBe('666');
  act(() => result.current.handlePatientInfoChange('patientNumber', ''));
  expect(result.current.getSnapshot().patientInfo.patientNumber).toBe('1001');
  act(() => { result.current.startNewVisit({ identity: { patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', species: 'canine' } }); });
  expect(result.current.patientInfo.patientId).not.toBe(original.patientId);
});
