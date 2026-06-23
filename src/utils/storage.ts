/**
 * Unified localStorage accessor.
 *
 * Every read / write in the app should go through here so we have a single
 * place to:
 *   - swallow errors safely (private browsing, quota exhausted, JSON parse
 *     failure on stale data) without scattering try/catch all over,
 *   - tag keys with a project prefix so we never collide with other apps
 *     served from the same origin,
 *   - rev the schema later (bump VERSION + migrate) without grepping
 *     every call site.
 *
 * Keys are versioned with a `vN` suffix per-key so individual entries can
 * evolve independently — the helpers expose that as a parameter rather
 * than baking version numbers into every call site.
 */

const PROJECT_PREFIX = 'vibing-dental';

function fullKey(key: string, version: number): string {
  return `${PROJECT_PREFIX}.${key}.v${version}`;
}

// Surface a full-storage condition exactly once per session. Silently
// dropping writes means a user keeps charting while nothing is being
// saved — for a clinical tool that's a data-loss trap, so we warn them
// to export to PDF. Kept non-fatal: a failed alert never breaks a write.
let quotaWarned = false;
function handleWriteError(err: unknown): void {
  const isQuota =
    typeof DOMException !== 'undefined' &&
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22);
  if (!isQuota || quotaWarned) return;
  quotaWarned = true;
  try {
    // eslint-disable-next-line no-console
    console.warn('[storage] localStorage is full — changes may not be saved.');
    window.alert(
      'Storage is full — recent changes may not be saved. ' +
        'Export your chart to PDF to avoid losing work.'
    );
  } catch {
    // non-browser env or alert blocked — the console.warn still fired
  }
}

/** Read a JSON value. Returns `fallback` when the key is missing, the
 *  storage isn't available, or the saved value can't be parsed. */
export function readJson<T>(key: string, version: number, fallback: T): T {
  try {
    const raw = localStorage.getItem(fullKey(key, version));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Persist a JSON value. Failures (private mode, quota) are swallowed —
 *  there's nothing useful to do at the call site if writes don't stick. */
export function writeJson(key: string, version: number, value: unknown): void {
  try {
    localStorage.setItem(fullKey(key, version), JSON.stringify(value));
  } catch (err) {
    handleWriteError(err);
  }
}

/** Remove a key. */
export function removeKey(key: string, version: number): void {
  try {
    localStorage.removeItem(fullKey(key, version));
  } catch {
    // ignore
  }
}

/** Read a plain string (skips JSON parse). Used for tiny scalars where
 *  the JSON quoting noise isn't worth it (e.g. a single boolean or id). */
export function readString(key: string, version: number, fallback: string): string {
  try {
    const raw = localStorage.getItem(fullKey(key, version));
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}

/** Persist a plain string. */
export function writeString(key: string, version: number, value: string): void {
  try {
    localStorage.setItem(fullKey(key, version), value);
  } catch (err) {
    handleWriteError(err);
  }
}
