import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { isNativeApp } from './platform';

/**
 * `supabase.auth.getSession()`, tolerant of launching the app offline.
 *
 * Once the access token has expired (~1 h), getSession() tries a refresh;
 * offline that fails with an AuthRetryableFetchError and it reports
 * `session: null` — yet the session is still in storage and will refresh
 * fine once the connection returns. In the app, treat that as still signed
 * in and hand back the stored session (its user id keys the offline
 * billing cache). A real expiry is caught later, online, by App's
 * confirmSessionLost path. On the website this is plain getSession().
 */
export async function getSessionTolerant(
  client: SupabaseClient
): Promise<{ session: Session | null; offline: boolean }> {
  const { data, error } = await client.auth.getSession();
  if (data.session) return { session: data.session, offline: false };
  if (!isNativeApp() || !isAuthRetryableFetchError(error)) return { session: null, offline: false };
  const stored = readStoredSession(client);
  return stored ? { session: stored, offline: true } : { session: null, offline: false };
}

function readStoredSession(client: SupabaseClient): Session | null {
  try {
    // auth-js keeps its storage key on the client (protected in the types).
    const key = (client.auth as unknown as { storageKey?: string }).storageKey;
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session> | null;
    if (!s || typeof s.refresh_token !== 'string' || typeof s.user?.id !== 'string') return null;
    return s as Session;
  } catch {
    return null;
  }
}
