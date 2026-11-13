import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from './types';
import { localDateISO } from './utils/localDate';

// Autosaves in the iOS app (cloud sync mocked): they don't refetch the
// patient lists unless something the lists show changed, and VoiceOver
// hears failures and explicit saves, not every autosave.
const flags = vi.hoisted(() => ({ native: true }));
vi.mock('./native/platform', () => ({
  isNativeApp: () => flags.native,
  WEB_ORIGIN: 'https://toothops.app/',
  initNativeShell: () => {},
}));
vi.mock('./native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

const cloud = vi.hoisted(() => ({
  enabled: true,
  status: 'idle' as 'idle' | 'saving' | 'saved' | 'error',
  dirty: false,
  online: true,
  saveError: '',
  awaitingClinical: false,
  lastSavedAt: '',
  listCharts: vi.fn(async () => ({ rows: [], hasMore: false })),
  openChart: vi.fn(async () => true),
  deleteChart: vi.fn(async () => {}),
  clearRecalls: vi.fn(async () => {}),
  confirmDiscardIfDirty: vi.fn(async () => true),
  fetchChart: vi.fn(async () => ({ species: 'canine', patientInfo: { patientName: 'Rex', patientNumber: '7', date: '2026-03-04' }, preMarks: {}, postMarks: {} })),
  listPatientVisits: vi.fn(async () => []),
  skipNextDuplicateCheck: vi.fn(),
  saveNow: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  restoreRevision: vi.fn(async () => {}),
}));
vi.mock('./hooks/useCloudSync', () => ({ useCloudSync: () => cloud }));
vi.mock('./components/ChartHistoryModal', () => ({
  ChartHistoryModal: () => <div role="dialog" aria-label="Chart history dialog" />,
}));

// This jsdom build has no Web Storage.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());

import EntryGrid from './EntryGrid';
import { DialogHost } from './components/ui/dialogs';

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia ?? ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});


function seedVisit(date: string) {
  localStorage.clear();
  sessionStorage.clear();
  const put = (key: string, value: unknown) => localStorage.setItem(`vibing-dental.${key}.v1`, JSON.stringify(value));
  put('chart.openedExisting', true);
  put('chart.cloudId', 'c-old');
  put('chart.patientInfo', {
    patientName: 'Rex', patientNumber: '7', ownerName: '', ownerPhone: '', ownerEmail: '',
    doctor: '', tech: '', date, complaint: '', treatmentReport: '', recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  });
}
beforeEach(() => {
  flags.native = true;
  cloud.status = 'idle';
  cloud.saveError = '';
  cloud.dirty = false;
  cloud.online = true;
  cloud.lastSavedAt = '';
  vi.clearAllMocks();
});

const ui = () => <><EntryGrid /><DialogHost /></>;
async function renderApp(date = localDateISO()) {
  seedVisit(date);
  window.history.replaceState(null, '', '/#/chart/c-old/patient');
  const utils = render(ui());
  await screen.findAllByText('Diagnosis');
  return utils;
}
const chartPanel = () => document.querySelector<HTMLElement>('[data-app-tab="chart"]')!;
const liveRegion = () => chartPanel().querySelector<HTMLElement>('.visually-hidden[role="status"]')!;
/** The Rechecks badge's due query (up to 500 rows). */
const badgeFetches = () =>
  (cloud.listCharts.mock.calls as unknown as [{ dueOnly?: boolean; limit?: number }][]).filter(([q]) => q?.dueOnly && q.limit === 500).length;

