import { supabase } from '../utils/supabaseClient';
import type { AppLanguage } from './config';

// user.id:language pairs already handled this page session, so rerenders and
// remounts never repeat the call (a failed call is not retried until reload).
const done = new Set<string>();

/** Supabase auth emails read `user_metadata.language`. Writes it when the signed-in
 *  user's metadata differs from `language`: covers accounts that predate the
 *  setting and ones whose language was resolved from the device. Fire and forget. */
export function syncAuthLanguage(language: AppLanguage): void {
  if (!supabase) return;
  void supabase.auth
    .getSession()
    .then(({ data }) => {
      const user = data.session?.user;
      if (!user || user.user_metadata?.language === language) return;
      const key = `${user.id}:${language}`;
      if (done.has(key)) return;
      done.add(key);
      return supabase!.auth.updateUser({ data: { language } });
    })
    .catch(() => undefined);
}

/** Test hook. */
export const resetSyncedAuthLanguage = () => done.clear();
