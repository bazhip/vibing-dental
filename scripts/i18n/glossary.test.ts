// @vitest-environment node
import { readFileSync } from 'node:fs';

interface Term {
  id: string;
  en: string;
  fr: string;
  de: string;
  it: string;
  es: string;
  note?: string;
}

const LANGS = ['en', 'fr', 'de', 'it', 'es'] as const;

const REQUIRED_IDS = [
  'mobility', 'recession', 'pocket', 'furcation', 'hyperplasia', 'calculus',
  'gingivitis', 'periodontal_disease', 'extraction', 'incisor', 'canine_tooth',
  'premolar', 'molar', 'deciduous', 'maxillary', 'mandibular', 'triadan',
  'nerve_block', 'anesthesia', 'radiograph',
];

const { terms } = JSON.parse(readFileSync('src/locales/glossary.json', 'utf8')) as { terms: Term[] };

test('every term has a non-empty value in every language', () => {
  for (const term of terms) {
    for (const lang of LANGS) {
      expect(typeof term[lang] === 'string' && term[lang].trim() !== '', `${term.id}.${lang}`).toBe(true);
    }
    if (term.note !== undefined) expect(term.note.trim(), `${term.id}.note`).not.toBe('');
  }
});

test('ids are unique', () => {
  const ids = terms.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test('has at least 60 terms', () => {
  expect(terms.length).toBeGreaterThanOrEqual(60);
});

test('includes the core clinical terms', () => {
  const ids = new Set(terms.map((t) => t.id));
  expect(REQUIRED_IDS.filter((id) => !ids.has(id))).toEqual([]);
});
