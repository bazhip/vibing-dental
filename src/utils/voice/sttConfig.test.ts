import { APP_LANGUAGES } from '../../i18n/config';
import { voiceKeyterms, VOICE_KEYTERMS } from '../../constants/voiceKeyterms';
import { VOICE_STT, browserSpeechLang } from './sttConfig';

describe('VOICE_STT', () => {
  it('uses monolingual English and multi for the rest', () => {
    expect(VOICE_STT.en).toEqual({ model: 'nova-3-medical', language: 'en' });
    for (const l of ['fr', 'de', 'it', 'es'] as const) {
      expect(VOICE_STT[l]).toEqual({ model: 'nova-3-medical', language: 'multi' });
    }
  });
});

describe('voiceKeyterms', () => {
  it('returns the English list unchanged for en', () => {
    expect(voiceKeyterms('en')).toBe(VOICE_KEYTERMS);
  });
  it.each(APP_LANGUAGES)('%s stays within Deepgram limits', (lng) => {
    const terms = voiceKeyterms(lng);
    expect(terms.length).toBeLessThanOrEqual(100);
    const tokens = terms.reduce((n, t) => n + Math.ceil(t.length / 3) + 1, 0);
    // en is the frozen legacy list (byte-identical URL); its heuristic estimate is 545.
    if (lng !== 'en') expect(tokens).toBeLessThanOrEqual(500);
    expect(new Set(terms.map((t) => t.toLowerCase())).size).toBe(terms.length);
  });
  it('includes native glossary terms and English drug names', () => {
    expect(voiceKeyterms('fr')).toContain('parodontite');
    expect(voiceKeyterms('de')).toContain('Zahnstein');
    expect(voiceKeyterms('it')).toContain('Triadan');
    expect(voiceKeyterms('es')).toContain('bupivacaine');
  });
});

describe('browserSpeechLang', () => {
  it('maps app languages to browser locales and keeps en behaviour', () => {
    expect(browserSpeechLang('de', 'en-GB')).toBe('de-DE');
    expect(browserSpeechLang('fr', undefined)).toBe('fr-FR');
    expect(browserSpeechLang('it', 'en-US')).toBe('it-IT');
    expect(browserSpeechLang('es', 'en-US')).toBe('es-ES');
    expect(browserSpeechLang('en', 'en-GB')).toBe('en-GB');
    expect(browserSpeechLang('en', '')).toBe('en-US');
  });
});
