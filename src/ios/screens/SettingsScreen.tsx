import { useTranslation } from 'react-i18next';
import { NavBar } from '../NavBar';
import { List, ListRow, ListSection } from '../List';
import { useAppSettings } from '../appData';
import { confirmDialog } from '../../components/ui/dialogs';


const CHEVRON = 'chevron' as const;
const SIGN_IN = 'signin' as const;
const SIGN_UP = 'signup' as const;
/**
 * Settings tab — PLACEHOLDER (Task 6 replaces this file with pushed
 * native screens). Each row opens today's dialog through useAppSettings().
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const s = useAppSettings();

  const signOut = async () => {
    if (!s.signOut) return;
    const ok = await confirmDialog({
      title: t('ios.settings.signOutTitle'),
      confirmLabel: t('actions.signOut'),
      danger: true,
    });
    if (ok) await s.signOut();
  };

  return (
    <>
      <NavBar title={t('ios.tabs.settings')} largeTitle />
      <List>
        {s.trial && s.requestAccount && (
          <ListSection>
            <ListRow title={t('ios.settings.signIn')} onClick={() => s.requestAccount?.(SIGN_IN)} />
            <ListRow title={t('ios.settings.createAccount')} onClick={() => s.requestAccount?.(SIGN_UP)} />
          </ListSection>
        )}
        <ListSection>
          {s.open.account && <ListRow title={t('ios.settings.account')} subtitle={s.profile.doctorName || undefined} accessory={CHEVRON} onClick={s.open.account} />}
          {s.open.practice && <ListRow title={t('ios.settings.practice')} subtitle={s.profile.practiceName || undefined} accessory={CHEVRON} onClick={s.open.practice} />}
          <ListRow title={t('ios.settings.chart')} accessory={CHEVRON} onClick={() => s.open.chartSettings()} />
          {s.open.reminders && <ListRow title={t('ios.settings.reminders')} accessory={CHEVRON} onClick={s.open.reminders} />}
        </ListSection>
        <ListSection header={t('ios.settings.help')}>
          <ListRow title={t('ios.settings.gettingStarted')} accessory={CHEVRON} onClick={s.open.walkthrough} />
          <ListRow title={t('ios.settings.whatsNew')} accessory={CHEVRON} onClick={s.open.whatsNew} />
          {s.open.feedback && <ListRow title={t('ios.settings.feedback')} accessory={CHEVRON} onClick={s.open.feedback} />}
        </ListSection>
        {s.open.admin && (
          <ListSection>
            <ListRow title={t('ios.settings.admin')} accessory={CHEVRON} onClick={s.open.admin} />
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
