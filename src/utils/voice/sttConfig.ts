import type { AppLanguage } from '../../i18n/config';

/**
 * Deepgram model + language per app language. nova-3-medical is monolingual
 * English only, but it supports `language=multi` (code-switching across
 * es/fr/de/it/en), so the other app languages use that.
 */
export const VOICE_STT: Record<AppLanguage, { model: string; language: string }> = {
  en: { model: 'nova-3-medical', language: 'en' },
  fr: { model: 'nova-3-medical', language: 'multi' },
  de: { model: 'nova-3-medical', language: 'multi' },
  it: { model: 'nova-3-medical', language: 'multi' },
  es: { model: 'nova-3-medical', language: 'multi' },
};

/** BCP-47 tag for the browser SpeechRecognition fallback; en keeps the
 *  caller's navigator.language behaviour. */
export const BROWSER_SPEECH_LANG: Record<Exclude<AppLanguage, 'en'>, string> = {
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  es: 'es-ES',
};

export function browserSpeechLang(lng: AppLanguage, navigatorLanguage: string | undefined): string {
  return lng === 'en' ? navigatorLanguage || 'en-US' : BROWSER_SPEECH_LANG[lng];
}
