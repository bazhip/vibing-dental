import { describe, expect, it } from 'vitest';
import { isTriadan, replaceSpokenNumbers, SCORE_WORDS } from './numbers';
import glossary from '../../locales/glossary.json';
import { normalizeTranscript } from '../aiAutofill';
import snapshot from './__fixtures__/en-normalize-snapshot.json';
import sampleTranscript from '../../../scripts/fixtures/sample-transcript.txt?raw';
import aiAutofillTestSource from '../aiAutofill.test.ts?raw';

// Every valid tooth in the app's dog and cat tooth sets (permanent and
// deciduous), written out here so the exhaustive tests below don't depend on
// the implementation.
const VALID_TEETH = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
  201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
  301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311,
  401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411,
  501, 502, 503, 504, 506, 507, 508,
  601, 602, 603, 604, 606, 607, 608,
  701, 702, 703, 704, 706, 707, 708,
  801, 802, 803, 804, 806, 807, 808,
];

// ----- Independent number-to-words helpers (test oracles) -----------------

const FR_UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze'];
const DE_UNITS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf'];
const IT_UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici'];
const ES_UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once'];

function frWords(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return `${h === 1 ? 'cent' : `${FR_UNITS[h]} cent`} ${FR_UNITS[r]}`;
}
function deWords(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return `${h === 1 ? '' : DE_UNITS[h]}hundert${DE_UNITS[r]}`;
}
function itWords(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const prefix = h === 1 ? '' : IT_UNITS[h];
  // cento + uno/otto drops the final o; compounds ending in tre take an accent.
  const cent = r === 1 || r === 8 ? 'cent' : 'cento';
  const unit = r === 3 ? 'tré' : IT_UNITS[r];
  return `${prefix}${cent}${unit}`;
}
function esWords(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const hundreds = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos'][h];
  return `${hundreds} ${ES_UNITS[r]}`;
}
const digitByDigit = (units: string[]) => (n: number) =>
  String(n).split('').map((d) => units[Number(d)]).join(' ');

const LANGS = [
  { lng: 'fr', words: frWords, digits: digitByDigit(FR_UNITS) },
  { lng: 'de', words: deWords, digits: digitByDigit(DE_UNITS) },
  { lng: 'it', words: itWords, digits: digitByDigit(IT_UNITS) },
  { lng: 'es', words: esWords, digits: digitByDigit(ES_UNITS) },
] as const;

// ----- isTriadan ----------------------------------------------------------

describe('isTriadan', () => {
  it('accepts every dog and cat tooth and nothing else in 100–899', () => {
    const valid = new Set(VALID_TEETH);
    for (let n = 0; n < 1000; n++) expect(isTriadan(n), String(n)).toBe(valid.has(n));
  });
});

// ----- Exhaustive per-language tooth numbers ------------------------------

describe.each(LANGS)('replaceSpokenNumbers — $lng teeth', ({ lng, words, digits }) => {
  it('reads every valid tooth said as a compound number', () => {
    for (const n of VALID_TEETH) {
      expect(replaceSpokenNumbers(`${words(n)} fracture`, lng), words(n)).toBe(`${n} fracture`);
    }
  });
  it('reads every valid tooth said digit by digit', () => {
    for (const n of VALID_TEETH) {
      expect(replaceSpokenNumbers(`${digits(n)} fracture`, lng), digits(n)).toBe(`${n} fracture`);
    }
  });
  it('ignores accents and case', () => {
    const upper = words(104).toUpperCase();
    expect(replaceSpokenNumbers(upper, lng)).toBe('104');
  });
  it('passes numerals through unchanged', () => {
    expect(replaceSpokenNumbers('104 GI 2, 209', lng)).toBe('104 GI 2, 209');
  });
});

// ----- Real speech variants -----------------------------------------------