describe('autosave and the patient lists (iOS app)', () => {
  it('an autosave that changes nothing the lists show does not refetch them', async () => {
    const { rerender } = await renderApp();
    const before = badgeFetches();
    await act(async () => { cloud.lastSavedAt = '2026-11-13T10:00:00Z'; rerender(ui()); });
    const afterFirst = badgeFetches();
    // The first save of this chart may add it to the lists.
    expect(afterFirst).toBeGreaterThan(before);

    fireEvent.change(screen.getAllByPlaceholderText('Tech name (optional)')[0], { target: { value: 'Jo' } });
    await act(async () => { cloud.lastSavedAt = '2026-11-13T10:00:05Z'; rerender(ui()); });
    await act(async () => { cloud.lastSavedAt = '2026-11-13T10:00:10Z'; rerender(ui()); });
    expect(badgeFetches()).toBe(afterFirst);
  });

  it('saving a new recheck date or patient name refreshes them', async () => {
    const { rerender } = await renderApp();
    await act(async () => { cloud.lastSavedAt = '2026-11-13T10:00:00Z'; rerender(ui()); });
    const n = badgeFetches();

    fireEvent.change(screen.getAllByLabelText('Recheck due')[0], { target: { value: '2026-11-20' } });
    await act(async () => { cloud.lastSavedAt = '2026-11-13T10:00:05Z'; rerender(ui()); });
    expect(badgeFetches()).toBe(n + 1);

    fireEvent.change(screen.getByPlaceholderText('Enter patient name'), { target: { value: 'Rexy' } });
    await act(async () => { cloud.lastSavedAt = '2026-11-13T10:00:10Z'; rerender(ui()); });
    expect(badgeFetches()).toBe(n + 2);
  });

  it('a save that lands while newer edits are pending refreshes again on the next save', async () => {
    const { rerender } = await renderApp();
    fireEvent.change(screen.getByPlaceholderText('Enter patient name'), { target: { value: 'Rexy' } });
    await act(async () => { cloud.dirty = true; cloud.lastSavedAt = '2026-11-13T10:00:00Z'; rerender(ui()); });
    const n = badgeFetches();
    await act(async () => { cloud.dirty = false; cloud.lastSavedAt = '2026-11-13T10:00:05Z'; rerender(ui()); });
    expect(badgeFetches()).toBe(n + 1);
  });
});

describe('the Chart tab live region (VoiceOver)', () => {
  it('stays quiet through an autosave; the subtitle still shows it', async () => {
    const { rerender } = await renderApp();
    await act(async () => { cloud.status = 'saving'; rerender(ui()); });
    expect(liveRegion()).toHaveTextContent(/^$/);
    expect(within(chartPanel()).getAllByText('Saving…').length).toBeGreaterThan(0);
    await act(async () => { cloud.status = 'saved'; cloud.lastSavedAt = '2026-11-13T10:00:00Z'; rerender(ui()); });
    expect(liveRegion()).toHaveTextContent(/^$/);
  });

  it('announces a failed save', async () => {
    const { rerender } = await renderApp();
    await act(async () => { cloud.status = 'error'; cloud.saveError = 'Network down'; rerender(ui()); });
    expect(liveRegion()).toHaveTextContent('Network down');
  });

  it('announces "Chart saved" after Done saves an edited visit, then goes quiet for later autosaves', async () => {
    const { rerender } = await renderApp('2026-03-04');
    act(() => fireEvent.click(within(chartPanel()).getByRole('button', { name: 'Edit' })));
    cloud.dirty = true;
    await act(async () => fireEvent.click(within(chartPanel()).getByRole('button', { name: 'Done' })));
    expect(cloud.saveNow).toHaveBeenCalled();
    await act(async () => { cloud.status = 'saving'; rerender(ui()); });
    await act(async () => { cloud.dirty = false; cloud.status = 'saved'; cloud.lastSavedAt = '2026-11-13T10:00:00Z'; rerender(ui()); });
    expect(liveRegion()).toHaveTextContent('Chart saved');

    await act(async () => { cloud.status = 'saving'; rerender(ui()); });
    await act(async () => { cloud.status = 'saved'; cloud.lastSavedAt = '2026-11-13T10:01:00Z'; rerender(ui()); });
    expect(liveRegion()).toHaveTextContent(/^$/);
  });
});
