import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../appData';
import type { UseProfileReturn } from '../../hooks/useProfile';
import type { UseTeamReturn } from '../../hooks/useTeam';

// The Settings tab's pushed screens, each with the real dialog body
// (`presentation="screen"`) and the backend hooks mocked.

vi.mock('../../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));
vi.mock('../../native/platform', () => ({ isNativeApp: () => true, WEB_ORIGIN: 'https://toothops.app/' }));
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../../utils/supabaseClient', () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
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
    members: [{ userId: 'me', email: 'me@vet.com', doctorName: '', role: 'owner', isYou: true, pending: false, isPrimaryOwner: true }],
    refresh: async () => {},
  } as unknown as UseTeamReturn,
}));
vi.mock('../../hooks/useTeam', () => ({ useTeam: () => team.current }));
const reminderSave = vi.hoisted(() => vi.fn(async () => {}));
const reminder = vi.hoisted(() => ({
  loaded: true,
  template: { subject: 'Recheck for {{patient}}', body: 'Hello {{owner}}', auto: false, leadDays: 0 },
  save: (...a: unknown[]) => reminderSave(...(a as [])),
}));
vi.mock('../../hooks/useReminderTemplate', () => ({ useReminderTemplate: () => reminder }));

import {
  AccountSettingsScreen,
  AdminScreen,
  ChartSettingsScreen,
  FeedbackScreen,
  GettingStartedScreen,
  PracticeSettingsScreen,
  RemindersSettingsScreen,
  WhatsNewScreen,
} from './settingsScreens';
import { AppDataProvider } from '../appData';
import { Stack, useStack } from '../Stack';
import { DialogHost } from '../../components/ui/dialogs';
import { ChartSettingsModal } from '../../components/ChartSettingsModal';
import { DEFAULT_CHART_PREFS } from '../../utils/chartSettings';
import { defaultConfig } from '../../utils/ownerReportConfig';

beforeAll(() => {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});
beforeEach(() => {
  vi.clearAllMocks();
});

function makeSettings(over: Partial<AppSettings> = {}): AppSettings {
  const fn = () => {};
  return {
    trial: false,
    cloudEnabled: true,
    isAdmin: true,
    aiEnabled: false,
    canFeedback: true,
    profile: {
      doctorName: 'Dr Jane Ng',
      practiceName: 'SoCal Vet',
      logoUrl: '',
      ownerReportEnabled: true,
      ownerReportConfig: defaultConfig(),
      saveOwnerReportConfig: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
    } as unknown as UseProfileReturn,
    prefs: DEFAULT_CHART_PREFS,
    prefsFollowAccount: true,
    setPref: vi.fn(),
    language: 'en',
    setLanguage: fn,
    activeSection: 'charting',
    goToSection: vi.fn(),
    open: { account: fn, practice: fn, chartSettings: fn, reminders: fn, walkthrough: vi.fn(), whatsNew: fn, feedback: fn, admin: fn },
    signOut: vi.fn(async () => {}),
    ...over,
  };
}

function Opener({ title, node }: { title: string; node: React.ReactNode }) {
  const { push } = useStack();
  return <button type="button" onClick={() => push({ id: 'x', title, render: () => node })}>Open</button>;
}

/** Settings root → push the screen; returns a rerender with new settings. */
function pushScreen(node: React.ReactNode, s: AppSettings = makeSettings(), title = 'Screen') {
  const tree = (value: AppSettings) => (
    <AppDataProvider library={null} settings={value}>
      <Stack root={<Opener title={title} node={node} />} rootTitle="Settings" />
      <DialogHost />
    </AppDataProvider>
  );
  const utils = render(tree(s));
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  return { ...utils, update: (next: AppSettings) => utils.rerender(tree(next)) };
}

const back = () => screen.getByRole('button', { name: /^Settings$|Settings/ });
const bar = (container: HTMLElement) => container.querySelector('.ios-stack__layer--pushed .ios-navbar__trailing') as HTMLElement;

