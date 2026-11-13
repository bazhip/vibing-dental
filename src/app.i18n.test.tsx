import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, { loadLanguage } from './i18n';
import { installPseudoLocale, restoreLocale, findUntranslated } from './i18n/testing/pseudo';
import type { ChartSnapshot } from './types';

// ---------------------------------------------------------------------------
// Mocks. The chart frame (topbar, menus, status pill, banners, dialogs) is what this
// area owns, so every section's content and every modal is stubbed out: those belong
// to later tasks and would otherwise report their own untranslated text here.
// ---------------------------------------------------------------------------

// This environment has no working web storage (as in useCloudSync.autosave.test).
function stubStorage(name: 'localStorage' | 'sessionStorage') {
  const store = new Map<string, string>();
  vi.stubGlobal(name, {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  });
  return store;
}
const local = stubStorage('localStorage');
const session = stubStorage('sessionStorage');

const db = vi.hoisted(() => ({
  visits: [] as Array<Record<string, string>>,
  /** updated_at the "server" reports for a chart. */
  remoteAt: '2026-11-12T10:00:00Z',
  /** Make list queries fail as if the history table did not exist. */
  historyMissing: false,
}));
vi.mock('./utils/supabaseClient', () => {
  const builder = () => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      select: chain, order: chain, limit: chain, ilike: chain, eq: chain,
      maybeSingle: async () => ({ data: { id: 'x', updated_at: db.remoteAt }, error: null }),
      single: async () => ({ data: { id: 'x', data: {}, updated_at: db.remoteAt }, error: null }),
      upsert: chain,
      then: (resolve: (v: unknown) => void) => resolve(db.historyMissing
        ? { data: null, error: { message: 'relation "public.chart_revisions" does not exist' } }
        : { data: db.visits, error: null }),
    });
    return q;
  };
  return {
    cloudEnabled: true,
    supabase: { from: builder, auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'vet@clinic.test' } } } }) } },
  };
});

// The frame renders against a fake sync state; the sync dialogs below run the real hook.
const sync = vi.hoisted(() => ({ override: null as Record<string, unknown> | null }));
vi.mock('./hooks/useCloudSync', async (importOriginal) => {
  const real = await importOriginal<typeof import('./hooks/useCloudSync')>();
  return { ...real, useCloudSync: (...args: Parameters<typeof real.useCloudSync>) => sync.override ?? real.useCloudSync(...args) };
});

const profile = vi.hoisted(() => ({ admin: false, doctorName: 'Dr. Avery' }));
vi.mock('./hooks/useProfile', () => ({
  useProfile: () => ({
    loaded: true, practiceId: 'p1', practiceName: 'Seaside Vet', doctorName: profile.doctorName, logoUrl: '',
    ownerReportEnabled: false, ownerReportConfig: {}, saveOwnerReportConfig: vi.fn(),
    aiEnabled: false, maxImages: 8, dicomEnabled: false,
  }),
}));
vi.mock('./hooks/useChartSettings', async () => {
  const { DEFAULT_CHART_PREFS } = await import('./utils/chartSettings');
  return {
    useChartSettings: () => ({ prefs: DEFAULT_CHART_PREFS, update: vi.fn(async () => {}), followsAccount: false, loaded: true }),
  };
});
vi.mock('./i18n/useAppLanguage', () => ({ useAppLanguage: () => 'en' }));
vi.mock('./components/AdminPanel', () => ({ AdminPanel: () => null, useIsAdmin: () => profile.admin }));
vi.mock('./components/FinishSetupModal', () => ({ FinishSetupModal: () => null, useFinishSetup: () => ({ checked: true, need: null, done: vi.fn() }) }));

