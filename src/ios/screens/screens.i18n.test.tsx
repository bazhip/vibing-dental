// Pseudo-locale coverage for the iOS app's tabs: the shell, Patients,
// Rechecks, a patient's visits, Settings and each of its pushed screens, and
// the Chart tab's navigation bar. Sample patients, people and practice names
// are fixture data and allowed.
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../../i18n/testing/pseudo';
import type { AppSettings } from '../appData';
import type { UseProfileReturn } from '../../hooks/useProfile';
import type { UseTeamReturn } from '../../hooks/useTeam';

vi.mock('../../native/platform', () => ({ isNativeApp: () => true, WEB_ORIGIN: 'https://toothops.app/', initNativeShell: () => {} }));
vi.mock('../../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));
vi.mock('../../utils/supabaseClient', () => ({
  supabase: {
    functions: { invoke: vi.fn(async () => ({ data: null, error: new Error('offline') })) },
    auth: { getUser: async () => ({ data: { user: { email: 'me@vet.com' } } }) },
  },
  cloudEnabled: true,
}));
const team = vi.hoisted(() => ({
  current: {
    enabled: true,
    loaded: true,
    error: '',
    practice: { id: 'p1', name: 'SoCal Vet' },
    role: 'owner',
    primaryOwnerId: 'me',
    members: [
      { userId: 'u1', email: 'me@vet.com', doctorName: 'Dr Ames', role: 'owner', isYou: true, pending: false, isPrimaryOwner: true },
      { userId: 'u2', email: 'b@vet.com', doctorName: 'Dr Burke', role: 'member', isYou: false, pending: false, isPrimaryOwner: false },
    ],
    refresh: async () => {},
  } as unknown as UseTeamReturn,
}));
vi.mock('../../hooks/useTeam', () => ({ useTeam: () => team.current }));
vi.mock('../../hooks/useReminderTemplate', () => ({
  useReminderTemplate: () => ({
    loaded: true,
    template: { subject: 'Recheck', body: 'Hello', auto: false, leadDays: 0 },
    save: vi.fn(async () => {}),
  }),
}));
vi.mock('../../hooks/useBilling', () => ({ fetchBilling: () => new Promise(() => {}), openBillingPortal: vi.fn(), changePlan: vi.fn() }));
vi.mock('../../components/AdminPanel', () => ({ AdminPanel: () => null }));

import { AppShell, type AppTab } from '../AppShell';
import { AppDataProvider } from '../appData';
import { Stack } from '../Stack';
import { DialogHost } from '../../components/ui/dialogs';
import { PatientsScreen } from './PatientsScreen';
import { RechecksScreen } from './RechecksScreen';
import { SettingsScreen } from './SettingsScreen';
import { PatientVisitsScreen } from './patientShared';
import {
  AccountSettingsScreen,
  ChartSettingsScreen,
  FeedbackScreen,
  GettingStartedScreen,
  OwnerReportTemplatesScreen,
  PracticeSettingsScreen,
  RemindersSettingsScreen,
  WhatsNewScreen,
} from './settingsScreens';
import { ChartNavBar, ChartNotice } from '../chart/ChartNavBar';
import { fakeLibrary, meta } from './testHarness';
import { DEFAULT_CHART_PREFS } from '../../utils/chartSettings';
import { defaultConfig } from '../../utils/ownerReportConfig';
import { groupByPatient } from '../../components/chartLibraryData';
import { LANGUAGE_NAMES } from '../../i18n/config';
import { reportStrings } from '../../utils/ownerReportI18n';
import { BUILT_IN_SECTION_IDS, defaultSectionTitle } from '../../utils/ownerReportConfig';

function reportContent(): string[] {
  const strings = reportStrings('en');
  return [strings.intro('{pet}'), ...strings.homecareTips, ...BUILT_IN_SECTION_IDS.map((id) => strings.headings[id]('{pet}')), ...BUILT_IN_SECTION_IDS.map(defaultSectionTitle)];
}

// Fixture data: names, emails, numbers and dates.
const ALLOW: (string | RegExp)[] = [
  /^(Bella|Max|Coco)$/, /SoCal Vet/, /Dr (Jane Ng|Ames|Burke)/, /@vet\.com/, /^Ann\b/, /^JN$/, /^ToothOps$/,
  // Language names are shown in their own language.
  ...Object.values(LANGUAGE_NAMES),
  // Reminder placeholders and the sample template.
  /^\{\{\w+\}\}$/, 'Recheck', 'Hello',
  // Owner report templates show the report's own language (English here) and its placeholders.
  'Standard', /^\{\w+\}$/, ...reportContent(),
];

const ROWS = [
  meta({ id: 'a1', owner_name: 'Ann', owner_email: 'ann@vet.com', recall_date: '2026-11-01' }),
  meta({ id: 'b1', patient_name: 'Max', patient_number: '22', species: 'feline', chart_date: '2026-11-10', recall_date: '2026-11-13', created_by: 'u2' }),
  meta({ id: 'c1', patient_name: 'Coco', patient_number: '', recall_date: '2026-12-20' }),
];

function settings(over: Partial<AppSettings> = {}): AppSettings {
  const fn = () => {};
  return {
    trial: false,
    cloudEnabled: true,
    isAdmin: true,
    aiEnabled: true,
    canFeedback: true,
    profile: {
      doctorName: 'Dr Jane Ng',
      practiceName: 'SoCal Vet',
      logoUrl: '',
      loaded: true,
      ownerReportEnabled: true,
      ownerReportConfig: defaultConfig(),
      ownerReportConfigLoadFailed: false,
      saveOwnerReportConfig: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
    } as unknown as UseProfileReturn,
    prefs: DEFAULT_CHART_PREFS,
    prefsFollowAccount: true,
    setPref: fn,
    language: 'en',
    setLanguage: fn,
    activeSection: 'charting',
    goToSection: fn,
    open: { account: fn, practice: fn, chartSettings: fn, reminders: fn, walkthrough: fn, whatsNew: fn, feedback: fn, admin: fn },
    signOut: vi.fn(async () => {}),
    ...over,
  };
}

beforeAll(async () => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  URL.createObjectURL = URL.createObjectURL ?? (() => 'blob:x');
  await installPseudoLocale();
});
afterAll(restoreLocale);
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 13, 9, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function shell(tab: AppTab, s: AppSettings = settings()) {
  return render(
    <AppDataProvider library={fakeLibrary(ROWS)} settings={s}>
      <AppShell
        activeTab={tab}
        onTabChange={() => {}}
        onOpenChart={async () => true}
        chart={<span />}
        patients={<PatientsScreen />}
        rechecks={<RechecksScreen />}
        settings={<SettingsScreen />}
      />
      <DialogHost />
    </AppDataProvider>,
  );
}