describe('Settings tab screens', () => {
  it('Chart settings: switches and checkmark rows save right away and follow live prefs', () => {
    const s = makeSettings();
    const { update } = pushScreen(<ChartSettingsScreen />, s);
    expect(screen.queryByRole('dialog')).toBeNull();
    const mobility = screen.getAllByRole('switch', { name: 'Mobility' })[0];
    expect(mobility).toBeChecked();
    fireEvent.click(mobility);
    expect(s.setPref).toHaveBeenLastCalledWith({ hiddenColumns: ['mobility'] });
    fireEvent.click(screen.getByRole('button', { name: 'By tooth' }));
    expect(s.setPref).toHaveBeenLastCalledWith({ chartingView: 'tooth' });
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');

    update({ ...s, prefs: { ...DEFAULT_CHART_PREFS, chartingView: 'tooth', hiddenColumns: ['mobility'] } });
    expect(screen.getByRole('button', { name: 'By tooth' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('switch', { name: 'Mobility' })[0]).not.toBeChecked();
  });

  it('Recheck reminders: Save shows in the bar once edited; Back asks before discarding', async () => {
    const { container } = pushScreen(<RemindersSettingsScreen />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(bar(container)).queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.change(screen.getByDisplayValue('Recheck for {{patient}}'), { target: { value: 'Time for a recheck' } });
    const save = within(bar(container)).getByRole('button', { name: 'Save' });

    fireEvent.click(back());
    const alert = await screen.findByRole('alertdialog');
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Keep editing' })));
    expect(screen.getByDisplayValue('Time for a recheck')).toBeInTheDocument();

    await act(async () => fireEvent.click(save));
    expect(reminderSave).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Time for a recheck' }));
  });

  it('Practice settings: Save in the bar for a name edit; the screen stays after saving', async () => {
    const s = makeSettings();
    const { container } = pushScreen(<PracticeSettingsScreen />, s, 'Practice settings');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.change(screen.getByDisplayValue('SoCal Vet'), { target: { value: 'Harbor Vet' } });
    await act(async () => fireEvent.click(within(bar(container)).getByRole('button', { name: 'Save' })));
    expect(s.profile.update).toHaveBeenCalledWith({ practiceName: 'Harbor Vet', doctorName: 'Dr Jane Ng' });
    expect(screen.getByDisplayValue('Harbor Vet')).toBeInTheDocument();
  });

  it('Practice settings: Customize owner report pushes the templates screen', () => {
    pushScreen(<PracticeSettingsScreen />, makeSettings(), 'Practice settings');
    fireEvent.click(screen.getByRole('button', { name: 'Customize owner report' }));
    expect(screen.getByRole('heading', { name: 'Owner report' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Practice settings/ })).toHaveClass('ios-back-button');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Account: no Done button; Back asks about a typed doctor name', async () => {
    pushScreen(<AccountSettingsScreen />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    fireEvent.change(screen.getByDisplayValue('Dr Jane Ng'), { target: { value: 'Dr Jane Ng-Smith' } });
    fireEvent.click(back());
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
  });

  it('Send feedback: Send sits in the bar, sends the chart section, then goes back', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { container } = pushScreen(<FeedbackScreen />);
    const send = within(bar(container)).getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Love it' } });
    await act(async () => fireEvent.click(within(bar(container)).getByRole('button', { name: 'Send' })));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][1].body).toMatchObject({ message: 'Love it', context: { section: 'charting' } });
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('What’s new: the announcement without the dialog chrome', () => {
    pushScreen(<WhatsNewScreen />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Got it' })).toBeNull();
    expect(document.querySelector('.whats-new__group')).not.toBeNull();
  });

  it('Getting started: replays the tour, or shows a part of the chart', () => {
    const s = makeSettings();
    pushScreen(<GettingStartedScreen />, s);
    fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
    expect(s.open.walkthrough).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Patient & owner/ }));
    expect(s.goToSection).toHaveBeenCalledWith('patient');
  });

  it('Admin panel: the panel body in a pushed screen', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('offline') });
    pushScreen(<AdminScreen />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByRole('tablist')).toBeInTheDocument();
  });
});

describe('Chart settings opened from a chart page in the app', () => {
  it('is an iOS sheet with the settings list (switches, not checkboxes)', () => {
    const onChange = vi.fn();
    render(<ChartSettingsModal onClose={() => {}} prefs={DEFAULT_CHART_PREFS} followsAccount onChange={onChange} section="patient" />);
    const sheet = screen.getByRole('dialog');
    expect(sheet.closest('.ios-sheet-root')).not.toBeNull();
    expect(within(sheet).getByRole('heading', { name: 'Patient page settings' })).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('switch', { name: 'Hide the Recheck due field' }));
    expect(onChange).toHaveBeenLastCalledWith({ hideRecheck: true });
    expect(within(sheet).queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'All chart settings' }));
    expect(within(sheet).getByRole('heading', { name: 'Chart settings' })).toBeInTheDocument();
  });
});