vi.mock('./components', () => ({
  PatientForm: () => null,
  DentalGrid: () => null,
  AnesthesiaForm: () => null,
  ExamForm: () => null,
  SurgeryReportForm: () => null,
  ImagingSection: () => null,
  CodeReferencePanel: () => null,
  DiagramView: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock('./components/CodeField', () => ({
  CodeField: ({ placeholder }: { placeholder?: string }) => <textarea placeholder={placeholder} />,
}));
vi.mock('./components/VoiceInputButton', () => ({ VoiceInputButton: () => null, actionFocus: () => null }));
vi.mock('./components/FeedbackModal', () => ({ FeedbackModal: () => null }));
vi.mock('./components/ChartSettingsModal', () => ({ ChartSettingsModal: () => null }));
vi.mock('./components/WhatsNewModal', () => ({ WhatsNewModal: () => null }));
vi.mock('./components/ChartHistoryModal', () => ({ ChartHistoryModal: () => null }));
vi.mock('./components/OwnerReportCustomize', () => ({ OwnerReportCustomize: () => null }));
vi.mock('./components/PracticeSettingsModal', () => ({ PracticeSettingsModal: () => null }));
vi.mock('./components/RemindersModal', () => ({ RemindersModal: () => null }));
vi.mock('./components/AccountModal', () => ({ AccountModal: () => null }));
vi.mock('./components/WalkthroughModal', () => ({ WalkthroughModal: () => null }));
vi.mock('./components/ChartLibrary', () => ({ ChartLibrary: () => null }));
vi.mock('./components/OwnerReportSection', () => ({ OwnerReportSection: () => null }));
vi.mock('./components/ToothChartView', () => ({ ToothChartView: () => null }));
vi.mock('./components/ReminderModal', () => ({ ReminderModal: () => null }));
vi.mock('./components/DocumentsModal', () => ({ DocumentsModal: () => null }));

import EntryGrid from './EntryGrid';
import { DialogHost, confirmDialog, promptDialog, toast, friendlyError } from './components/ui/dialogs';
import { ChartMenu } from './components/ChartMenu';
import { ChartsMenu } from './components/ChartsMenu';
import { SidebarLayout } from './components/Layouts';
import './components/MobileSectionMenu';
import { useCloudSync, type DiscardAction } from './hooks/useCloudSync';
import { useChartHistory } from './hooks/useChartHistory';
import { formatDate } from './i18n/format';
import { writeString } from './utils/storage';
import './App';
import './hooks/useChartState';
import './hooks/useWakeLock';
import './utils/lazyWithReload';

// ---------------------------------------------------------------------------
// Fixtures: names and values the user (or the practice) typed, never translated.
// ---------------------------------------------------------------------------

const FIXTURE = ['Rex', 'Dr. Avery', 'Seaside Vet', 'vet@clinic.test', 'Biscuit'];
const CHART_ID = 'chart-seed';

const visitRows = [
  { id: CHART_ID, chart_date: '2026-11-12', updated_at: '2026-11-12T10:00:00Z', patient_name: 'Rex', patient_number: '', species: 'canine' },
  { id: 'older', chart_date: '2026-01-05', updated_at: '2026-01-05T10:00:00Z', patient_name: 'Rex', patient_number: '', species: 'canine' },
];

function fakeCloud(over: Record<string, unknown> = {}) {
  return {
    enabled: true, status: 'idle', saveError: '', dirty: false, awaitingClinical: false, online: true, lastSavedAt: '',
    saveNow: vi.fn(async () => {}), skipNextDuplicateCheck: vi.fn(),
    listCharts: vi.fn(async () => ({ rows: [], hasMore: false })),
    listPatientVisits: vi.fn(async () => visitRows),
    confirmDiscardIfDirty: vi.fn(async () => true),
    openChart: vi.fn(async () => true),
    fetchChart: vi.fn(async () => ({ toothData: [], preMarks: {}, postMarks: {}, patientInfo: {}, species: 'canine' })),
    restoreRevision: vi.fn(async () => true), deleteChart: vi.fn(async () => {}), clearRecalls: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ...over,
  };
}

function seedChart(over: { name?: string; date?: string; saved?: boolean } = {}) {
  const info = {
    patientName: over.name ?? 'Rex', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
    date: over.date ?? '2026-11-12', complaint: '', treatmentReport: '', recallDate: '', nerveBlocks: {}, exam: {},
  };
  writeString('chart.patientInfo', 1, JSON.stringify(info));
  writeString('chart.cloudId', 1, JSON.stringify(CHART_ID));
  if (over.saved) writeString('chart.openedExisting', 1, 'true');
}

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia ?? ((q: string) => ({
    matches: false, media: q, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});

beforeEach(async () => {
  local.clear(); session.clear();
  sync.override = null; profile.admin = false; profile.doctorName = 'Dr. Avery';
  db.visits = []; db.remoteAt = '2026-11-12T10:00:00Z'; db.historyMissing = false;
  window.history.replaceState(null, '', '/#/chart');
  await act(installPseudoLocale);
});
afterEach(async () => {
  await act(restoreLocale);
  vi.restoreAllMocks();
});

async function frame(props: { trial?: boolean } = {}) {
  const view = render(<><EntryGrid {...props} /><DialogHost /></>);
  // Let the effects that load visits and the like settle.
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return view;
}
const untranslated = () => findUntranslated(document.body, FIXTURE);

// ---------------------------------------------------------------------------
// The chart frame
// ---------------------------------------------------------------------------

describe('chart frame', () => {
  it('trial topbar, section labels and footer are translated', async () => {
    sync.override = fakeCloud({ enabled: false });
    profile.doctorName = '';
    await frame({ trial: true });
    expect(screen.getByText('⟦ToothOps Charting · Trial⟧')).toBeTruthy();
    expect(screen.getByText('⟦On this device only⟧')).toBeTruthy();
    expect(screen.getByText('⟦Sign in⟧')).toBeTruthy();
    expect(untranslated()).toEqual([]);
  });

  it('a new chart: offline, unsaved, saving, saved and failed states', async () => {
    seedChart();
    const states: Array<[string, Record<string, unknown>]> = [
      ['⟦Offline — saved on this device⟧', { dirty: true, online: false }],
      ['⟦Unsaved changes⟧', { dirty: true }],
      ['⟦Saving…⟧', { status: 'saving' }],
      ['⟦Not saved — retry⟧', { status: 'error', saveError: i18n.t('sync.offline', { ns: 'app' }) }],
    ];
    for (const [text, over] of states) {
      sync.override = fakeCloud(over);
      const { unmount } = await frame();
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
      expect(untranslated()).toEqual([]);
      unmount();
    }
    // Saved: the word (hidden on phones) and the time of day are one message.
    sync.override = fakeCloud({ lastSavedAt: new Date().toISOString() });
    await frame();
    expect(document.querySelector('.save-status__word')!.textContent).toBe('⟦Saved · ⟧');
    expect(document.querySelector('.save-status--saved')!.textContent).toMatch(/^⟦Saved · ⟧.*⟦.+⟧/);
    expect(untranslated()).toEqual([]);
  });

  it('a chart waiting for a name or for charting to start', async () => {
    sync.override = fakeCloud({ dirty: true });
    seedChart({ name: '' });
    const { unmount } = await frame();
    expect(screen.getByText('⟦Add a patient name to save⟧')).toBeTruthy();
    // ⌘S with no patient name blocks the save and says why.
    fireEvent.keyDown(document, { key: 's', metaKey: true });
    expect(await screen.findByText('⟦Not saved⟧')).toBeTruthy();
    expect(untranslated()).toEqual([]);
    unmount();

    seedChart();
    sync.override = fakeCloud({ dirty: true, awaitingClinical: true });
    await frame();
    expect(screen.getByRole('button', { name: /Save/ }).getAttribute('title')).toMatch(/^⟦Kept on this device/);
    expect(untranslated()).toEqual([]);
  });

  it('a saved visit: viewing, then editing with Undo, with the visit switcher', async () => {
    seedChart({ date: '2026-01-05', saved: true });
    sync.override = fakeCloud({ lastSavedAt: new Date().toISOString() });
    const view = await frame();
    expect(document.querySelector('.topbar-state-chip')!.textContent).toBe('⟦View only⟧');
    expect(screen.getByText('⟦Edit chart⟧')).toBeTruthy();
    expect(screen.getByRole('button', { name: '⟦New patient⟧' })).toBeTruthy();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      '⟦2026-11-12 · latest⟧',
      '⟦2026-01-05 · earlier⟧',
    ]);
    expect(untranslated()).toEqual([]);
    // My charts ▾: this patient's New visit and Version history, plus the library.
    fireEvent.click(screen.getByText('⟦My charts⟧').closest('button')!);
    expect(screen.getByText('⟦New visit⟧')).toBeTruthy();
    expect(screen.getByText('⟦Version history⟧')).toBeTruthy();
    expect(screen.getByText('⟦Open My charts…⟧')).toBeTruthy();
    expect(untranslated()).toEqual([]);
    view.unmount();

    // Editing a saved visit that already differs from the version that was opened.
    session.set(`chart.unlocked.${CHART_ID}`, '1');
    session.set(`chart.unlockSnapshot.${CHART_ID}`, '{}');
    await frame();
    expect(document.querySelector('.topbar-state-chip')!.textContent).toBe('⟦Editing⟧');
    expect(screen.getByText('⟦Undo changes⟧')).toBeTruthy();
    expect(screen.getByText('⟦Done editing⟧')).toBeTruthy();
    expect(screen.getByText('⟦Done⟧')).toBeTruthy();
    expect(untranslated()).toEqual([]);

    // The revert confirmation is a dialog of ours.
    fireEvent.click(screen.getByText('⟦Undo changes⟧').closest('button')!);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(untranslated()).toEqual([]);
  });

  it('the other-tab warning', async () => {
    sync.override = fakeCloud({ enabled: false });
    await frame({ trial: true });
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'vibing-dental.chart.patientInfo.v1', newValue: '{}' })); });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(untranslated()).toEqual([]);
  });

  it('the settings menu, open with every entry', async () => {
    profile.admin = true;
    seedChart();
    sync.override = fakeCloud();
    await frame();
    fireEvent.click(screen.getByRole('button', { name: '⟦Open settings menu⟧' }));
    expect(await screen.findByText('⟦Admin panel⟧')).toBeTruthy();
    expect(screen.getByText('⟦Sign out⟧')).toBeTruthy();
    expect(untranslated()).toEqual([]);
  });

  it('the preview-failure toast', async () => {
    seedChart();
    sync.override = fakeCloud();
    await frame();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The stubbed diagrams expose no SVG, so building the preview fails.
    fireEvent.click(screen.getByRole('button', { name: /Preview/ }));
    expect(await screen.findByText(/^⟦Couldn’t build the preview yet/)).toBeTruthy();
    expect(untranslated()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Menus and layout on their own
// ---------------------------------------------------------------------------

describe('menus and layout', () => {
  it('the settings menu, as a signed-in admin and as a trial user', async () => {
    const noop = () => {};
    const { unmount } = render(
      <ChartMenu
        email="vet@clinic.test"
        onOpenWalkthrough={noop} onGoHome={noop} onOpenAdmin={noop} onOpenFeedback={noop}
        onOpenChartSettings={noop} onOpenWhatsNew={noop}
        cloud={{ onPracticeSettings: noop, onOpenReminders: noop, onOpenAccount: noop, onSignOut: noop }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '⟦Open settings menu⟧' }));
    expect(screen.getByText('⟦Signed in as ⟧')).toBeTruthy();
    expect(screen.getAllByRole('button').length).toBeGreaterThan(8);
    expect(findUntranslated(document.body, FIXTURE)).toEqual([]);
    unmount();

    render(<ChartMenu onOpenWalkthrough={noop} />);
    fireEvent.click(screen.getByRole('button', { name: '⟦Open settings menu⟧' }));
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('My charts ▾, for an unnamed saved patient and for an unsaved chart', () => {
    const noop = () => {};
    const { unmount } = render(<ChartsMenu onOpenLibrary={noop} thisPatient={{ name: '', onNewVisit: noop, onHistory: noop }} />);
    fireEvent.click(screen.getByText('⟦My charts⟧').closest('button')!);
    expect(screen.getByText('⟦This patient⟧')).toBeTruthy();
    expect(screen.getByText('⟦All patients⟧')).toBeTruthy();
    expect(findUntranslated(document.body)).toEqual([]);
    unmount();

    render(<ChartsMenu onOpenLibrary={noop} />);
    fireEvent.click(screen.getByText('⟦My charts⟧').closest('button')!);
    expect(screen.queryByText('⟦New visit⟧')).toBeNull();
    expect(findUntranslated(document.body)).toEqual([]);
  });

  it('the section navigation and its phone menu', () => {
    const sections = [
      { id: 'a', label: i18n.t('sections.patient', { ns: 'app' }), content: <p>{i18n.t('sections.exam', { ns: 'app' })}</p> },
      { id: 'b', label: i18n.t('sections.charting', { ns: 'app' }), content: null },
    ];
    render(<SidebarLayout sections={sections} />);
    expect(screen.getByRole('navigation', { name: '⟦Chart sections⟧' })).toBeTruthy();
    fireEvent.click(document.querySelector('.mobile-section-menu__trigger')!);
    expect(document.querySelectorAll('.mobile-section-menu__item').length).toBe(2);
    expect(findUntranslated(document.body)).toEqual([]);
    // With no section selected the phone trigger falls back to a generic label.
    render(<SidebarLayout sections={[]} />);
    expect(findUntranslated(document.body)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Dialogs and toasts (dialogs.tsx)
// ---------------------------------------------------------------------------

describe('dialog host', () => {
  it('default button labels, a read-only prompt, an error toast and friendlyError', async () => {
    render(<DialogHost />);
    let result: Promise<unknown> = Promise.resolve();
    act(() => { result = confirmDialog({ title: i18n.t('revert.title', { ns: 'app' }) }); });
    expect(await screen.findByText('⟦OK⟧')).toBeTruthy();
    expect(screen.getByText('⟦Cancel⟧')).toBeTruthy();
    expect(untranslatedBody()).toEqual([]);
    fireEvent.click(screen.getByText('⟦Cancel⟧'));
    await result;

    act(() => { result = promptDialog({ title: i18n.t('revert.title', { ns: 'app' }), readOnly: true, defaultValue: 'https://link.test/x' }); });
    expect(await screen.findByText('⟦Copy⟧')).toBeTruthy();
    expect(screen.getByText('⟦Close⟧')).toBeTruthy();
    expect(untranslatedBody(['https://link.test/x'])).toEqual([]);
    fireEvent.click(screen.getByText('⟦Close⟧'));
    await result;

    act(() => { toast(friendlyError(new Error('Failed to fetch')), { kind: 'error' }); });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: '⟦Dismiss⟧' })).toBeTruthy();
    expect(untranslatedBody()).toEqual([]);
  });
});
const untranslatedBody = (allow: string[] = []) => findUntranslated(document.body, [...FIXTURE, ...allow]);

// ---------------------------------------------------------------------------
// The sync dialogs and messages (useCloudSync.ts, useChartHistory.ts), with the real hook
// ---------------------------------------------------------------------------

function snap(name = 'Rex'): ChartSnapshot {
  return {
    species: 'canine',
    toothData: [],
    patientInfo: {
      patientName: name, patientNumber: '', ownerName: 'Pat', ownerPhone: '', ownerEmail: '',
      date: '2026-11-12', complaint: '', treatmentReport: '', nerveBlocks: {}, exam: {},
    },
  } as unknown as ChartSnapshot;
}
const fakeChart = (s: ChartSnapshot, openedExisting = false) => ({
  getSnapshot: () => s,
  cloudChartId: CHART_ID,
  resetCloudChartId: () => 'forked',
  openedExisting,
  setOpenedExisting: vi.fn(),
  applySnapshot: vi.fn(),
}) as unknown as Parameters<typeof useCloudSync>[0];

describe('sync dialogs', () => {
  it.each<DiscardAction>(['openOther', 'restore', 'signOut', 'newVisit', 'newPatient', 'importPdf'])(
    'the unsaved-changes prompt for %s',
    async (action) => {
      render(<DialogHost />);
      const chart = fakeChart(snap());
      const { result } = renderHook(() => useCloudSync(chart));
      let answer: Promise<boolean> = Promise.resolve(false);
      act(() => { answer = result.current.confirmDiscardIfDirty(action); });
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toMatch(/^⟦Discard unsaved changes\?⟧/);
      expect(untranslatedBody()).toEqual([]);
      fireEvent.click(screen.getByText('⟦Cancel⟧'));
      expect(await answer).toBe(false);
    },
  );

  it('an edit conflict, and the error left when the user keeps the other version', async () => {
    render(<DialogHost />);
    // Opened here at 09:00; the server says it was saved at 10:00 by someone else.
    writeString('chart.lastSaved', 1, JSON.stringify({ chartId: CHART_ID, at: '2026-11-12T09:00:00Z' }));
    const { result } = renderHook(() => useCloudSync(fakeChart(snap(), true)));
    let saving: Promise<void> = Promise.resolve();
    act(() => { saving = result.current.saveNow().catch(() => {}); });
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/^⟦This chart changed somewhere else⟧/);
    expect(untranslatedBody()).toEqual([]);
    fireEvent.click(screen.getByText('⟦Keep theirs⟧'));
    await act(async () => { await saving; });
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.saveError).toMatch(/^⟦Save failed: ⟦.+⟧/);
  });

  it('the same-day duplicate question, today and on an earlier day', async () => {
    render(<DialogHost />);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (const day of [iso, '2026-01-05']) {
      local.clear(); // the first save recorded this chart as saved, which skips the question
      db.visits = [{ id: 'older', chart_date: day, species: 'canine', patient_name: 'Biscuit', patient_number: '' }];
      const chart = fakeChart({ ...snap('Biscuit'), patientInfo: { ...snap('Biscuit').patientInfo, date: day } } as ChartSnapshot);
      const { result, unmount } = renderHook(() => useCloudSync(chart));
      let saving: Promise<void> = Promise.resolve();
      act(() => { saving = result.current.saveNow().catch(() => {}); });
      const dialog = await screen.findByRole('alertdialog');
      expect(dialog.textContent).toMatch(/^⟦Biscuit already has a visit /);
      expect(untranslatedBody()).toEqual([]);
      fireEvent.click(screen.getByText('⟦Keep both⟧'));
      await act(async () => { await saving; });
      unmount();
    }
  });

  it('the history hook explains a missing server table in the active language', async () => {
    db.historyMissing = true;
    const { result } = renderHook(() => useChartHistory(CHART_ID, true));
    await waitFor(() => expect(result.current.error).not.toBe(''));
    expect(result.current.error).toBe('⟦Chart history isn’t set up on the server yet.⟧');
  });
});

// ---------------------------------------------------------------------------
// French
// ---------------------------------------------------------------------------

describe('French', () => {
  afterEach(async () => { await act(() => i18n.changeLanguage('en')); });

  it('the chart date in the visit switcher and the menu follow the language', async () => {
    seedChart({ date: '2026-01-05', saved: true });
    sync.override = fakeCloud();
    await loadLanguage('fr');
    await act(() => i18n.changeLanguage('fr'));
    await frame();
    // Chart dates are language-neutral ISO; the saved-at time follows the language.
    expect(screen.getAllByRole('option')[1].textContent).toBe('2026-01-05 · précédente');
    expect(formatDate('2026-01-05', 'medium', 'fr')).toMatch(/janv/);
    expect(screen.getByText('Modifier le dossier')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ouvrir le menu des paramètres' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// English dates and times are exactly what the app showed before localization
// ---------------------------------------------------------------------------

describe('English dates', () => {
  beforeEach(() => act(restoreLocale));
  const norm = (s: string) => s.replace(/\s/g, ' ');
  const pill = () => norm(document.querySelector('.save-status--saved')!.textContent!);

  it('chart dates stay raw ISO and the saved-at time keeps the old format', async () => {
    seedChart({ date: '2026-01-05', saved: true });
    sync.override = fakeCloud();
    const first = await frame();
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['2026-11-12 · latest', '2026-01-05 · earlier']);
    first.unmount();

    // A new chart shows the saved-at pill (a saved visit is view-only and hides it).
    local.clear();
    seedChart();
    const at = new Date();
    sync.override = fakeCloud({ lastSavedAt: at.toISOString() });
    const view = await frame();
    expect(pill()).toBe(norm(`Saved · ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`));
    view.unmount();

    // Another day: short date, then the time.
    const earlier = new Date(2026, 10, 9, 14, 41);
    sync.override = fakeCloud({ lastSavedAt: earlier.toISOString() });
    await frame();
    const time = earlier.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const day = earlier.toLocaleDateString([], { month: 'short', day: 'numeric' });
    expect(pill()).toBe(norm(`Saved · ${day}, ${time}`));
  });
});
