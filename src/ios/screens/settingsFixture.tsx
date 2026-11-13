import React from 'react';
import { AppDataProvider, useAppLibrary, useAppSettings, type AppSettings } from '../appData';
import { toast } from '../../components/ui/dialogs';

/**
 * DEV-only fixture for previewing the Settings tab as a signed-in admin
 * without a cloud account: open the dev server with
 * `?iosPreview=1&iosSettingsFixture=1` (trial chart). The rows that need
 * an account (Account, Practice, Recheck reminders, Send feedback, Admin
 * panel, Sign out) then show with sample names. Their screens still talk
 * to the real backend, so data they load themselves (team, billing,
 * admin lists) shows its signed-out state.
 *
 * Loaded only through a DEV-only dynamic import in SettingsScreen, so
 * production bundles never contain it.
 */
/* eslint-disable i18next/no-literal-string -- DEV-only sample data */
const SIGNED_OUT = 'Signed out (preview fixture)';
export default function FixtureProvider({ children }: { children: React.ReactNode }) {
  const real = useAppSettings();
  const library = useAppLibrary();
  const settings = React.useMemo<AppSettings>(() => {
    const noop = () => {};
    return {
      ...real,
      trial: false,
      cloudEnabled: true,
      isAdmin: true,
      canFeedback: true,
      profile: { ...real.profile, doctorName: 'Dr. Jane Ng', practiceName: 'Harbor Veterinary Dental', ownerReportEnabled: true },
      open: { ...real.open, account: noop, practice: noop, reminders: noop, feedback: noop, admin: noop },
      signOut: async () => {
        toast(SIGNED_OUT);
      },
      requestAccount: undefined,
    };
  }, [real]);
  return (
    <AppDataProvider library={library} settings={settings}>
      {children}
    </AppDataProvider>
  );
}
/* eslint-enable i18next/no-literal-string */
