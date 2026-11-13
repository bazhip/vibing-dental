import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '../appData';
import type { UseProfileReturn } from '../../hooks/useProfile';

vi.mock('../../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));
vi.mock('../../native/platform', () => ({ isNativeApp: () => true, WEB_ORIGIN: 'https://toothops.app/' }));
vi.mock('../../utils/supabaseClient', () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: { email: 'me@vet.com' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
  cloudEnabled: true,
}));
// The pushed screens have their own tests; here each is a marker.
vi.mock('./settingsScreens', () => {
  const marker = (name: string) => () => <p>{name} screen body</p>;
  return {
    AccountSettingsScreen: marker('Account'),
    PracticeSettingsScreen: marker('Practice'),
    ChartSettingsScreen: marker('Chart settings'),
    RemindersSettingsScreen: marker('Reminders'),
    GettingStartedScreen: marker('Getting started'),
    WhatsNewScreen: marker('What’s new'),
    FeedbackScreen: marker('Feedback'),
    AdminScreen: marker('Admin'),
  };
});

import { SettingsScreen } from './SettingsScreen';
import { AppDataProvider } from '../appData';
import { Stack } from '../Stack';
import { DialogHost } from '../../components/ui/dialogs';

function settings(over: Partial<AppSettings> = {}): AppSettings {
  const fn = () => {};
  return {
    trial: false,
    cloudEnabled: true,
    isAdmin: true,
    aiEnabled: true,
    canFeedback: true,
    profile: { doctorName: 'Dr Jane Ng', practiceName: 'SoCal Vet' } as UseProfileReturn,
    prefs: {} as AppSettings['prefs'],
    prefsFollowAccount: true,
    setPref: fn,
    language: 'en',
    setLanguage: fn,
    activeSection: 'patient',
    goToSection: fn,
    open: { account: fn, practice: fn, chartSettings: fn, reminders: fn, walkthrough: fn, whatsNew: fn, feedback: fn, admin: fn },
    signOut: vi.fn(async () => {}),
    ...over,
  };
}

function renderSettings(s: AppSettings = settings()) {
  return render(
    <AppDataProvider library={null} settings={s}>
      <Stack root={<SettingsScreen />} rootTitle="Settings" />
      <DialogHost />
    </AppDataProvider>,
  );
}

describe('SettingsScreen', () => {
  it('has a large title and leaves the leading bar slot empty (iPad Show-sidebar button)', () => {
    const { container } = renderSettings();
    expect(screen.getByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    const leading = container.querySelector('.ios-navbar__leading');
    expect(leading?.childElementCount ?? 0).toBe(0);
  });

  it('the Account row shows the name and the sign-in email', async () => {
    renderSettings();
    const row = screen.getByRole('button', { name: /Dr Jane Ng/ });
    await waitFor(() => expect(row).toHaveTextContent('me@vet.com'));
  });

  it.each([
    [/Dr Jane Ng/, 'Account'],
    [/Practice settings/, 'Practice'],
    [/Chart settings/, 'Chart settings'],
    [/Recheck reminders/, 'Reminders'],
    [/Getting started/, 'Getting started'],
    [/What’s new/, 'What’s new'],
    [/Send feedback/, 'Feedback'],
    [/Admin panel/, 'Admin'],
  ])('row %s pushes its screen with a Back button to Settings', async (row, marker) => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: row }));
    expect(screen.getByText(`${marker} screen body`)).toBeInTheDocument();
    const back = screen.getByRole('button', { name: /Settings/ });
    expect(back).toHaveClass('ios-back-button');
    fireEvent.click(back);
    await waitFor(() => expect(screen.queryByText(`${marker} screen body`)).toBeNull());
  });

  it('does not open today’s web dialogs', async () => {
    const s = settings();
    const spies = Object.fromEntries(Object.keys(s.open).map((k) => [k, vi.fn()]));
    renderSettings({ ...s, open: spies as unknown as AppSettings['open'] });
    for (const name of [/Dr Jane Ng/, /Practice settings/, /Chart settings/, /Recheck reminders/, /Getting started/, /What’s new/, /Send feedback/, /Admin panel/]) {
      fireEvent.click(screen.getByRole('button', { name }));
      fireEvent.click(screen.getByRole('button', { name: /Settings/ }));
      await waitFor(() => expect(screen.queryByText(/screen body/)).toBeNull());
    }
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it('shows the Admin panel row only for admins', () => {
    renderSettings(settings({ isAdmin: false, open: { ...settings().open, admin: undefined } }));
    expect(screen.queryByRole('button', { name: /Admin panel/ })).toBeNull();
  });

  it('hides account-only rows in the trial and offers sign-in instead', () => {
    const s = settings();
    renderSettings(settings({
      trial: true,
      cloudEnabled: false,
      isAdmin: false,
      canFeedback: false,
      open: { chartSettings: s.open.chartSettings, walkthrough: s.open.walkthrough, whatsNew: s.open.whatsNew },
      signOut: undefined,
      requestAccount: vi.fn(),
    }));
    expect(screen.queryByRole('button', { name: /Dr Jane Ng/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Practice settings/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Recheck reminders/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Send feedback/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chart settings/ })).toBeInTheDocument();
  });

  it('Sign out is its own destructive group and signs out only after the iOS confirm', async () => {
    const s = settings();
    renderSettings(s);
    const row = screen.getByRole('button', { name: 'Sign out' });
    expect(row).toHaveClass('ios-row--destructive');
    expect(within(row.closest('.ios-list__group') as HTMLElement).getAllByRole('button')).toHaveLength(1);

    fireEvent.click(row);
    let alert = await screen.findByRole('alertdialog');
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Cancel' })));
    expect(s.signOut).not.toHaveBeenCalled();

    fireEvent.click(row);
    alert = await screen.findByRole('alertdialog');
    expect(alert).toHaveTextContent('Sign out of ToothOps?');
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Sign out' })));
    await waitFor(() => expect(s.signOut).toHaveBeenCalledTimes(1));
  });
});