const panel = (tab: AppTab) => document.querySelector<HTMLElement>(`[data-app-tab="${tab}"]`)!;

test.each(['patients', 'rechecks', 'settings'] as AppTab[])('the %s tab is fully translated', async (tab) => {
  shell(tab);
  await settle();
  expect(findUntranslated(panel(tab), ALLOW)).toEqual([]);
  // The tab bar / sidebar too.
  expect(findUntranslated(document.body, ALLOW)).toEqual([]);
});

test('Settings in the trial (no account) is fully translated', async () => {
  shell('settings', settings({ trial: true, cloudEnabled: false, isAdmin: false, canFeedback: false, signOut: undefined, requestAccount: vi.fn() }));
  await settle();
  expect(findUntranslated(document.body, ALLOW)).toEqual([]);
});

test('a patient\'s visits screen is fully translated', async () => {
  const [group] = groupByPatient(ROWS.filter((r) => r.patient_name === 'Max'));
  render(
    <AppDataProvider library={fakeLibrary(ROWS)} settings={settings()}>
      <AppShell
        activeTab="patients"
        onTabChange={() => {}}
        onOpenChart={async () => true}
        chart={<span />}
        patients={<PatientVisitsScreen initial={group} filters={{}} tab="patients" />}
        rechecks={<span />}
        settings={<span />}
      />
      <DialogHost />
    </AppDataProvider>,
  );
  await settle();
  expect(findUntranslated(document.body, ALLOW)).toEqual([]);
});

const SCREENS: [string, React.ReactNode][] = [
  ['Account', <AccountSettingsScreen key="a" />],
  ['Practice', <PracticeSettingsScreen key="p" />],
  ['Owner report templates', <OwnerReportTemplatesScreen key="o" />],
  ['Chart settings', <ChartSettingsScreen key="c" />],
  ['Recheck reminders', <RemindersSettingsScreen key="r" />],
  ['Getting started', <GettingStartedScreen key="g" />],
  ['What’s new', <WhatsNewScreen key="w" />],
  ['Feedback', <FeedbackScreen key="f" />],
];

test.each(SCREENS)('Settings → %s is fully translated', async (_name, node) => {
  render(
    <AppDataProvider library={null} settings={settings()}>
      <Stack root={node} />
      <DialogHost />
    </AppDataProvider>,
  );
  await settle();
  expect(findUntranslated(document.body, ALLOW)).toEqual([]);
});

test('the Chart tab\'s navigation bar and notices are translated', async () => {
  render(
    <>
      <ChartNavBar
        title="Bella"
        subtitle=""
        sections={[{ id: 'patient', label: '⟦Patient⟧' }]}
        activeSection="patient"
        onSection={() => {}}
        shareLabel="⟦Share⟧"
        menu={[{ label: '⟦History⟧', onSelect: () => {} }]}
        onEdit={() => {}}
      />
      <ChartNotice tone="warning" text="⟦Open elsewhere⟧" actionLabel="⟦Got it⟧" onAction={() => {}} />
    </>,
  );
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /More/ })); });
  expect(findUntranslated(document.body, ALLOW)).toEqual([]);
});
