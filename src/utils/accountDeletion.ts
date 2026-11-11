import { call as teamCall } from '../hooks/useTeam';
import { confirmDialog, promptDialog, friendlyError, toast } from '../components/ui/dialogs';
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
  const proceed = await confirmDialog({
    title: 'Delete your account?',
    message:
      'This permanently deletes your account, your private charts, and their photos and radiographs. ' +
      'Charts you shared with a practice stay with that practice. ' +
      'If you’re the only person in your practice, the practice and all its charts are deleted too, ' +
      'and any subscription is cancelled. This can’t be undone.',
    confirmLabel: 'Continue',
    danger: true,
  });
  if (!proceed) return false;
  const typed = await promptDialog({
    title: 'Confirm account deletion',
    message: `Type your email (${email}) to permanently delete your account.`,
    label: 'Email',
    placeholder: email,
    confirmLabel: 'Delete my account',
    validate: (v) => (v.trim().toLowerCase() === email.trim().toLowerCase() ? null : 'Type your email exactly.'),
  });
  if (typed === null) return false;
  try {
    await teamCall({ action: 'delete_account', confirm: typed.trim() });
  } catch (err) {
    toast(friendlyError(err, 'Could not delete your account.'), { kind: 'error' });
    return false;
  }
  // The account is gone; drop the session and every local trace of it.
  markExplicitSignOut();
  await supabase?.auth.signOut().catch(() => undefined);
  clearChartStorage();
  toast('Your account has been deleted.', { kind: 'success' });
  reload();
  return true;
}

export async function deleteMyPractice(
  practiceName: string,
  reload: () => void = reloadPage
): Promise<boolean> {
  const name = practiceName.trim();
  const expected = name || 'DELETE';
  const proceed = await confirmDialog({
    title: `Delete ${name ? `“${name}”` : 'this practice'}?`,
    message:
      'This permanently deletes the practice and every chart shared with it — including charts your ' +
      'team members created — along with their photos and radiographs. Any subscription is cancelled ' +
      'immediately. Team members keep their accounts and their private charts. This can’t be undone.',
    confirmLabel: 'Continue',
    danger: true,
  });
  if (!proceed) return false;
  const typed = await promptDialog({
    title: 'Confirm practice deletion',
    message: name
      ? `Type the practice name (${name}) to permanently delete it.`
      : 'Type DELETE to permanently delete this practice.',
    label: name ? 'Practice name' : 'Confirmation',
    placeholder: expected,
    confirmLabel: 'Delete practice',
    validate: (v) => (v.trim() === expected ? null : name ? 'Type the practice name exactly.' : 'Type DELETE.'),
  });
  if (typed === null) return false;
  try {
    await teamCall({ action: 'delete_practice', confirm: typed.trim() });
  } catch (err) {
    toast(friendlyError(err, 'Could not delete the practice.'), { kind: 'error' });
    return false;
  }
  // The open chart may have been one of the practice's (now deleted) —
  // drop it locally so autosave can't recreate it, then reload so the
  // profile, team and billing state all start fresh.
  clearChartStorage();
  toast('The practice has been deleted.', { kind: 'success' });
  reload();
  return true;
}
