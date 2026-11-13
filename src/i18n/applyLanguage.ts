import i18n, { loadLanguage } from './index';
import type { AppLanguage } from './config';
import { writeStoredLanguage } from './storedLanguage';

export type ApplyResult = 'applied' | 'failed' | 'superseded';

// One counter for the whole app (device language, account language, switcher,
// boot): the latest request wins. A component unmounting does not cancel its
// request — the screen that replaces it may have no language hook yet.
let latest = 0;

/** Loads `lng`'s catalogs, then switches i18next and <html lang> to it, unless a
 *  newer request was made meanwhile. `remember` stores it as this device's
 *  choice once it applies. If the catalogs can't be fetched (offline) the
 *  language in effect stays; a later request retries. */
export async function applyLanguage(lng: AppLanguage, { remember = false } = {}): Promise<ApplyResult> {
  const request = ++latest;
  const ok = await loadLanguage(lng);
  if (request !== latest) return 'superseded';
  if (!ok) return 'failed';
  if (remember) writeStoredLanguage(lng);
  if (i18n.language !== lng) await i18n.changeLanguage(lng);
  // A newer request may have been made (and applied) while this one settled.
  if (request !== latest) return 'superseded';
  document.documentElement.lang = lng;
  return 'applied';
}
