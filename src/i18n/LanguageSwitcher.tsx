import { useTranslation } from 'react-i18next';
import i18n, { loadLanguage } from './index';
import { APP_LANGUAGES, LANGUAGE_NAMES, LANGUAGE_SWITCHING_ENABLED, isAppLanguage } from './config';
import { writeStoredLanguage } from './storedLanguage';

/** Language picker for pages without account preferences (landing, sign-in).
 *  The choice is remembered on this device. `compact` drops the visible label. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  if (!LANGUAGE_SWITCHING_ENABLED) return null;
  const current = isAppLanguage(i18n.language) ? i18n.language : 'en';
  const select = (
    <select
      className="patient-form__input language-switcher"
      aria-label={compact ? t('language.label') : undefined}
      value={current}
      onChange={async (e) => {
        const lng = e.target.value;
        if (!isAppLanguage(lng)) return;
        writeStoredLanguage(lng);
        await loadLanguage(lng);
        await i18n.changeLanguage(lng);
        document.documentElement.lang = lng;
      }}
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
