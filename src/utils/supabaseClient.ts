import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared Supabase client. Configured via build-time env vars:
 *
 *   REACT_APP_SUPABASE_URL       — the project URL
 *   REACT_APP_SUPABASE_ANON_KEY  — the anon (public) key
 *
 * Both are public by design (they ship in the bundle; row-level security
 * is what protects the data). When they're absent the app runs in
 * standalone mode: legacy practice-password login, localStorage-only
 * persistence — which keeps local dev and the test suite working with
 * no project attached.
 */

const url = process.env.REACT_APP_SUPABASE_URL;
const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** True when the app is wired to a Supabase project. */
export const cloudEnabled = supabase !== null;
