import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnimalTabs } from './useAnimalTabs';
import type { UseChartStateReturn } from './useChartState';
import type { UseCloudSyncReturn } from './useCloudSync';
import { imageDraftWorkspace } from '../utils/imageDrafts';
import type { ChartSnapshot } from '../types';

const confirmation = vi.hoisted(() => vi.fn(async () => false));
vi.mock('../components/ui/dialogs', async original => ({ ...await original<typeof import('../components/ui/dialogs')>(), confirmDialog: confirmation }));
beforeEach(() => { confirmation.mockReset(); confirmation.mockResolvedValue(false); });

function setup(enabled = false, overrides: Partial<UseCloudSyncReturn> = {}) {
  let snapshot = { patientInfo: { patientName: 'Luna', patientNumber: '1', ownerName: 'Sarah', complaint: 'Luna note' }, species: 'canine' } as ChartSnapshot;
  const chart = {
    cloudChartId: 'a', chartSession: 1, patientInfo: snapshot.patientInfo, species: snapshot.species,
    getSnapshot: () => snapshot,
    applySnapshot: vi.fn((s: ChartSnapshot, id: string) => { snapshot = s; chart.patientInfo = s.patientInfo; chart.species = s.species; chart.cloudChartId = id; chart.chartSession++; }),
    setOpenedExisting: vi.fn(), openedExisting: false,
  } as unknown as UseChartStateReturn;
  const cloud = { enabled, dirty: false, lastSavedAt: 'saved', status: 'idle', saveNow: vi.fn(async () => {}), openChart: vi.fn(async () => true), confirmDiscardIfDirty: vi.fn(async () => true), ...overrides } as unknown as UseCloudSyncReturn;
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

it('keeps an unnamed image-only draft open even when chart text is not dirty', async () => {
  const h = setup(true, { hasImages: vi.fn(async () => true), lastSavedAt: '' });
  h.change('a', '', '');
  await act(async () => { expect(await h.result.current.close('a')).toBe(false); });
  expect(h.result.current.tabs).toHaveLength(1);
  expect(h.cloud.saveNow).not.toHaveBeenCalled();
});
it('blocks closing a saved tab while its image is still uploading', async () => {
  const h = setup(true, { hasPendingImageUpload: () => true });
  await act(async () => { expect(await h.result.current.close('a')).toBe(false); });
  expect(h.result.current.tabs).toHaveLength(1);
});
it('saves a named image-only draft before allowing it to close', async () => {
  const h = setup(true, { hasImages: vi.fn(async () => true), lastSavedAt: '' });
  h.cloud.saveNow = vi.fn(async () => { h.cloud.lastSavedAt = 'saved'; });
  await act(async () => { expect(await h.result.current.close('a')).toBe(true); });
  expect(h.cloud.saveNow).toHaveBeenCalledOnce();
});
it('keeps the tab when the attachment check fails', async () => {
  const h = setup(true, { hasImages: vi.fn(async () => { throw new Error('offline'); }), lastSavedAt: '' });
  await act(async () => { await expect(h.result.current.close('a')).rejects.toThrow('offline'); });
  expect(h.result.current.tabs).toHaveLength(1);
});
it('recovers image-only chart ids as unnamed tabs without copying the active patient', async () => {
  const h = setup(true, { findImageDrafts: async () => [{ id: 'lost-image-chart', date: '2026-11-17' }] });
  await waitFor(() => expect(h.result.current.tabs.some(tab => tab.id === 'lost-image-chart')).toBe(true));
  const recovered = h.result.current.tabs.find(tab => tab.id === 'lost-image-chart')!;
  expect(recovered.name).toBe('');
  expect(recovered.patientNumber).toBe('');
  expect(h.chart.patientInfo.patientName).toBe('Luna');
});

it('confirms before closing an unnamed image draft and retains it when cancelled', async () => {
  const h = setup(true, { hasImages: vi.fn(async () => true), lastSavedAt: '' });
  h.change('a', '', '');
  await act(async () => { expect(await h.result.current.close('a')).toBe(false); });
  expect(confirmation).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Close without saving', cancelLabel: 'Keep chart open' }));
  confirmation.mockResolvedValue(true);
  await act(async () => { expect(await h.result.current.close('a')).toBe(true); });
  expect(h.result.current.tabs).toHaveLength(0);
  expect(h.result.current.empty).toBe(true);
});
it('keeps two unnamed local animals independent even on different dates', async () => {
  const h = setup();
  h.change('a', '', '');
  h.chart.patientInfo.date = '2026-11-16'; h.rerender();
  h.change('b', '', '');
  h.chart.patientInfo.date = '2026-11-17'; h.rerender();
  expect(h.result.current.tabs.map(tab => tab.id)).toEqual(['a', 'b']);
  await act(async () => { await h.result.current.select('a'); });
  expect(h.chart.cloudChartId).toBe('a');
  expect(h.chart.patientInfo.date).toBe('2026-11-16');
  await act(async () => { await h.result.current.select('b'); });
  expect(h.chart.cloudChartId).toBe('b');
  expect(h.chart.patientInfo.date).toBe('2026-11-17');
});

it('deletes uploads only after confirmed discard of a never-saved image draft', async () => {
  const remove = vi.fn(async () => {});
  const h = setup(true, { hasImages: async () => true, discardImageDraft: remove, lastSavedAt: '' });
  h.change('a', '', '');
  await act(async () => { await h.result.current.close('a'); });
  expect(remove).not.toHaveBeenCalled();
  confirmation.mockResolvedValue(true);
  await act(async () => { expect(await h.result.current.close('a')).toBe(true); });
  expect(remove).toHaveBeenCalledWith('a');
  expect(confirmation).toHaveBeenLastCalledWith(expect.objectContaining({ message: expect.stringContaining('permanently delete its uploaded images') }));
});
it('does not resume saving or recapture the last discarded chart when another patient opens', async () => {
  const resume = vi.fn();
  const h = setup(true, { lastSavedAt: '', resumeWorkspace: resume });
  h.cloud.dirty = true;
  h.cloud.saveNow = vi.fn(async () => { throw new Error('offline'); });
  h.cloud.captureWorkspace = vi.fn(async () => ({ ...imageDraftWorkspace('a', '2026-11-17'), snapshot: h.chart.getSnapshot() }));
  confirmation.mockResolvedValue(true);
  await act(async () => { expect(await h.result.current.close('a')).toBe(true); });
  expect(resume).not.toHaveBeenCalled();
  expect(h.cloud.captureWorkspace).toHaveBeenCalledOnce();
  await act(async () => { expect(await h.result.current.prepareLeave()).toBe(true); });
  expect(h.cloud.captureWorkspace).toHaveBeenCalledOnce();
});
it('preserves uploaded images when discarding changes to an already-saved chart', async () => {
  const remove = vi.fn(async () => {});
  const h = setup(true, { discardImageDraft: remove, dirty: true });
  h.cloud.saveNow = vi.fn(async () => { throw new Error('offline'); });
  confirmation.mockResolvedValue(true);
  await act(async () => { expect(await h.result.current.close('a')).toBe(true); });
  expect(remove).not.toHaveBeenCalled();
});
it('keeps a deliberately reopened discarded chart visible after remount', async () => {
  const h = setup(true, { dirty: true });
  h.cloud.saveNow = vi.fn(async () => { throw new Error('offline'); });
  confirmation.mockResolvedValue(true);
  await act(async () => { expect(await h.result.current.close('a')).toBe(true); });
  await act(async () => { expect(await h.result.current.openChart('a')).toBe(true); });
  h.unmount();
  const reopened = renderHook(() => useAnimalTabs(h.chart, h.cloud, true));
  expect(reopened.result.current.empty).toBe(false);
  expect(reopened.result.current.tabs.some(tab => tab.id === 'a')).toBe(true);
});
