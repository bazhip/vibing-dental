import { AppLanguage, isAppLanguage } from './config';

/** Saved choice, then the browser's first supported language, else English.
 *  While switching is disabled the app is always English. */
export function resolveLanguage(
  saved: AppLanguage | null,
  browser: readonly string[],
  enabled: boolean,
): AppLanguage {
  if (!enabled) return 'en';
  if (saved) return saved;
  for (const tag of browser) {
    const base = tag.split('-')[0].toLowerCase();
    if (isAppLanguage(base)) return base;
  }
  return 'en';
}
