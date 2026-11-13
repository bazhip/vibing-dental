import type { AppLanguage } from '../../i18n/config';

export interface VoiceSttConfig {
  model: string;
  language: string;
  /** Model to retry with, once, if the first socket fails or closes before
   *  any transcript arrives (same parameters otherwise). */
  fallbackModel?: string;
}

/**
 * Deepgram model + language per app language. English uses nova-3-medical
 * monolingual. Deepgram lists `language=multi` (code-switching across
 * es/fr/de/it/en) for nova-3-medical, so the other app languages use that;
 * if Deepgram refuses that combination the session retries once on general
 * nova-3 with language=multi. English never retries.
 */
export const VOICE_STT: Record<AppLanguage, VoiceSttConfig> = {
  en: { model: 'nova-3-medical', language: 'en' },
  fr: { model: 'nova-3-medical', language: 'multi', fallbackModel: 'nova-3' },
  de: { model: 'nova-3-medical', language: 'multi', fallbackModel: 'nova-3' },
  it: { model: 'nova-3-medical', language: 'multi', fallbackModel: 'nova-3' },
  es: { model: 'nova-3-medical', language: 'multi', fallbackModel: 'nova-3' },
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
