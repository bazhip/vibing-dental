import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from './index';
import { applyLanguage } from './applyLanguage';
import { APP_LANGUAGES, AppLanguage, LANGUAGE_NAMES, LANGUAGE_SWITCHING_ENABLED, isAppLanguage } from './config';

/** Language picker for pages without account preferences (landing, sign-in).
 *  The choice is remembered on this device. `compact` drops the visible label. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  // The choice shown while its catalog loads. Across the app only the latest
  // language request applies (applyLanguage); `latest` tracks this picker's own.
  const [pending, setPending] = useState<AppLanguage | null>(null);
  const latest = useRef(0);
  if (!LANGUAGE_SWITCHING_ENABLED) return null;
  const current = isAppLanguage(i18n.language) ? i18n.language : 'en';

  const choose = async (lng: AppLanguage) => {
    const request = ++latest.current;
    setPending(lng);
    await applyLanguage(lng, { remember: true });
    // Applied, failed (offline) or overridden: show the language in effect.
    if (request === latest.current) setPending(null);
  };

  const select = (
    <select
      className="patient-form__input language-switcher"
      aria-label={compact ? t('language.label') : undefined}
      value={pending ?? current}
      onChange={(e) => isAppLanguage(e.target.value) && void choose(e.target.value)}
    >
      {APP_LANGUAGES.map((l) => (
        <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>
      ))}
    </select>
  );
  if (compact) return select;
  return (
    <label className="patient-form__label">
      {t('language.label')}
      {select}
    </label>
  );
}
