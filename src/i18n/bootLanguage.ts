import { LANGUAGE_SWITCHING_ENABLED } from './config';
import { applyLanguage } from './applyLanguage';
import { resolveLanguage } from './resolveLanguage';
import { readStoredLanguage } from './storedLanguage';

/** Before the first render: switches to this device's language (last pick, else
 *  the browser's) so non-English users don't see English first. Returns null when
 *  that is English — render at once — else a promise that settles once the
 *  language applies or after `timeoutMs`, whichever is first. On timeout the app
 *  renders in English and switches when the catalogs arrive. */
export function bootLanguage(timeoutMs = 1500): Promise<void> | null {
  const lng = resolveLanguage(readStoredLanguage(), navigator.languages ?? [], LANGUAGE_SWITCHING_ENABLED);
  if (lng === 'en') return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  const applied = applyLanguage(lng).then(() => undefined);
  return Promise.race([applied, timeout]).finally(() => clearTimeout(timer));
}
