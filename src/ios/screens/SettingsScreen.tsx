import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavBar } from '../NavBar';
import { List, ListRow, ListSection } from '../List';
import { useStack, type StackScreen } from '../Stack';
import { useAppSettings } from '../appData';
import { confirmDialog } from '../../components/ui/dialogs';
import { supabase } from '../../utils/supabaseClient';
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
import { SettingsFixture } from './settingsFixture';

const CHEVRON = 'chevron' as const;
const SIGN_IN = 'signin' as const;
const SIGN_UP = 'signup' as const;
/** Pushed screen ids. */
const ID = {
  account: 'account',
  practice: 'practice',
  chart: 'chart-settings',
  reminders: 'reminders',
  gettingStarted: 'getting-started',
  whatsNew: 'whats-new',
  feedback: 'feedback',
  admin: 'admin',
} as const;

/** "Dr. Jane Ng" → "JN" (the Account row's avatar). */
export function initials(name: string): string {
  const words = name.replace(/^(dr\.?|doctor)\s+/i, '').split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return letters.map((w) => Array.from(w)[0]?.toLocaleUpperCase() ?? '').join('');
}

/** The signed-in account's email (the Account row's second line). */
function useAccountEmail(enabled: boolean): string {
  const [email, setEmail] = React.useState('');
  React.useEffect(() => {
    if (!enabled || !supabase) return undefined;
    let live = true;
    supabase.auth.getUser().then(({ data }) => {
      if (live) setEmail(data.user?.email ?? '');
    }).catch(() => {});
    // Follows an email change once it's confirmed.
    const sub = supabase.auth.onAuthStateChange?.((_event, session) => {
      if (live && session?.user?.email) setEmail(session.user.email);
    });
    return () => {
      live = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [enabled]);
  return email;
}

/**
 * Settings tab (root of its stack): an iOS Settings-style grouped list.
 * Each row pushes a native screen built from today's settings dialog
 * (the web keeps the dialogs). Availability follows the same rules as the
 * website's Settings menu: `useAppSettings().open.*` is set exactly when
 * that menu shows the item.
 *
 * The root NavBar leaves its leading slot empty: on iPad portrait the
 * shell's Show-sidebar button floats there.
 */
export function SettingsScreen() {
  return (
    <SettingsFixture>
      <SettingsList />
    </SettingsFixture>
  );
}

function SettingsList() {
  const { t } = useTranslation();
  const s = useAppSettings();
  const { push } = useStack();
  const email = useAccountEmail(!!s.open.account);

  const open = (id: string, title: string, render: StackScreen['render']) => () =>
    push({ id, title, render: () => <SettingsFixture>{render()}</SettingsFixture> });

  const signOut = async () => {
    if (!s.signOut) return;
    const ok = await confirmDialog({
      title: t('ios.settings.signOutTitle'),
      confirmLabel: t('actions.signOut'),
      danger: true,
    });
    if (ok) await s.signOut();
  };

  const accountTitle = s.profile.doctorName.trim() || t('ios.settings.account');

  return (
    <>
      <NavBar title={t('ios.tabs.settings')} largeTitle />
      <List className="ios-settings">
        {s.trial && s.requestAccount && (
          <ListSection>
            <ListRow title={t('ios.settings.signIn')} onClick={() => s.requestAccount?.(SIGN_IN)} />
            <ListRow title={t('topbar.signUp', { ns: 'app' })} onClick={() => s.requestAccount?.(SIGN_UP)} />
          </ListSection>
        )}
        {s.open.account && (
          <ListSection>
            <ListRow
              icon={<span className="ios-settings__avatar" aria-hidden="true">{initials(accountTitle)}</span>}
              title={accountTitle}
              subtitle={email || undefined}
              accessory={CHEVRON}
              onClick={open(ID.account, t('ios.settings.account'), () => <AccountSettingsScreen />)}
            />
          </ListSection>
        )}
        {s.open.practice && (
          <ListSection>
            <ListRow
              title={t('practice.title', { ns: 'settings' })}
              subtitle={s.profile.practiceName || undefined}
              accessory={CHEVRON}
              onClick={open(ID.practice, t('practice.title', { ns: 'settings' }), () => <PracticeSettingsScreen />)}
            />
          </ListSection>
        )}
        <ListSection>
          <ListRow
            title={t('chart.title', { ns: 'settings' })}
            accessory={CHEVRON}
            onClick={open(ID.chart, t('chart.title', { ns: 'settings' }), () => <ChartSettingsScreen />)}
          />
          {s.open.reminders && (
            <ListRow
              title={t('settings.title', { ns: 'reminders' })}
              accessory={CHEVRON}
              onClick={open(ID.reminders, t('settings.title', { ns: 'reminders' }), () => <RemindersSettingsScreen />)}
            />
          )}
        </ListSection>
        <ListSection header={t('ios.settings.help')}>
          <ListRow
            title={t('ios.settings.gettingStarted')}
            accessory={CHEVRON}
            onClick={open(ID.gettingStarted, t('ios.settings.gettingStarted'), () => <GettingStartedScreen />)}
          />
          <ListRow
            title={t('ios.settings.whatsNew')}
            accessory={CHEVRON}
            onClick={open(ID.whatsNew, t('ios.settings.whatsNew'), () => <WhatsNewScreen />)}
          />
          {s.open.feedback && (
            <ListRow
              title={t('feedback.title', { ns: 'settings' })}
              accessory={CHEVRON}
              onClick={open(ID.feedback, t('feedback.title', { ns: 'settings' }), () => <FeedbackScreen />)}
            />
          )}
        </ListSection>
        {s.open.admin && (
          <ListSection>
            <ListRow
              title={t('menu.admin.label', { ns: 'app' })}
              accessory={CHEVRON}
              onClick={open(ID.admin, t('menu.admin.label', { ns: 'app' }), () => <AdminScreen />)}
            />
          </ListSection>
        )}
        {s.signOut && (
          <ListSection>
            <ListRow title={t('actions.signOut')} destructive onClick={() => void signOut()} />
          </ListSection>
        )}
      </List>
    </>
  );
}
