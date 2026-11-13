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
export const NAMESPACES = ['common', 'report', 'account', 'chart', 'patients'] as const;

// Flip to expose a language switcher in the UI.
export const LANGUAGE_SWITCHING_ENABLED = false;

export function isAppLanguage(v: unknown): v is AppLanguage {
  return typeof v === 'string' && (APP_LANGUAGES as readonly string[]).includes(v);
}
