import { call as teamCall } from '../hooks/useTeam';
import { confirmDialog, promptDialog, friendlyError, toast } from '../components/ui/dialogs';
import i18n from '../i18n';
import { supabase } from './supabaseClient';
import { markExplicitSignOut } from './signOutIntent';
import { clearChartStorage } from '../hooks/useChartState';

/**
 * Self-service deletion flows (team-api delete_account / delete_practice).
 * Each one: explain what goes → make the user type a confirmation → call
 * the server (which re-checks permissions and the typed text) → clear
 * local state and reload. Returns false when cancelled or refused.
 *
 * `reload` is injectable for tests.
 */

const reloadPage = () => window.location.reload();

export async function deleteMyAccount(
  email: string,
  reload: () => void = reloadPage
): Promise<boolean> {
  const t = i18n.getFixedT(null, 'account', 'deletion.account');
  const proceed = await confirmDialog({
    title: t('confirmTitle'),
    message: t('confirmMessage'),
    confirmLabel: t('continue'),
    danger: true,
  });
  if (!proceed) return false;
  const typed = await promptDialog({
    title: t('promptTitle'),
    message: t('promptMessage', { email }),
    label: t('emailLabel'),
    placeholder: email,
    confirmLabel: t('confirmButton'),
    validate: (v) => (v.trim().toLowerCase() === email.trim().toLowerCase() ? null : t('mismatch')),
  });
  if (typed === null) return false;
  try {
    await teamCall({ action: 'delete_account', confirm: typed.trim() });
  } catch (err) {
    toast(friendlyError(err, t('failed')), { kind: 'error' });
    return false;
  }
  // The account is gone; drop the session and every local trace of it.
  markExplicitSignOut();
  await supabase?.auth.signOut().catch(() => undefined);
  clearChartStorage();
  toast(t('done'), { kind: 'success' });
  reload();
  return true;
}

export async function deleteMyPractice(
  practiceName: string,
  reload: () => void = reloadPage
): Promise<boolean> {
  const t = i18n.getFixedT(null, 'account', 'deletion.practice');
  const name = practiceName.trim();
  // The typed confirmation token when the practice has no name; it is a
  // literal the user must type, so it is not translated.
  const expected = name || 'DELETE';
  const proceed = await confirmDialog({
    title: name ? t('confirmTitle', { name }) : t('confirmTitleUnnamed'),
    message: t('confirmMessage'),
    confirmLabel: t('continue'),
    danger: true,
  });
  if (!proceed) return false;
  const typed = await promptDialog({
    title: t('promptTitle'),
    message: name ? t('promptMessage', { name }) : t('promptMessageUnnamed'),
    label: name ? t('nameLabel') : t('confirmationLabel'),
    placeholder: expected,
    confirmLabel: t('confirmButton'),
    validate: (v) => (v.trim() === expected ? null : name ? t('mismatch') : t('mismatchUnnamed')),
  });
  if (typed === null) return false;
  try {
    await teamCall({ action: 'delete_practice', confirm: typed.trim() });
  } catch (err) {
    toast(friendlyError(err, t('failed')), { kind: 'error' });
    return false;
  }
  // The open chart may have been one of the practice's (now deleted) —
  // drop it locally so autosave can't recreate it, then reload so the
  // profile, team and billing state all start fresh.
  clearChartStorage();
  toast(t('done'), { kind: 'success' });
  reload();
  return true;
}
