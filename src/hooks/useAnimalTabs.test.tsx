import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAnimalTabs } from './useAnimalTabs';
import type { UseChartStateReturn } from './useChartState';
import type { UseCloudSyncReturn } from './useCloudSync';
import type { ChartSnapshot } from '../types';

function setup(enabled = false) {
  let snapshot = { patientInfo: { patientName: 'Luna', patientNumber: '1', ownerName: 'Sarah', complaint: 'Luna note' }, species: 'canine' } as ChartSnapshot;
  const chart = {
    cloudChartId: 'a', chartSession: 1, patientInfo: snapshot.patientInfo, species: snapshot.species,
    getSnapshot: () => snapshot,
    applySnapshot: vi.fn((s: ChartSnapshot, id: string) => { snapshot = s; chart.patientInfo = s.patientInfo; chart.species = s.species; chart.cloudChartId = id; chart.chartSession++; }),
    setOpenedExisting: vi.fn(), openedExisting: false,
  } as unknown as UseChartStateReturn;
  const cloud = { enabled, dirty: false, lastSavedAt: 'saved', status: 'idle', saveNow: vi.fn(async () => {}), openChart: vi.fn(async () => true), confirmDiscardIfDirty: vi.fn(async () => true) } as unknown as UseCloudSyncReturn;
  const hook = renderHook(() => useAnimalTabs(chart, cloud, true));
  const change = (id: string, name: string, number: string) => {
    snapshot = { ...snapshot, patientInfo: { ...snapshot.patientInfo, patientName: name, patientNumber: number, complaint: `${name} note` } };
    chart.cloudChartId = id; chart.patientInfo = snapshot.patientInfo; chart.chartSession++;
    hook.rerender();
  };
  return { ...hook, chart, cloud, change };
}

describe('animal workspaces', () => {
  it('keeps separate local snapshots when switching animals', async () => {
    const h = setup(); h.change('b', 'Oliver', '2');
    expect(h.result.current.tabs).toHaveLength(2);
    await act(async () => { await h.result.current.select('a'); });
    expect(h.chart.patientInfo.complaint).toBe('Luna note');
    await act(async () => { await h.result.current.select('b'); });
    expect(h.chart.patientInfo.complaint).toBe('Oliver note');
  });
  it('updates the same animal tab when another visit opens', () => {
    const h = setup(); h.change('a2', 'Luna', '1');
    expect(h.result.current.tabs).toHaveLength(1);
    expect(h.result.current.tabs[0].id).toBe('a2');
  });
  it('closes inactive tabs without changing the working chart and can close the last tab', async () => {
    const h = setup(); h.change('b', 'Oliver', '2');
    await act(async () => { await h.result.current.close('a'); });
    expect(h.chart.cloudChartId).toBe('b');
    await act(async () => { await h.result.current.close('b'); });
    expect(h.result.current.tabs).toHaveLength(0);
    expect(h.result.current.empty).toBe(true);
  });
  it('does not switch or close when a save fails', async () => {
    const h = setup(true); h.change('b', 'Oliver', '2'); h.cloud.dirty = true;
    h.cloud.saveNow = vi.fn(async () => { throw new Error('offline'); }); h.rerender();
    await act(async () => { expect(await h.result.current.select('a')).toBe(false); });
    await act(async () => { expect(await h.result.current.close('b')).toBe(false); });
    expect(h.cloud.openChart).not.toHaveBeenCalled();
    expect(h.result.current.tabs).toHaveLength(2);
  });
  it('does not switch when a save was cancelled or left newer edits unsaved', async () => {
    const h = setup(true); h.cloud.dirty = true; h.rerender();
    await act(async () => { expect(await h.result.current.openChart('b')).toBe(false); });
    expect(h.cloud.openChart).not.toHaveBeenCalled();
  });
  it('serializes navigation while a chart is loading', async () => {
    const h = setup(true); let release!: (value: boolean) => void;
    h.cloud.openChart = vi.fn(() => new Promise<boolean>(resolve => { release = resolve; })); h.rerender();
    let pending!: Promise<boolean>;
    await act(async () => { pending = h.result.current.openChart('b'); });
    await act(async () => { expect(await h.result.current.openChart('c')).toBe(false); });
    const createPatient = vi.fn(async () => true);
    await act(async () => { expect(await h.result.current.transition(createPatient)).toBe(false); });
    expect(createPatient).not.toHaveBeenCalled();
    await act(async () => { release(true); await pending; });
    expect(h.cloud.openChart).toHaveBeenCalledTimes(1);
  });
});

it('can reopen a closed local patient with its original clinical data', async () => {
  const h = setup();
  await act(async () => { await h.result.current.close('a'); });
  await act(async () => { expect(await h.result.current.select('a')).toBe(true); });
  expect(h.chart.patientInfo.complaint).toBe('Luna note');
});

it('opens a cloud chart only after the current edits are saved', async () => {
  const h = setup(true);
  h.cloud.dirty = true;
  h.cloud.saveNow = vi.fn(async () => { h.cloud.dirty = false; });
  h.cloud.openChart = vi.fn(async () => { expect(h.cloud.dirty).toBe(false); return true; });
  h.rerender();
  await act(async () => { expect(await h.result.current.openChart('b')).toBe(true); });
  expect(h.cloud.saveNow).toHaveBeenCalledOnce();
  expect(h.cloud.openChart).toHaveBeenCalledWith('b', { skipConfirm: true });
});
