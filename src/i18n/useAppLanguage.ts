import { useEffect } from 'react';
import i18n from './index';
import { AppLanguage, LANGUAGE_SWITCHING_ENABLED } from './config';
import { resolveLanguage } from './resolveLanguage';

/** Resolves the language in effect and applies it to i18next and <html lang>.
 *  Logged-out pages pass the value from localStorage (key `app.language`). */
export function useAppLanguage(saved: AppLanguage | null): AppLanguage {
  const lng = resolveLanguage(saved, navigator.languages ?? [], LANGUAGE_SWITCHING_ENABLED);
  useEffect(() => {
    if (i18n.language !== lng) void i18n.changeLanguage(lng);
    document.documentElement.lang = lng;
  }, [lng]);
  return lng;
}
