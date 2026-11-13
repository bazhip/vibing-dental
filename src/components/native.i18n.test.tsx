// Pseudo-locale coverage for what only the iOS app shows: the lock screen,
// Sign in with Apple, the inactive-plan screen, the app's sign-in and
// session screens, the app's sheets (finish setup, invitation, history,
// feedback, reminder, report templates, chart settings, what's new) and the
// chart forms' app layouts. Sample names and emails are fixture data.
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import type { UseProfileReturn } from '../hooks/useProfile';
import type { UseTeamReturn } from '../hooks/useTeam';
import type { ChartRevision } from '../hooks/useChartHistory';

vi.mock('../native/platform', () => ({ isNativeApp: () => true, WEB_ORIGIN: 'https://toothops.app/' }));
vi.mock('../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));
const lock = vi.hoisted(() => ({ unavailable: false }));
vi.mock('../native/appLock', () => ({
  useAppLock: () => ({ locked: true, covered: false, unavailable: lock.unavailable, unlock: vi.fn() }),
}));
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../utils/supabaseClient', () => ({
  cloudEnabled: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: { email: 'me@vet.com' } } }),
      signInWithPassword: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    functions: { invoke },
  },
}));
vi.mock('../hooks/useTeam', () => ({
  useTeam: () => ({ enabled: true, loaded: true, error: '', practice: { id: 'p1', name: 'Elm Vet' }, role: 'owner', members: [] }) as unknown as UseTeamReturn,
}));
vi.mock('../hooks/useReminderTemplate', async (orig) => ({
  ...(await orig<typeof import('../hooks/useReminderTemplate')>()),
  useReminderTemplate: () => ({ loaded: true, template: { subject: 'Recheck', body: 'Hello', auto: false, leadDays: 0 }, save: vi.fn() }),
}));
const history = vi.hoisted(() => ({ revisions: [] as ChartRevision[] }));
vi.mock('../hooks/useChartHistory', () => ({
  useChartHistory: () => ({ revisions: history.revisions, error: '', loadData: vi.fn(async () => ({})), reload: vi.fn() }),
}));
vi.mock('./AdminChartViewer', () => ({ ChartReadOnlyView: () => <div /> }));
// The two PDF previews are other screens: stub them so the sheet's own text is what's checked.
vi.mock('./PdfPreviewModal', () => ({ PdfPreviewModal: () => <div /> }));
vi.mock('./OwnerReportModal', () => ({ OwnerReportModal: () => <div /> }));

import { AppLockOverlay } from './AppLockOverlay';
import { AppleSignInButton, AppleSignInHint } from './AppleSignInButton';
import { ChartSettingsList } from './ChartSettingsList';
import { InactivePlan } from './InactivePlan';
import { SignOutLink } from './SignOutLink';
import { Login } from './Login';
import { SessionExpiredOverlay } from './SessionExpiredOverlay';
import { FinishSetupModal } from './FinishSetupModal';
import { JoinPracticeModal } from './JoinPracticeModal';
import { ChartHistoryModal } from './ChartHistoryModal';
import { FeedbackModal } from './FeedbackModal';
import { ReminderModal } from './ReminderModal';
import { ReportTemplatesModal } from './ReportTemplatesModal';
import { ChartSettingsModal } from './ChartSettingsModal';
import { WhatsNewModal } from './WhatsNewModal';
import { PatientForm } from './PatientForm';
import { ExamForm } from './ExamForm';
import { AnesthesiaForm } from './AnesthesiaForm';
import { DialogHost } from './ui/dialogs';
import { LANGUAGE_NAMES } from '../i18n/config';
import { DEFAULT_CHART_PREFS } from '../utils/chartSettings';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../types';
import { DocumentsModal } from './DocumentsModal';
import type { UseReportTemplatesReturn } from '../hooks/useReportTemplates';
import { defaultConfig } from '../utils/ownerReportConfig';

const ALLOW: (string | RegExp)[] = [
  'Elm Vet', 'Bella', 'me@vet.com', 'Dr. Ann Lee', 'Dental', 'Recheck', 'Hello', 'Body',
  // Language names are shown in their own language; drug names and units aren't translated.
  ...Object.values(LANGUAGE_NAMES), 'Ropivacaine', 'mL',
];

beforeAll(async () => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  await installPseudoLocale();
});
afterAll(restoreLocale);
afterEach(cleanup);

const profile = (over: Partial<UseProfileReturn> = {}) =>
  ({ practiceName: 'Elm Vet', doctorName: '', logoUrl: '', practiceId: '', loaded: true, update: vi.fn(), uploadLogo: vi.fn(), ...over }) as unknown as UseProfileReturn;

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const body = () => findUntranslated(document.body, ALLOW);

test('the lock screen, both with Face ID and without a passcode', () => {
  const a = render(<AppLockOverlay />);
  expect(body()).toEqual([]);
  a.unmount();
  lock.unavailable = true;
  render(<AppLockOverlay />);
  expect(body()).toEqual([]);
  lock.unavailable = false;
});

