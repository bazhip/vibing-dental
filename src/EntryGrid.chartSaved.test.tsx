import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from './types';
import { localDateISO } from './utils/localDate';

// The Chart tab in the iOS app on a saved visit (cloud sync mocked):
// view-only state in the navigation bar, Edit / Done, New visit and
// History in the More menu, and no web banners.
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

/** A saved visit from an earlier day, reopened (opens view-only). */
function seedSavedVisit(date = '2026-03-04') {
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
  seedSavedVisit();
  vi.clearAllMocks();
});

async function renderApp() {
  window.history.replaceState(null, '', '/#/chart/c-old/patient');
  const utils = render(<><EntryGrid /><DialogHost /></>);
  await screen.findAllByText('Diagnosis');
  return utils;
}
const chartPanel = () => document.querySelector<HTMLElement>('[data-app-tab="chart"]')!;
const openMore = () => fireEvent.click(within(chartPanel()).getByRole('button', { name: 'More' }));

describe('saved visit in the iOS Chart tab', () => {
  it('view-only: subtitle "View only · <date>", an Edit button, and no banner', async () => {
    const { container } = await renderApp();
    expect(screen.getByRole('heading', { level: 1, name: /Rex/ })).toBeInTheDocument();
    expect(within(chartPanel()).getAllByText(/^View only · /).length).toBeGreaterThan(0);
    expect(within(chartPanel()).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(container.querySelector('.chart-lock-banner')).toBeNull();
    expect(container.querySelector('.topbar-state-chip')).toBeNull();
  });

  it('More holds New visit, Chart history and Edit chart; they call the existing handlers', async () => {
    await renderApp();
    openMore();
    const labels = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(labels).toEqual(expect.arrayContaining(['New chart', 'New visit', 'Chart history', 'Edit chart']));
    act(() => fireEvent.click(screen.getByRole('menuitem', { name: 'Chart history' })));
    expect(await screen.findByRole('dialog', { name: 'Chart history dialog' })).toBeInTheDocument();

    openMore();
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'New visit' })));
    expect(cloud.fetchChart).toHaveBeenCalledWith('c-old');
  });

  it('Edit unlocks: subtitle "Editing", Done saves and locks again', async () => {
    await renderApp();
    act(() => fireEvent.click(within(chartPanel()).getByRole('button', { name: 'Edit' })));
    expect(within(chartPanel()).getAllByText(/^Editing/).length).toBeGreaterThan(0);
    expect(within(chartPanel()).queryByRole('button', { name: 'Edit' })).toBeNull();
    // Mid-edit, Done comes first (no New chart), as on the website.
    openMore();
    expect(screen.queryByRole('menuitem', { name: 'New chart' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });

    await act(async () => fireEvent.click(within(chartPanel()).getByRole('button', { name: 'Done' })));
    expect(within(chartPanel()).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('Edit chart in the More menu does the same as the Edit button', async () => {
    await renderApp();
    openMore();
    act(() => fireEvent.click(screen.getByRole('menuitem', { name: 'Edit chart' })));
    expect(within(chartPanel()).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('a failed save shows an inline notice under the bar with Retry', async () => {
    cloud.status = 'error';
    cloud.saveError = 'Network down';
    seedSavedVisit(localDateISO()); // today's visit: editable
    await renderApp();
    const notice = within(chartPanel()).getByRole('alert');
    expect(notice).toHaveClass('ios-chart-notice');
    expect(notice).toHaveTextContent('Network down');
    await act(async () => fireEvent.click(within(notice).getByRole('button', { name: 'Try again' })));
    expect(cloud.saveNow).toHaveBeenCalled();
    // The notice sits after the bar in the flow, never inside it.
    expect(notice.closest('.ios-navbar')).toBeNull();
  });
});

describe('saved visit on the website (unchanged)', () => {
  it('keeps the topbar chip and Edit chart button, and no iOS bar', async () => {
    flags.native = false;
    const { container } = await renderApp();
    expect(container.querySelector('.ios-navbar')).toBeNull();
    expect(container.querySelector('.topbar-state-chip--viewing')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Edit chart/ })).toBeInTheDocument();
  });
});
