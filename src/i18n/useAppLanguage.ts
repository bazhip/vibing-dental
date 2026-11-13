import { useEffect } from 'react';
import { applyLanguage } from './applyLanguage';
import { AppLanguage, LANGUAGE_SWITCHING_ENABLED } from './config';
import { resolveLanguage } from './resolveLanguage';
import { readStoredLanguage, writeStoredLanguage } from './storedLanguage';

/** Resolves the language in effect and applies it to i18next and <html lang>.
 *  Until account preferences have loaded, the language last picked on this device
 *  (localStorage `app.language`) is used, so nobody who chose one sees a
 *  browser-language flash. Once loaded, the account's choice wins. */
export function useAppLanguage(saved: AppLanguage | null, loaded: boolean): AppLanguage {
  const stored = readStoredLanguage();
  const choice = loaded ? (saved ?? stored) : stored;
  const lng = resolveLanguage(choice, navigator.languages ?? [], LANGUAGE_SWITCHING_ENABLED);

  // Remember the account's choice on this device for the next page load.
  useEffect(() => {
    if (LANGUAGE_SWITCHING_ENABLED && loaded && saved && saved !== stored) writeStoredLanguage(saved);
  }, [loaded, saved, stored]);

  // Not cancelled on unmount: the request stands until a newer one (from any
  // screen) supersedes it. Offline, the next change of `lng` retries.
  useEffect(() => {
    void applyLanguage(lng);
  }, [lng]);
  return lng;
}

/** Applies this device's language (the last pick in a LanguageSwitcher, else the
 *  browser's) on screens shown without the chart, which owns the account's choice:
 *  landing, sign-in, password reset. Signed in, the account's choice is mirrored
 *  into the device choice, so both agree. */
export function DeviceLanguage(): null {
  useAppLanguage(null, true);
  return null;
}