test('Sign in with Apple, its hint, the inactive plan and sign out', () => {
  render(
    <>
      <AppleSignInButton onError={() => {}} />
      <AppleSignInHint />
      <InactivePlan />
      <SignOutLink />
    </>,
  );
  expect(body()).toEqual([]);
});

test('the app\'s sign-in screen and the session-expired screen', () => {
  const a = render(<Login appMode onAuthenticate={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /⟦Show password⟧/ }));
  expect(body()).toEqual([]);
  a.unmount();
  render(<SessionExpiredOverlay email="me@vet.com" onSignOut={() => {}} />);
  expect(body()).toEqual([]);
});

test('chart settings as the app\'s list, everything and one page', () => {
  const a = render(<ChartSettingsList prefs={DEFAULT_CHART_PREFS} followsAccount onChange={() => {}} only={null} />);
  expect(body()).toEqual([]);
  a.unmount();
  render(<ChartSettingsList prefs={DEFAULT_CHART_PREFS} followsAccount={false} onChange={() => {}} only="anesthesia" onShowAll={() => {}} />);
  expect(body()).toEqual([]);
});

test('the app\'s sheets: finish setup, invitation, history, feedback, reminder', async () => {
  const need = { practice: true, doctor: true, suggestedDoctor: 'Dr. Ann Lee', userId: 'u1' };
  const a = render(<><FinishSetupModal need={need} profile={profile({ practiceName: '' })} onDone={() => {}} /><DialogHost /></>);
  expect(body()).toEqual([]);
  a.unmount();

  invoke.mockResolvedValue({ data: { practiceName: 'Elm Vet', alreadyMember: false }, error: null });
  const b = render(<JoinPracticeModal token="t" onDone={() => {}} />);
  await settle();
  expect(body()).toEqual([]);
  b.unmount();

  const c = render(<ChartHistoryModal chartId="c1" label="Bella" onClose={() => {}} />);
  expect(body()).toEqual([]);
  c.unmount();

  const d = render(<FeedbackModal onClose={() => {}} section="charting" transcript="hello" />);
  expect(findUntranslated(document.body, [...ALLOW, 'hello'])).toEqual([]);
  d.unmount();

  render(
    <ReminderModal open onClose={() => {}} practiceId="p1" practiceName="Elm Vet" chartId="c1" toEmail="me@vet.com" patientName="Bella" ownerName="" recheckDate="2026-12-01" />,
  );
  await settle();
  expect(body()).toEqual([]);
});

test('the app\'s sheets: report templates, chart settings, what\'s new', () => {
  const store = { templates: [{ id: 't1', name: 'Dental', body: 'Body' }], save: vi.fn(), remove: vi.fn(), loaded: true } as unknown as UseReportTemplatesReturn;
  const a = render(<ReportTemplatesModal open onClose={() => {}} store={store} />);
  expect(body()).toEqual([]);
  a.unmount();
  const b = render(<ChartSettingsModal onClose={() => {}} prefs={DEFAULT_CHART_PREFS} followsAccount onChange={() => {}} section="charting" />);
  expect(body()).toEqual([]);
  b.unmount();
  render(<WhatsNewModal onClose={() => {}} />);
  expect(body()).toEqual([]);
});

test('the chart forms\' app layouts: patient, exam, anesthesia', () => {
  const info = { patientName: 'Bella', patientNumber: '', date: '2026-11-12', tech: '', complaint: '', recallDate: '', ownerName: '', ownerPhone: '', ownerEmail: '' };
  render(
    <>
      <PatientForm patientInfo={info as never} species="canine" onPatientInfoChange={() => {}} onSpeciesChange={() => {}} />
      <ExamForm exam={{ ...EMPTY_EXAM_FINDINGS, tongue: { status: 'abnormal', comment: '' } }} onStatusChange={() => {}} onCommentChange={() => {}} />
      <AnesthesiaForm nerveBlocks={EMPTY_NERVE_BLOCKS} onNerveBlockChange={() => {}} onDrugsChange={() => {}} logo="vca" />
    </>,
  );
  expect(findUntranslated(document.body, [...ALLOW, /^\d/])).toEqual([]);
});

test('the Documents sheet, with and without the owner report', () => {
  const snap = { patientInfo: { patientName: 'Bella', date: '2026-11-12' } } as never;
  const owner = {
    snapshot: { patientInfo: { patientName: 'Bella', date: '2026-11-12' } } as never,
    branding: { practiceName: 'Elm Vet', doctorName: '', logoUrl: '' },
    imageRoles: {},
    chartId: 'c1',
    practiceId: 'p1',
    cloudActive: true,
    onEditWording: () => {},
    config: defaultConfig(),
  };
  const { rerender } = render(<DocumentsModal open onClose={() => {}} chartSnapshot={snap} />);
  expect(findUntranslated(document.body, [...ALLOW, /^Bella · /])).toEqual([]);
  rerender(<DocumentsModal open onClose={() => {}} chartSnapshot={snap} ownerReport={owner} initialTab="owner" />);
  expect(findUntranslated(document.body, [...ALLOW, /^Bella · /])).toEqual([]);
});
