import React from 'react';
import type { ChartListPage, ChartListQuery, CloudChartMeta } from '../hooks/useCloudSync';
import type { UseProfileReturn } from '../hooks/useProfile';
import type { ChartPrefs } from '../utils/chartSettings';
import type { AppLanguage } from '../i18n/config';
import type { SettingsSection } from '../components/ChartSettingsModal';

/**
 * What EntryGrid hands the app's Patients, Rechecks and Settings tabs.
 *
 * EntryGrid owns the chart state, cloud sync, profile and settings; in the
 * app it provides these values through context (AppDataProvider) around
 * the AppShell. Screens read them with useAppLibrary() / useAppSettings(),
 * which also works from pushed Stack screens (they must read live data
 * through hooks, not values captured when they were pushed).
 *
 * Context values are referentially stable: function identities never
 * change, and a new value object is provided only when one of its data
 * fields changes. EntryGrid hands each tab a hoisted element, so a chart
 * keystroke does NOT re-render the other tabs. Screens therefore must not
 * rely on parent re-renders: read everything through these hooks (and
 * useAppShell), and refetch lists when `libraryVersion` changes or when
 * their tab becomes active (useAppShell().activeTab).
 *
 * "Lands on the Chart tab" below always means the shell's single path:
 * Chart tab selected AND its stack popped to the root. To open a saved
 * visit from a screen, call useAppShell().openChart(id).
 */

/** Saved charts ("My charts"): the same operations ChartLibrary gets. */
export interface AppLibrary {
  /** Server-side listing: search, species, author, dueOnly (recheck date
   *  today or earlier), sort, pagination. */
  listCharts(query?: ChartListQuery): Promise<ChartListPage>;
  /** Bumped whenever saved charts may have changed: a chart save (autosave
   *  or Save), delete, clearRecalls, new visit, new patient. List screens
   *  refetch when it changes (and when their tab becomes active). */
  libraryVersion: number;
  /** Deletes one visit (the caller confirms first). Bumps libraryVersion. */
  deleteChart(id: string): Promise<void>;
  /** "+ Visit": a new visit carrying identity + missing/extracted teeth
   *  from the patient's latest visit; lands on the Chart tab. False when
   *  cancelled (unsaved-changes prompt, or opened today's visit instead
   *  — that one also lands on Chart and returns true). */
  newVisit(latestChartId: string): Promise<boolean>;
  /** A blank chart for a new patient (asks about unsaved changes); lands
   *  on the Chart tab when it went ahead. */
  newPatient(): Promise<boolean>;
  /** Import a ToothOps PDF into the chart (asks about unsaved changes);
   *  lands on the Chart tab when it went ahead. */
  loadPdf(file: File): Promise<boolean>;
  /** Opens today's reminder composer (ReminderModal) for a saved visit. */
  sendReminder(chart: CloudChartMeta): void;
  /** Clears the recheck date on these visits (mirrors the open chart).
   *  Bumps libraryVersion. */
  clearRecalls(chartIds: string[]): Promise<void>;
  /** Opens today's Chart history dialog for a visit (view-only, with
   *  "Open this visit", which lands on the Chart tab). */
  openHistory(chartId: string, label: string): void;
  /** The chart open in the Chart tab ('' for a new, unsaved chart). */
  openChartId: string;
}

/** Settings and account. `open.*` show today's web dialogs (interim, until
 *  the Settings tab pushes native screens built from the same props). */
export interface AppSettings {
  trial: boolean;
  /** Cloud sync on (signed in with a practice account). */
  cloudEnabled: boolean;
  isAdmin: boolean;
  /** AI dictation available (plan + signed in). */
  aiEnabled: boolean;
  /** Feedback form available (signed in, not trial). */
  canFeedback: boolean;
  profile: UseProfileReturn;
  prefs: ChartPrefs;
  /** Chart settings follow the account (vs. this device). */
  prefsFollowAccount: boolean;
  /** Save a chart setting (toasts on failure). */
  setPref(patch: Partial<ChartPrefs>): void;
  language: AppLanguage;
  setLanguage(language: AppLanguage): void;
  /** The chart's current section (for Feedback / Getting started). */
  activeSection: string;
  /** Show a chart section in the Chart tab (Getting started uses this). */
  goToSection(id: string): void;
  open: {
    account?(): void;
    practice?(): void;
    chartSettings(section?: SettingsSection): void;
    reminders?(): void;
    walkthrough(): void;
    whatsNew(): void;
    feedback?(): void;
    admin?(): void;
  };
  /** Signs out (cloud.signOut → signOutAndSweep); toasts on failure. The
   *  caller confirms first. Absent in trial. */
  signOut?(): Promise<void>;
  /** Trial only: leave the trial for sign-in / sign-up. */
  requestAccount?(mode: 'signup' | 'signin'): void;
}

const LibraryContext = React.createContext<AppLibrary | null>(null);
const SettingsContext = React.createContext<AppSettings | null>(null);

export function AppDataProvider({
  library,
  settings,
  children,
}: {
  /** null when cloud sync is off (trial): there are no saved charts. */
  library: AppLibrary | null;
  settings: AppSettings;
  children: React.ReactNode;
}) {
  return (
    <LibraryContext.Provider value={library}>
      <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
    </LibraryContext.Provider>
  );
}

/** Saved charts, or null when there are none to show (trial / signed out). */
export function useAppLibrary(): AppLibrary | null {
  return React.useContext(LibraryContext);
}

export function useAppSettings(): AppSettings {
  const s = React.useContext(SettingsContext);
  if (!s) throw new Error('useAppSettings() must be used inside <AppDataProvider>');
  return s;
}

/**
 * Wraps an object of functions so each keeps one identity for the life of
 * the component while always calling the latest version (for context
 * values that shouldn't change on every parent render).
 */
export function useStableFunctions<T extends Record<string, ((...args: never[]) => unknown) | undefined>>(fns: T): T {
  const latest = React.useRef(fns);
  latest.current = fns;
  const cache = React.useRef(new Map<string, unknown>());
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(fns)) {
    if (!fns[key]) {
      out[key] = undefined;
      continue;
    }
    let f = cache.current.get(key);
    if (!f) {
      f = (...args: unknown[]) => (latest.current[key] as ((...a: unknown[]) => unknown) | undefined)?.(...args);
      cache.current.set(key, f);
    }
    out[key] = f;
  }
  return out as T;
}