describe('replaceSpokenNumbers — spoken variants', () => {
  const cases: [string, string, string][] = [
    // fr
    ['fr', 'cent un', '101'],
    ['fr', 'cent-quatre', '104'],
    ['fr', 'deux-cent-neuf', '209'],
    ['fr', 'trois cent dix', '310'],
    ['fr', 'quatre cent onze', '411'],
    ['fr', 'cinq cent quatre', '504'],
    ['fr', 'zéro', 'zéro'],
    ['fr', 'un zero quatre', '104'],
    // de
    ['de', 'hundertvier', '104'],
    ['de', 'einhundertvier', '104'],
    ['de', 'hundert vier', '104'],
    ['de', 'ein hundert vier', '104'],
    ['de', 'hundertundvier', '104'],
    ['de', 'hundert und vier', '104'],
    ['de', 'zweihundertneun', '209'],
    ['de', 'zwohundertneun', '209'],
    ['de', 'dreihundertzehn', '310'],
    ['de', 'vierhundertelf', '411'],
    ['de', 'hundertelf Millimeter', '111 Millimeter'],
    ['de', 'fünfhundertacht', '508'],
    ['de', 'eins null acht', '108'],
    ['de', 'zwo null neun', '209'],
    ['de', 'zwei null zwo', '202'],
    // it
    ['it', 'centoquattro', '104'],
    ['it', 'cento quattro', '104'],
    ['it', 'duecentonove', '209'],
    ['it', 'trecentodieci', '310'],
    ['it', 'quattrocentoundici', '411'],
    ['it', 'centuno', '101'],
    ['it', 'centouno', '101'],
    ['it', 'centotto', '108'],
    ['it', 'centotre', '103'],
    ['it', 'centotré', '103'],
    ['it', 'cinquecentoquattro', '504'],
    ['it', 'uno zero otto', '108'],
    // es
    ['es', 'ciento cuatro', '104'],
    ['es', 'ciento uno', '101'],
    ['es', 'doscientos nueve', '209'],
    ['es', 'trescientos diez', '310'],
    ['es', 'cuatrocientos once', '411'],
    ['es', 'quinientos cuatro', '504'],
    ['es', 'quinientos ocho', '508'],
    ['es', 'uno cero ocho', '108'],
  ];
  it.each(cases)('%s: %s → %s', (lng, input, expected) => {
    expect(replaceSpokenNumbers(input, lng as 'fr')).toBe(expected);
  });
});

// ----- Invalid compounds stay words unless a unit or score term says so ----

describe('replaceSpokenNumbers — non-teeth', () => {
  const invalid: [string, string][] = [
    ['fr', 'cent quatre-vingt-dix'], ['fr', 'cent vingt'], ['fr', 'cinq cent douze'], ['fr', 'cent onze'],
    ['de', 'hundertneunzig'], ['de', 'hundertzwanzig'], ['de', 'fünfhundertzwölf'], ['de', 'zweihundertelf'],
    ['it', 'centonovanta'], ['it', 'centoventi'], ['it', 'cinquecentododici'], ['it', 'cinquecentocinque'],
    ['es', 'ciento noventa'], ['es', 'ciento veinte'], ['es', 'quinientos doce'], ['es', 'quinientos cinco'],
  ];
  it.each(invalid)('%s: %s stays as words', (lng, input) => {
    expect(replaceSpokenNumbers(`${input} fracture`, lng as 'fr')).toBe(`${input} fracture`);
  });

  it.each([
    ['fr', 'cinq cent douze millimètres', '512 millimètres'],
    ['fr', 'mobilité cent onze', 'mobilité 111'],
    ['de', 'fünfhundertzwölf mm', '512 mm'],
    ['de', 'Beweglichkeit hundertzwölf', 'Beweglichkeit 112'],
    ['it', 'cinquecentododici millimetri', '512 millimetri'],
    ['it', 'mobilità centododici', 'mobilità 112'],
    ['es', 'quinientos doce milímetros', '512 milímetros'],
    ['es', 'movilidad ciento doce', 'movilidad 112'],
  ])('%s: %s → %s (unit or score term)', (lng, input, expected) => {
    expect(replaceSpokenNumbers(input, lng as 'fr')).toBe(expected);
  });
});

// ----- Scores and measurements --------------------------------------------

