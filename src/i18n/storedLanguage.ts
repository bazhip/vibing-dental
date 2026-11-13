import { AppLanguage, isAppLanguage } from './config';

/** The language last picked on this device, for pages shown before (or without)
 *  account preferences. */
const KEY = 'app.language';

export function readStoredLanguage(): AppLanguage | null {
  try {
    const v = localStorage.getItem(KEY);
    return isAppLanguage(v) ? v : null;
  } catch {
    return null; // storage unavailable (private mode, tests)
  }
}

export function writeStoredLanguage(lng: AppLanguage): void {
  try {
    localStorage.setItem(KEY, lng);
  } catch {
    /* storage unavailable: the choice still applies for this page view */
  }
}
