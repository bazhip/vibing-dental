import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isNativeApp } from '../native/platform';
import { isExtensionPage } from './extensionPage';

/**
 * Shared Supabase client. Configured via build-time env vars:
 *
 *   VITE_SUPABASE_URL       — the project URL
 *   VITE_SUPABASE_ANON_KEY  — the anon (public) key
 *
 * Both are public by design (they ship in the bundle; row-level security
 * is what protects the data). When they're absent the app runs in
 * standalone mode: legacy practice-password login, localStorage-only
 * persistence — which keeps local dev and the test suite working with
 * no project attached.
 */

// `?.`: scripts/replay-transcript.ts imports this outside Vite (no import.meta.env).
const url = import.meta.env?.VITE_SUPABASE_URL;
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

// In the app, auth flows finish in the system browser and come back
// through `toothops://auth-callback` (src/native/authReturn.ts), which
// exchanges a PKCE code — there's no auth data in the app's own URL.
// The Chrome extension's side panel likewise finishes OAuth through
// chrome.identity with a PKCE code (src/extension/sidepanel/oauth.ts).
// The web client is configured exactly as before.
export const supabase: SupabaseClient | null =
  url && anonKey
    ? isNativeApp() || isExtensionPage()
      ? createClient(url, anonKey, { auth: { flowType: 'pkce', detectSessionInUrl: false } })
      : createClient(url, anonKey)
    : null;

/** True when the app is wired to a Supabase project. */
export const cloudEnabled = supabase !== null;
