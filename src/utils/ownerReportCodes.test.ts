import { describe, expect, it } from 'vitest';
import en from '../locales/en/report.json';
import fr from '../locales/fr/report.json';
import de from '../locales/de/report.json';
import it_ from '../locales/it/report.json';
import es from '../locales/es/report.json';
import pt from '../locales/pt/report.json';
import frCodes from '../locales/fr/codes.json';
import { ownerFriendlyText } from './ownerReportCodes';

const plain = (en as unknown as { plainCodes: Record<string, string> }).plainCodes;

describe('ownerFriendlyText', () => {
  it('a code on its own reads in plain words', () => {
    const out = ownerFriendlyText('T/FX/CCF', 'en');
    expect(out).toBe(plain['T/FX/CCF']);
    expect(out).not.toContain('T/FX');
  });

  it('only the code token is replaced; the rest of the note stays', () => {
    const out = ownerFriendlyText('T/FX/CCF, pulp exposed', 'en');
    expect(out.startsWith(plain['T/FX/CCF'])).toBe(true);
    expect(out.endsWith(', pulp exposed')).toBe(true);
  });

  it('codes inside a longer note', () => {
    expect(ownerFriendlyText('B/I with 8mm punch and LN asp/cytology', 'en'))
      .toBe(`${plain['B/I']} with 8mm punch and LN asp/cytology`);
  });

  it('one-letter codes only when they are the whole note', () => {
    expect(ownerFriendlyText('X', 'en')).toBe(plain.X);
    expect(ownerFriendlyText('R maxillary swelling', 'en')).toBe('R maxillary swelling');
  });

  it('other codes fall back to the AVDC definition in the report language; none in Portuguese', () => {
    expect(ownerFriendlyText('MAL2', 'fr')).toBe((frCodes as Record<string, string>).MAL2);
    expect(ownerFriendlyText('MAL2', 'pt')).toBe('MAL2');
  });

  it('every curated code has a phrase in all six report languages', () => {
    const keys = Object.keys(plain);
    expect(keys.length).toBeGreaterThanOrEqual(30);
    for (const [lng, cat] of Object.entries({ fr, de, it: it_, es, pt })) {
      const p = (cat as unknown as { plainCodes?: Record<string, string> }).plainCodes ?? {};
      for (const k of keys) expect(p[k]?.trim(), `${lng} ${k}`).toBeTruthy();
    }
  });

  it('a one-letter code is replaced only where it is the whole list item', () => {
    expect(ownerFriendlyText('X, X-ray taken', 'en')).toBe(`${plain.X}, X-ray taken`);
  });

  it('phrases read naturally inside a note (no clause that repeats the note)', () => {
    const out = ownerFriendlyText('OM rostral mandible, B/I sent', 'en');
    expect(out.match(/\bsent\b/g) ?? []).toHaveLength(1);
  });

  it('report-language terms follow the glossary and the catalog dialect', () => {
    const p = (cat: unknown) => (cat as { plainCodes: Record<string, string> }).plainCodes;
    expect(p(de).X).toContain('entfernt');
    expect(p(pt)['T/FX/CCF']).toContain('quebrado');
    expect(JSON.stringify(p(pt))).not.toMatch(/partido|destartariza|já não está/);
  });
});
