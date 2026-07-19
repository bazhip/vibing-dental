import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

/** True when the app is wired to a Supabase project. */
export const cloudEnabled = supabase !== null;
