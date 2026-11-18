export const APP_LANGUAGES = ['en', 'fr', 'de', 'it', 'es', 'hu', 'ro', 'zh', 'ar'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

/** Endonyms: each language is named in itself, so these are never translated. */
export const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español',
  hu: 'Magyar',
  ro: 'Română',
  zh: '简体中文',
  ar: 'العربية',
};

// Append new namespaces here (and in i18next.d.ts).
export const NAMESPACES = ['common', 'report', 'account', 'codes', 'chart', 'whatsNew', 'billing', 'landing', 'auth', 'app', 'forms', 'media', 'library', 'reminders', 'settings', 'onboarding', 'pdfui', 'reportui', 'voice', 'client', 'pdf', 'email', 'authEmail', 'patients', 'pims', 'visitDocumentation'] as const;

/** Test-only language whose strings read ⟦like this⟧ (see i18n/testing/pseudo.ts). */
export const PSEUDO_LOCALE = 'xx';

// Language switching (account picker, LanguageSwitcher on signed-out pages).
export const LANGUAGE_SWITCHING_ENABLED = true;

export function isAppLanguage(v: unknown): v is AppLanguage {
  return typeof v === 'string' && (APP_LANGUAGES as readonly string[]).includes(v);
}

export function languageDirection(lng: string): 'ltr' | 'rtl' {
  return lng.split('-')[0].toLowerCase() === 'ar' ? 'rtl' : 'ltr';
}
