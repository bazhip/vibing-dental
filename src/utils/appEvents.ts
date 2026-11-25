import { supabase } from './supabaseClient';

/**
 * App-wide outcome events, so failures can be found and fixed.
 *
 * Privacy: an event carries only counts, durations, field names and short
 * machine codes. Never pass transcript text, patient or owner data, or error
 * messages: the server also rejects free text, but the caller is the first
 * guard. Logging is fire-and-forget and must never delay or break the app.
 * Signed-out visitors log nothing (the server needs a signed-in user).
 */
export type EventArea = 'dictation' | 'save' | 'ai' | 'auth' | 'app';
export type EventOutcome = 'ok' | 'fail' | 'info';
type Scalar = string | number | boolean | null | undefined;
export type EventDetail = Record<string, Scalar | readonly string[]>;

const MAX_TEXT = 80;
const MAX_ITEM = 40;
const MAX_LIST = 20;
const CODE = /^[A-Za-z0-9_.-]{1,40}$/;

export function newSessionId(): string {
  return typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : '';
}

/** A short, text-free code for an error: its machine code, else its class name. */
export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && CODE.test(code)) return code;
  const name = error instanceof Error ? error.name : '';
  return CODE.test(name) ? name : 'unknown';
}

/** The innermost app frame of an error as `file:line`, never its message. */
export function errorWhere(error: unknown): string {
  const stack = error instanceof Error ? error.stack ?? '' : '';
  const frame = stack.split('\n').find(line => /\.(?:tsx?|jsx?|mjs):\d+/.test(line)) ?? '';
  const match = /([\w.-]+\.(?:tsx?|jsx?|mjs)):(\d+)/.exec(frame);
  return match ? `${match[1]}:${match[2]}` : 'unknown';
}

function clean(detail: EventDetail): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (!/^[a-z][a-z_0-9]{0,39}$/.test(key) || value === null || value === undefined) continue;
    if (typeof value === 'string') out[key] = value.slice(0, MAX_TEXT);
    else if (typeof value === 'number') { if (Number.isFinite(value)) out[key] = Math.round(value); }
    else if (typeof value === 'boolean') out[key] = value;
    else if (Array.isArray(value)) out[key] = value.slice(0, MAX_LIST).map(item => String(item).slice(0, MAX_ITEM));
  }
  return out;
}

export function logEvent(
  area: EventArea,
  stage: string,
  outcome: EventOutcome,
  detail: EventDetail = {},
  sessionId?: string | null,
): void {
  try {
    const client = supabase;
    if (!client) return;
    void Promise.resolve(client.rpc('log_app_event', {
      p_session_id: sessionId || null, p_area: area, p_stage: stage, p_outcome: outcome, p_detail: clean(detail),
    })).catch(() => {});
  } catch { /* telemetry never breaks the app */ }
}

const lastLogged = new Map<string, number>();
/** Like logEvent, but an identical event (same area, stage and detail) is sent at most once per
 *  interval. For failures that can repeat in a loop, such as a retrying autosave. */
export function logEventThrottled(
  area: EventArea, stage: string, outcome: EventOutcome, detail: EventDetail = {}, intervalMs = 60_000,
): void {
  const key = `${area}|${stage}|${outcome}|${JSON.stringify(clean(detail))}`;
  const now = Date.now();
  const previous = lastLogged.get(key);
  if (previous !== undefined && now - previous < intervalMs) return;
  if (lastLogged.size > 200) lastLogged.clear();
  lastLogged.set(key, now);
  logEvent(area, stage, outcome, detail);
}

let crashLogging = false;
/** Logs uncaught errors and unhandled rejections once per page, by code and location only. */
export function installCrashLogging(): void {
  if (crashLogging || typeof window === 'undefined') return;
  crashLogging = true;
  const seen = new Set<string>();
  const report = (stage: string, error: unknown) => {
    const detail = { code: errorCode(error), where: errorWhere(error) };
    const key = `${stage}:${detail.code}:${detail.where}`;
    if (seen.has(key) || seen.size >= 20) return; // one per distinct crash, per page load
    seen.add(key);
    logEvent('app', stage, 'fail', detail);
  };
  window.addEventListener('error', event => report('uncaught_error', event.error));
  window.addEventListener('unhandledrejection', event => report('unhandled_rejection', event.reason));
}
