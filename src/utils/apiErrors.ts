import i18n from '../i18n';

/**
 * Error text in the user's language.
 *
 * Edge functions send `{ error, code, params? }` (supabase/functions/_shared/
 * apiErrors.ts): `code` picks `common:errors.api.<code>`, and `error` is the
 * English text older clients show. Anything without a known code is raw
 * backend text: English users see it bare, as before; everyone else sees it
 * inside "Something went wrong (details: …)" so the sentence around it is
 * theirs.
 */

/** An Error whose message is already translated — shown as-is. */
export class LocalizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalizedError';
  }
}

/** A coded edge-function error. `message` is translated; `serverMessage` is
 *  the server's English text (for pattern checks that predate codes). */
export class ApiError extends LocalizedError {
  readonly code: string;
  readonly status?: number;
  readonly serverMessage: string;
  constructor(message: string, code: string, serverMessage: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.serverMessage = serverMessage;
    this.status = status;
  }
}

export interface ApiErrorBodyLike {
  error?: unknown;
  code?: unknown;
  params?: unknown;
}

const isEnglish = () => (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0] === 'en';

const apiKey = (code: string) => `errors.api.${code}`;

// Keys built at runtime (server codes, caller-chosen fallbacks) can't be
// checked against the typed catalog.
const looseT = (key: string, opts?: Record<string, unknown>): string =>
  (i18n.t as unknown as (k: string, o?: Record<string, unknown>) => string)(key, opts);

/** A code this client has a message for (plural codes have only _one/_other keys). */
export function isKnownApiCode(code: unknown): code is string {
  return typeof code === 'string' && /^[a-z_]+$/.test(code) &&
    (i18n.exists(apiKey(code), { ns: 'common' }) || i18n.exists(`${apiKey(code)}_other`, { ns: 'common' }));
}

/** Raw backend text for display: bare in English, wrapped elsewhere. */
export function withDetail(detail: string): string {
  return isEnglish() ? detail : i18n.t('errors.withDetail', { ns: 'common', detail });
}

/** Raw backend text placed after a sentence that already says what failed
 *  ("Couldn’t load your charts. {{error}}"): bare in English, "Details: …"
 *  elsewhere, so the user doesn't read two failure sentences. */
export function detailOnly(detail: string): string {
  return isEnglish() ? detail : i18n.t('errors.detailOnly', { ns: 'common', detail });
}

/** `err.message` for the detail slot after a "Couldn’t X." sentence:
 *  translated errors as-is, raw text via detailOnly, '' when there is none. */
export function detailText(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (!msg || err instanceof LocalizedError) return msg;
  return detailOnly(msg);
}

/** The message for an edge-function error body. */
export function apiErrorMessage(body: ApiErrorBodyLike | unknown, fallbackKey: string): string {
  const b = (body && typeof body === 'object' ? body : {}) as ApiErrorBodyLike;
  if (isKnownApiCode(b.code)) {
    const params = b.params && typeof b.params === 'object' ? (b.params as Record<string, unknown>) : {};
    return looseT(apiKey(b.code), { ns: 'common', ...params });
  }
  if (typeof b.error === 'string' && b.error) return withDetail(b.error);
  return looseT(fallbackKey);
}

/** Error to throw for an edge-function error body: a translated ApiError
 *  for a known code, else a plain Error with the raw text (friendlyError
 *  pattern-matches and wraps it). */
export function apiErrorFromBody(body: ApiErrorBodyLike, status?: number): Error {
  const raw = typeof body.error === 'string' ? body.error : '';
  if (isKnownApiCode(body.code)) return new ApiError(apiErrorMessage(body, 'common:errors.generic'), body.code, raw, status);
  return new Error(raw);
}

/** Display text for an error at a site that used to show `err.message`
 *  directly: translated errors as-is, raw text via withDetail. */
export function errorText(err: unknown, fallback: string): string {
  if (err instanceof LocalizedError) return err.message || fallback;
  const msg = err instanceof Error ? err.message : '';
  return msg ? withDetail(msg) : fallback;
}
