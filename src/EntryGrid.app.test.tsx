import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The iOS app with saved charts (cloud sync mocked): the paths from the
// Patients / Rechecks / Settings tabs into EntryGrid's state.

vi.mock('./native/platform', () => ({
  isNativeApp: () => true,
  WEB_ORIGIN: 'https://toothops.app/',
  initNativeShell: () => {},
}));
vi.mock('./native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));

const cloud = vi.hoisted(() => ({
  enabled: true,
  status: 'idle' as const,
  dirty: false,
  online: true,
  saveError: '',
  awaitingClinical: false,
  lastSavedAt: null as string | null,
  listCharts: vi.fn(async () => ({ rows: [], hasMore: false })),
  openChart: vi.fn(async () => true),
  deleteChart: vi.fn(async () => {}),
  clearRecalls: vi.fn(async () => {}),
  confirmDiscardIfDirty: vi.fn(async () => true),
  fetchChart: vi.fn(async () => ({
    species: 'canine',
    patientInfo: { patientName: 'Rex', patientNumber: '7' },
    preMarks: {},
    postMarks: {},
  })),
  listPatientVisits: vi.fn(async () => []),
  skipNextDuplicateCheck: vi.fn(),
  saveNow: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  restoreRevision: vi.fn(async () => {}),
}));
vi.mock('./hooks/useCloudSync', () => ({ useCloudSync: () => cloud }));

// The chart tab's layout: a way to push a screen onto the Chart stack, plus
// the Patient section (for typing into the chart).
vi.mock('./components/Layouts', async () => {
  const { useStack } = await import('./ios/Stack');
  return {
    SidebarLayout: ({ sections }: { sections: { id: string; content: React.ReactNode }[] }) => {
      const { push } = useStack();
      return (
        <div>
          <button type="button" onClick={() => push({ id: 'x', title: 'Pushed', render: () => <p>Pushed chart screen</p> })}>
            Push on chart
          </button>
          {sections[0].content}
        </div>
      );
    },
  };
});
vi.mock('./components/ChartHistoryModal', () => ({
  ChartHistoryModal: ({ onOpenChart }: { onOpenChart?: () => void }) => (
    <div role="dialog" aria-label="History">
      {onOpenChart && <button type="button" onClick={onOpenChart}>Open this visit</button>}
    </div>
  ),
}));

const renders = vi.hoisted(() => ({ patients: 0, rechecks: 0, settings: 0 }));
const lastLibrary = vi.hoisted(() => ({ current: null as null | import('./ios/appData').AppLibrary }));
vi.mock('./ios/screens/PatientsScreen', async () => {
  const { useAppLibrary } = await import('./ios/appData');
  const { useAppShell } = await import('./ios/AppShell');
  return {
    PatientsScreen: () => {
      renders.patients++;
      const library = useAppLibrary();
      const shell = useAppShell();
      lastLibrary.current = library;
      return (
        <div>
          <p>Library version {library?.libraryVersion}</p>
          <button type="button" onClick={() => void shell.openChart('c-1')}>Open c-1</button>
          <button type="button" onClick={() => void library?.newVisit('c-1')}>New visit</button>
          <button type="button" onClick={() => void library?.newPatient()}>New patient</button>
          <button type="button" onClick={() => void library?.loadPdf(new File(['x'], 'x.pdf'))}>Load PDF</button>
          <button type="button" onClick={() => library?.openHistory('c-9', 'Rex')}>History</button>
          <button type="button" onClick={() => void library?.deleteChart('c-1')}>Delete</button>
          <button type="button" onClick={() => void library?.clearRecalls(['c-1'])}>Clear recalls</button>
        </div>
      );
    },
  };
});
vi.mock('./ios/screens/RechecksScreen', () => ({
  RechecksScreen: () => {
    renders.rechecks++;
    return <p>Rechecks</p>;
  },
}));
vi.mock('./ios/screens/SettingsScreen', async (importOriginal) => {
  const real = await importOriginal<typeof import('./ios/screens/SettingsScreen')>();
  return {
    SettingsScreen: () => {
      renders.settings++;
      return <real.SettingsScreen />;
    },
  };
});

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
beforeEach(() => {
  cloud.lastSavedAt = null;
  vi.clearAllMocks();
});

const panel = (tab: string) => document.querySelector<HTMLElement>(`[data-app-tab="${tab}"]`)!;
const tab = (name: string) => screen.getByRole('tab', { name });

async function renderApp() {
  window.history.replaceState(null, '', '/#/chart/patient');
  const utils = render(<><EntryGrid /><DialogHost /></>);
  await screen.findByRole('button', { name: 'Push on chart' });
  return utils;
}

/** Push a screen on the Chart tab, then go to Patients. */
async function pushOnChartThenPatients() {
  fireEvent.click(screen.getByRole('button', { name: 'Push on chart' }));
  expect(screen.getByText('Pushed chart screen')).toBeInTheDocument();
  act(() => fireEvent.click(tab('Patients')));
}

async function expectLandedOnChartRoot() {
  await waitFor(() => expect(tab('Chart')).toHaveAttribute('aria-selected', 'true'));
  expect(panel('chart')).not.toHaveAttribute('hidden');
  await waitFor(() => expect(screen.queryByText('Pushed chart screen')).toBeNull());
}

describe('EntryGrid in the app, with saved charts', () => {
  it('a chart keystroke does not re-render the Patients, Rechecks or Settings screens', async () => {
    await renderApp();
    const before = { ...renders };
    const name = within(panel('chart')).getByPlaceholderText('Enter patient name');
    fireEvent.change(name, { target: { value: 'B' } });
    fireEvent.change(name, { target: { value: 'Bi' } });
    fireEvent.change(name, { target: { value: 'Bis' } });
    expect((name as HTMLInputElement).value).toBe('Bis');
    expect(renders).toEqual(before);
  });

  it('opening a visit from Patients lands on the Chart tab, popped to its root', async () => {
    await renderApp();
    await pushOnChartThenPatients();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open c-1' })));
    expect(cloud.openChart).toHaveBeenCalledWith('c-1');
    await expectLandedOnChartRoot();
  });

  it('a cancelled open stays on Patients', async () => {
    await renderApp();
    cloud.openChart.mockResolvedValueOnce(false);
    act(() => fireEvent.click(tab('Patients')));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open c-1' })));
    expect(tab('Patients')).toHaveAttribute('aria-selected', 'true');
  });

  it('a failed open toasts and stays on Patients', async () => {
    await renderApp();
    cloud.openChart.mockRejectedValueOnce(new Error('boom'));
    act(() => fireEvent.click(tab('Patients')));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open c-1' })));
    expect(tab('Patients')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/Couldn’t open that visit/)).toBeInTheDocument();
  });

  it.each([['New visit'], ['New patient'], ['Load PDF']])('%s lands on the Chart tab, popped to its root', async (label) => {
    await renderApp();
    await pushOnChartThenPatients();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: label })));
    await expectLandedOnChartRoot();
  });

  it('“Open this visit” in Chart history lands on the Chart tab, popped to its root', async () => {
    await renderApp();
    await pushOnChartThenPatients();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'History' })));
    await act(async () => fireEvent.click(await screen.findByRole('button', { name: 'Open this visit' })));
    expect(cloud.openChart).toHaveBeenCalledWith('c-9');
    await expectLandedOnChartRoot();
  });

  it('libraryVersion bumps after delete, clear recalls, new visit, new patient and a save', async () => {
    await renderApp();
    act(() => fireEvent.click(tab('Patients')));
    const version = () => lastLibrary.current!.libraryVersion;
    let v = version();
    for (const label of ['Delete', 'Clear recalls', 'New visit', 'New patient']) {
      if (label.startsWith('New')) act(() => fireEvent.click(tab('Patients')));
      await act(async () => fireEvent.click(screen.getByRole('button', { name: label })));
      await waitFor(() => expect(version()).toBeGreaterThan(v));
      v = version();
    }
    expect(cloud.deleteChart).toHaveBeenCalledWith('c-1');
    expect(cloud.clearRecalls).toHaveBeenCalledWith(['c-1']);

    // An autosave completing (lastSavedAt moves) bumps it too.
    cloud.lastSavedAt = '2026-11-13T10:00:00Z';
    const name = within(panel('chart')).getByPlaceholderText('Enter patient name');
    fireEvent.change(name, { target: { value: 'Rex 2' } });
    await waitFor(() => expect(version()).toBeGreaterThan(v));
  });

  it('the Rechecks tab shows a badge with the patients Overdue + Due today (none when 0)', async () => {
    const due = [
      { id: 'r1', patient_name: 'Bella', patient_number: '1', owner_name: '', owner_phone: '', owner_email: '', species: 'canine', dentition: 'permanent', chart_date: '', recall_date: '2000-01-01', updated_at: '2026-11-01T00:00:00Z', created_by: 'u1' },
      { id: 'r2', patient_name: 'Max', patient_number: '2', owner_name: '', owner_phone: '', owner_email: '', species: 'canine', dentition: 'permanent', chart_date: '', recall_date: '2000-01-02', updated_at: '2026-11-01T00:00:00Z', created_by: 'u1' },
    ];
    cloud.listCharts.mockImplementation((async (q?: { dueOnly?: boolean }) => ({ rows: q?.dueOnly ? due : [], hasMore: false })) as never);
    const { unmount } = await renderApp();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Rechecks, 2' })).toBeInTheDocument());
    unmount();
    cloud.listCharts.mockImplementation(async () => ({ rows: [], hasMore: false }));
    await renderApp();
    await waitFor(() => expect(cloud.listCharts).toHaveBeenCalledWith(expect.objectContaining({ dueOnly: true })));
    expect(screen.getByRole('tab', { name: 'Rechecks' })).toBeInTheDocument();
  });

  it('Sign out in Settings asks, then signs out through cloud sync', async () => {
    await renderApp();
    act(() => fireEvent.click(tab('Settings')));
    act(() => fireEvent.click(within(panel('settings')).getByRole('button', { name: 'Sign out' })));
    const alert = await screen.findByRole('alertdialog');
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(cloud.signOut).toHaveBeenCalledTimes(1));
  });
});