describe('replaceSpokenNumbers — scores and units', () => {
  it.each([
    ['fr', 'mobilité trois un zéro trois', 'mobilité 3 103'],
    ['de', 'Beweglichkeit drei eins null drei', 'Beweglichkeit 3 103'],
    ['it', 'mobilità tre uno zero tre', 'mobilità 3 103'],
    ['es', 'movilidad tres uno cero tres', 'movilidad 3 103'],
  ])('%s score then tooth: %s', (lng, input, expected) => {
    expect(replaceSpokenNumbers(input, lng as 'fr')).toBe(expected);
  });

  it.each([
    ['fr', 'cent quatre GI deux, poche cinq millimètres', '104 GI 2, poche 5 millimètres'],
    ['fr', 'poche de douze millimètres', 'poche de 12 millimètres'],
    ['fr', 'Mobilite deux', 'Mobilite 2'],
    ['fr', 'calcul un peu partout', 'calcul un peu partout'],
    ['fr', 'stade un', 'stade 1'],
    ['de', 'hundertvier Tasche fünf Millimeter', '104 Tasche 5 Millimeter'],
    ['de', 'Tasche zwölf mm', 'Tasche 12 mm'],
    ['de', 'Zahnstein zwo', 'Zahnstein 2'],
    ['it', 'centoquattro tasca cinque millimetri', '104 tasca 5 millimetri'],
    ['it', 'tasca un millimetro', 'tasca 1 millimetro'],
    ['it', 'tartaro un po’ ovunque', 'tartaro un po’ ovunque'],
    ['es', 'ciento cuatro bolsa de quince milímetros', '104 bolsa de 15 milímetros'],
    ['es', 'cálculo un poco', 'cálculo un poco'],
    ['es', 'cálculo uno', 'cálculo 1'],
    ['es', 'un milímetro', '1 milímetro'],
  ])('%s: %s', (lng, input, expected) => {
    expect(replaceSpokenNumbers(input, lng as 'fr')).toBe(expected);
  });

  it('uses caller-supplied score and unit terms', () => {
    expect(replaceSpokenNumbers('tartre deux', 'fr', { scoreTerms: /tartre/ })).toBe('tartre 2');
    expect(replaceSpokenNumbers('cinq millimètres', 'fr', { unitTerms: /mm/ })).toBe('cinq millimètres');
  });

  it('leaves ordinary words that contain number words alone', () => {
    expect(replaceSpokenNumbers('une dent cassée, sept jours', 'fr')).toBe('une dent cassée, sept jours');
    expect(replaceSpokenNumbers('Zahn mit Zahnstein', 'de')).toBe('Zahn mit Zahnstein');
    expect(replaceSpokenNumbers('dente da latte, trenta secondi', 'it')).toBe('dente da latte, trenta secondi');
    expect(replaceSpokenNumbers('diente de leche, dosis', 'es')).toBe('diente de leche, dosis');
    expect(replaceSpokenNumbers('trente-deux millimètres', 'fr')).toBe('trente-deux millimètres');
  });

  it('takes native score words from the glossary', () => {
    const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const terms = (glossary as { terms: Record<string, string>[] }).terms;
    for (const [lng, byId] of Object.entries(SCORE_WORDS)) {
      for (const [id, word] of Object.entries(byId)) {
        const entry = terms.find((t) => t.id === id);
        expect(entry, id).toBeDefined();
        expect(fold(entry![lng]), `${lng} ${id}`).toContain(fold(word));
      }
    }
  });
});

// ----- English: byte-identical to the old passes --------------------------

// Frozen copy of the English digit-word passes as they were in
// normalizeTranscript before extraction — the oracle for 'en'.
const OLD_DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0',
  one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};
const OLD_KEYS = Object.keys(OLD_DIGIT_WORDS).join('|');
const OLD_SCORE_TERMS = 'GI|GE|G|C|calc|calculus|mobility|mob|M|F|furcation|PD|stage|grade|class|pocket|recession|gingivitis|enlargement|hyperplasia|mesial|distal|mesiobuccal|mesiopalatal|distobuccal|palatal';
function oldEnglishPasses(input: string): string {
  let text = input;
  text = text.replace(new RegExp(`\\b(${OLD_SCORE_TERMS})([\\s,.-]+)(${OLD_KEYS})\\b`, 'gi'),
    (_m, term, sep, word) => `${term}${sep}${OLD_DIGIT_WORDS[word.toLowerCase()]}`);
  text = text.replace(new RegExp(`\\b(${OLD_KEYS})(?=[\\s-]*(?:mm|millimet(?:er|re)s?)\\b)`, 'gi'),
    (word) => OLD_DIGIT_WORDS[word.toLowerCase()]);
  text = text.replace(new RegExp(`\\b(${OLD_KEYS})(?:[\\s\\-]+(${OLD_KEYS}))(?:[\\s\\-]+(${OLD_KEYS}))?\\b`, 'gi'),
    (match, a, b, c) => {
      const parts = [a, b, c].filter(Boolean).map((w: string) => OLD_DIGIT_WORDS[w.toLowerCase()]);
      if (parts.length < 2) return match;
      return parts.join('');
    });
  return text;
}

function englishInputs(): string[] {
  const lines = sampleTranscript.split('\n');
  const literals = [...aiAutofillTestSource.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
  return [...new Set([...lines, ...lines.map((l) => l.replace(/^\[[^\]]*\]\s*/, '')), ...literals])];
}

describe('replaceSpokenNumbers — en', () => {
  const inputs = englishInputs();
  it('collects the sample transcript and the aiAutofill test inputs', () => {
    expect(inputs.length).toBeGreaterThan(150);
  });
  it('equals the old English passes on every input', () => {
    for (const input of inputs) expect(replaceSpokenNumbers(input, 'en'), input).toBe(oldEnglishPasses(input));
  });
  it('normalizeTranscript output is unchanged (snapshot captured before extraction)', () => {
    for (const [input, output] of snapshot as [string, string][]) {
      expect(normalizeTranscript(input), input).toBe(output);
    }
  });
});
