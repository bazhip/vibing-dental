import { APP_LANGUAGES } from '../../i18n/config';
import { capKeyterms, voiceKeyterms, VOICE_KEYTERMS } from '../../constants/voiceKeyterms';
import { VOICE_STT, browserSpeechLang } from './sttConfig';
import { SPOKEN_SYNONYMS } from './terms';

describe('VOICE_STT', () => {
  it('uses monolingual English and multi for the rest', () => {
    expect(VOICE_STT.en).toEqual({ model: 'nova-3-medical', language: 'en' });
    for (const l of ['fr', 'de', 'it', 'es'] as const) {
      expect(VOICE_STT[l]).toEqual({ model: 'nova-3-medical', language: 'multi', fallbackModel: 'nova-3' });
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
  it('skips a term that would overflow the token cap and keeps shorter ones after it', () => {
    const long = (c: string) => c.repeat(297); // 100 estimated tokens
    const out = capKeyterms([long('a'), long('b'), long('c'), long('d'), 'x'.repeat(300), 'short', 'Short']);
    expect(out).toEqual([long('a'), long('b'), long('c'), long('d'), 'short']);
    expect(capKeyterms(Array.from({ length: 120 }, (_, i) => `t${i}`))).toHaveLength(100);
  });
  it('includes native glossary terms and English drug names', () => {
    expect(voiceKeyterms('fr')).toContain('parodontite');
    expect(voiceKeyterms('de')).toContain('Zahnstein');
    expect(voiceKeyterms('it')).toContain('Triadan');
    expect(voiceKeyterms('es')).toContain('bupivacaine');
  });
});

describe('voiceKeyterms priority', () => {
  const NERVE_BLOCKS: Record<'fr' | 'de' | 'it' | 'es', string[]> = {
    fr: ['bloc nerveux', 'bloc du nerf infra-orbitaire', 'bloc maxillaire caudal', 'bloc du nerf mentonnier', 'bloc du nerf alvéolaire inférieur'],
    de: ['Nervenblockade', 'Infraorbitalblockade', 'kaudale Maxillarisblockade', 'Mentalisblockade', 'Blockade des N. alveolaris inferior'],
    it: ['blocco nervoso', 'blocco del nervo infraorbitario', 'blocco mascellare caudale', 'blocco del nervo mentale', 'blocco del nervo alveolare inferiore'],
    es: ['bloqueo nervioso', 'bloqueo del nervio infraorbitario', 'bloqueo maxilar caudal', 'bloqueo del nervio mentoniano', 'bloqueo del nervio alveolar inferior'],
  };
  it.each(['fr', 'de', 'it', 'es'] as const)('%s keeps spoken synonyms and nerve-block sites within the cap', (lng) => {
    const terms = voiceKeyterms(lng);
    const lower = terms.map((t) => t.toLowerCase());
    for (const s of SPOKEN_SYNONYMS[lng]) expect(lower).toContain(s.toLowerCase());
    for (const b of NERVE_BLOCKS[lng]) expect(terms).toContain(b);
    expect(terms.length).toBeLessThanOrEqual(100);
    expect(terms.reduce((n, t) => n + Math.ceil(t.length / 3) + 1, 0)).toBeLessThanOrEqual(500);
  });
  it.each(APP_LANGUAGES)('%s keyterms use straight apostrophes only', (lng) => {
    for (const t of voiceKeyterms(lng)) expect(t).not.toMatch(/[\u2018\u2019\u02BC]/);
  });
  it('normalises French apostrophes in keyterms', () => {
    expect(voiceKeyterms('fr')).toContain("perte d'attache");
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
