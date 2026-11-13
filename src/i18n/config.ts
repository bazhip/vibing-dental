export const APP_LANGUAGES = ['en', 'fr', 'de', 'it', 'es'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

/** Endonyms: each language is named in itself, so these are never translated. */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
};

// Append new namespaces here (and in i18next.d.ts).
export const NAMESPACES = ['common', 'report', 'account', 'codes', 'chart', 'whatsNew', 'billing', 'landing', 'auth', 'app', 'forms', 'media', 'library', 'reminders', 'settings', 'onboarding', 'pdfui', 'reportui', 'voice', 'patients'] as const;

/** Test-only language whose strings read ⟦like this⟧ (see i18n/testing/pseudo.ts). */
export const PSEUDO_LOCALE = 'xx';

// Language switching (account picker, LanguageSwitcher on signed-out pages).
export const LANGUAGE_SWITCHING_ENABLED = true;

export function isAppLanguage(v: unknown): v is AppLanguage {
  return typeof v === 'string' && (APP_LANGUAGES as readonly string[]).includes(v);
}
