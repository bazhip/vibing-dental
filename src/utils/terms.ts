import { supabase } from './supabaseClient';

/**
 * Version of the Terms of Service / Privacy Policy / Data Processing
 * Addendum shown in the sign-in notices. Bump it (to the new "Last
 * updated" date) whenever public/terms.html, privacy.html or dpa.html
 * change materially, so acceptances record which text was agreed to.
 */
export const TERMS_VERSION = '2026-11-12';

/**
 * Acceptance is by notice ("By signing in you agree to…") — no checkbox.
 * We record it when the user takes the action the notice sits next to:
 * signing in or up (password or Google), or activating an invite.
 *
 * Google sign-in leaves the page before a session exists, so the click
 * leaves a short-lived marker here and the returning session records it.
 */
const PENDING_KEY = 'toothops.termsPending';
const PENDING_TTL_MS = 60 * 60 * 1000;

/** Call when the user clicks a sign-in/up button that shows the notice. */
export function markTermsPending(now = Date.now()): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ version: TERMS_VERSION, at: now }));
  } catch {
    /* storage unavailable — the acceptance just goes unrecorded */
  }
}

/** Record acceptance for the signed-in user. Fire-and-forget: a missing
 *  column (migration not applied), offline device or lost session just
 *  means nothing is recorded — never an error the user sees. */
export async function recordTermsAcceptance(userId: string, now = new Date()): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase
      .from('profiles')
      .update({ terms_version: TERMS_VERSION, terms_accepted_at: now.toISOString() })
      .eq('id', userId);
  } catch {
    /* see above */
  }
}

/** On a new session: record a sign-in that happened next to the notice
 *  (marker set within the last hour), then clear the marker. */
export function flushPendingTerms(userId: string, now = Date.now()): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_KEY);
    if (raw) localStorage.removeItem(PENDING_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const { version, at } = JSON.parse(raw) as { version?: string; at?: number };
    if (version !== TERMS_VERSION || typeof at !== 'number' || now - at > PENDING_TTL_MS) return;
    void recordTermsAcceptance(userId, new Date(at));
  } catch {
    /* malformed marker — ignore */
  }
}
