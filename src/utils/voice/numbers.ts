import type { AppLanguage } from '../../i18n/config';
import {
  CANINE_DECIDUOUS_TOOTH_DATA,
  CANINE_TOOTH_DATA,
  FELINE_DECIDUOUS_TOOTH_DATA,
  FELINE_TOOTH_DATA,
} from '../../constants/toothData';

// ----- Triadan -------------------------------------------------------------

const TRIADAN = new Set(
  [CANINE_TOOTH_DATA, FELINE_TOOTH_DATA, CANINE_DECIDUOUS_TOOTH_DATA, FELINE_DECIDUOUS_TOOTH_DATA]
    .flatMap((set) => set.map((t) => t.triadan)),
);

/** True when `n` is a tooth in the app's dog or cat tooth sets, permanent
 *  (101–411) or deciduous (501–808). */
export function isTriadan(n: number): boolean {
  return TRIADAN.has(n);
}

// ----- English (extracted unchanged from normalizeTranscript) -------------

const DIGIT_WORDS: Record<string, string> = {
  zero: '0', oh: '0',
  one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

const DIGIT_WORD_RE = new RegExp(
  `\\b(${Object.keys(DIGIT_WORDS).join('|')})(?:[\\s\\-]+(${Object.keys(DIGIT_WORDS).join('|')}))(?:[\\s\\-]+(${Object.keys(DIGIT_WORDS).join('|')}))?\\b`,
  'gi'
);

// Words after which a single spoken number is a score/measurement, not
// part of a tooth number: "mobility three one zero three" is mobility 3,
// tooth 103 — not tooth 310.
export const SCORE_TERMS = 'GI|GE|G|C|calc|calculus|mobility|mob|M|F|furcation|PD|stage|grade|class|pocket|recession|gingivitis|enlargement|hyperplasia|mesial|distal|mesiobuccal|mesiopalatal|distobuccal|palatal';
const SCORE_WORD_RE = new RegExp(
  `\\b(${SCORE_TERMS})([\\s,.-]+)(${Object.keys(DIGIT_WORDS).join('|')})\\b`,
  'gi'
);
// A spoken number right before a unit is a measurement: "five millimeter".
const UNIT_WORD_RE = new RegExp(
  `\\b(${Object.keys(DIGIT_WORDS).join('|')})(?=[\\s-]*(?:mm|millimet(?:er|re)s?)\\b)`,
  'gi'
);

/** English: a digit word right after a score term ("calc two" → "calc 2"). */
export function englishScoreWords(text: string): string {
  return text.replace(SCORE_WORD_RE, (_m, term, sep, word) => `${term}${sep}${DIGIT_WORDS[word.toLowerCase()]}`);
}

/** English: a digit word right before a unit ("five millimeter" → "5 millimeter"). */
export function englishUnitWords(text: string): string {
  return text.replace(UNIT_WORD_RE, (word) => DIGIT_WORDS[word.toLowerCase()]);
}

/** English: "one oh four" / "two-o-nine" / "three zero one" → "104" / "209" / "301". */
export function englishDigitRuns(text: string): string {
  return text.replace(DIGIT_WORD_RE, (match, a, b, c) => {
    const parts = [a, b, c].filter(Boolean).map((w: string) => DIGIT_WORDS[w.toLowerCase()]);
    if (parts.length < 2) return match;
    return parts.join('');
  });
}

// ----- fr / de / it / es ----------------------------------------------------
// Matching runs on a folded copy of the text (lowercase, accents stripped,
// same length) and replacements are spliced into the original, so case and
// accents of everything else are kept. Word lists below are written folded.

type OtherLanguage = Exclude<AppLanguage, 'en'>;

interface LanguageNumbers {
  /** Words read digit by digit in a tooth number ("un zéro quatre"). */
  digits: Record<string, number>;
  /** Single number words 0–15, for a score or a measurement. */
  small: Record<string, number>;
  /** Small words that are also articles ("un peu"): only converted when a
   *  number, unit or punctuation follows. */
  articles: string[];
  /** Compound hundreds; groups `h` (hundreds word, absent = 100) and `r` (1–15). */
  compound: string;
  hundreds: (h: string | undefined) => number;
  /** Score terms (folded alternation): glossary column terms, plus the
   *  English abbreviations vets say in every language. */
  scoreTerms: string;
  units: string;
}

const words = (list: string) => list.split(' ');
const toMap = (list: string, start = 0) =>
  Object.fromEntries(words(list).map((w, i) => [w, i + start])) as Record<string, number>;
const alt = (keys: string[]) => [...keys].sort((a, b) => b.length - a.length).join('|');
const withValues = (base: Record<string, number>, extra: Record<string, number>) => ({ ...base, ...extra });

const ABBREVIATIONS = 'gi|ge|g|c|calc|m|f|pd';

// Glossary-derived spoken forms of the perio grid columns and surfaces
// (each word appears in the glossary term for its id; see numbers.test.ts),
// plus the plain words for grade and class.
export const SCORE_WORDS: Record<OtherLanguage, Record<string, string>> = {
  fr: {
    mobility: 'mobilité', recession: 'récession', pocket: 'poche', furcation: 'furcation',
    calculus: 'calcul', gingivitis: 'gingivite', hyperplasia: 'accroissement', periodontal_stage: 'stade',
    mesial: 'mésial', distal: 'distal', palatal: 'palatin', buccal: 'vestibulaire',
  },
  de: {
    mobility: 'beweglichkeit', recession: 'rezession', pocket: 'tasche', furcation: 'furkation',
    calculus: 'zahnstein', gingivitis: 'gingivitis', periodontal_stage: 'stadium',
    mesial: 'mesial', distal: 'distal', palatal: 'palatinal', buccal: 'bukkal',
  },
  it: {
    mobility: 'mobilità', recession: 'recessione', pocket: 'tasca', furcation: 'forcazione',
    calculus: 'tartaro', gingivitis: 'gengivite', hyperplasia: 'ingrossamento', periodontal_stage: 'stadio',
    mesial: 'mesiale', distal: 'distale', palatal: 'palatale', buccal: 'vestibolare',
  },
  es: {
    mobility: 'movilidad', recession: 'recesión', pocket: 'bolsa', furcation: 'furca',
    calculus: 'cálculo', gingivitis: 'gingivitis', hyperplasia: 'agrandamiento', periodontal_stage: 'estadio',
    mesial: 'mesial', distal: 'distal', palatal: 'palatino', buccal: 'vestibular',
  },
};
const GRADE_CLASS: Record<OtherLanguage, string> = {
  fr: 'grade|classe', de: 'grad|klasse', it: 'grado|classe', es: 'grado|clase',
};

function scoreTermsFor(lng: OtherLanguage): string {
  return [...Object.values(SCORE_WORDS[lng]).map(fold), GRADE_CLASS[lng], ABBREVIATIONS].join('|');
}

const FR_SMALL = toMap('zero un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze');
const DE_SMALL = withValues(
  toMap('null eins zwei drei vier funf sechs sieben acht neun zehn elf zwolf dreizehn vierzehn funfzehn'),
  { zwo: 2, ein: 1, einen: 1 },
);
const IT_SMALL = withValues(
  toMap('zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici'),
  { un: 1, una: 1 },
);
const ES_SMALL = withValues(
  toMap('cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince'),
  { un: 1, una: 1 },
);

const digitsOf = (small: Record<string, number>, keys: string) =>
  Object.fromEntries(words(keys).map((w) => [w, small[w]])) as Record<string, number>;
const remainderAlt = (small: Record<string, number>, exclude: string[] = []) =>
  alt(Object.keys(small).filter((w) => small[w] > 0 && !exclude.includes(w)));

const LANGS: Record<OtherLanguage, LanguageNumbers> = {
  fr: {
    digits: digitsOf(FR_SMALL, 'zero un deux trois quatre cinq six sept huit neuf'),
    small: FR_SMALL,
    articles: ['un'],
    // "cent quatre", "deux cent neuf", "cent-un", "deux-cent-onze"
    compound: `(?:(?<h>deux|trois|quatre|cinq|six|sept|huit)[\\s-]+)?cents?[\\s-]+(?<r>${remainderAlt(FR_SMALL)})`,
    hundreds: (h) => (h ? FR_SMALL[h] : 1),
    scoreTerms: scoreTermsFor('fr'),
    units: 'mm|millimetres?',
  },
  de: {
    digits: digitsOf(DE_SMALL, 'null eins zwei zwo drei vier funf sechs sieben acht neun'),
    small: DE_SMALL,
    articles: ['ein', 'einen'],
    // "hundertvier", "einhundertvier", "hundert vier", "hundertundvier", "zwohundertneun"
    compound: `(?:(?<h>ein|zwei|zwo|drei|vier|funf|sechs|sieben|acht)[\\s-]*)?hundert[\\s-]*(?:und[\\s-]*)?(?<r>${remainderAlt(DE_SMALL, ['einen'])})`,
    hundreds: (h) => (h ? DE_SMALL[h] : 1),
    scoreTerms: scoreTermsFor('de'),
    units: 'mm|millimetern?',
  },
  it: {
    digits: digitsOf(IT_SMALL, 'zero uno due tre quattro cinque sei sette otto nove'),
    small: IT_SMALL,
    articles: ['un', 'una', 'uno'],
    // "centoquattro", "cento quattro", "duecentonove", elided "centuno" / "centotto"
    compound: `(?:(?<h>due|tre|quattro|cinque|sei|sette|otto)\\s*)?cento?\\s*(?<r>${remainderAlt(IT_SMALL, ['un', 'una'])})`,
    hundreds: (h) => (h ? IT_SMALL[h] : 1),
    scoreTerms: scoreTermsFor('it'),
    units: 'mm|millimetr[oi]',
  },
  es: {
    digits: digitsOf(ES_SMALL, 'cero uno dos tres cuatro cinco seis siete ocho nueve'),
    small: ES_SMALL,
    articles: ['un', 'una'],
    // "ciento cuatro", "doscientos nueve", "quinientos ocho"
    compound: `(?<h>ciento|(?:dos|tres|cuatro|seis|sete|ocho)cient[oa]s|quinient[oa]s)[\\s-]+(?<r>${remainderAlt(ES_SMALL)})`,
    hundreds: (h) => {
      if (!h || h === 'ciento') return 1;
      if (h.startsWith('quinient')) return 5;
      return { dos: 2, tres: 3, cuatro: 4, seis: 6, sete: 7, ocho: 8 }[h.slice(0, h.indexOf('cient'))] ?? 0;
    },
    scoreTerms: scoreTermsFor('es'),
    units: 'mm|milimetros?',
  },
};

/** Lowercase and strip accents character by character, keeping the length
 *  so match indexes line up with the original text. */
function fold(text: string): string {
  let out = '';
  for (const ch of text) {
    const f = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    out += f.length === ch.length ? f : ch;
  }
  return out;
}

// Word edges; a hyphen joined to a letter continues the word, so "quatre"
// in "quatre-vingt-dix" or "deux" in "trente-deux" is not a number on its own.
const NOT_BEFORE = '(?<![\\p{L}\\p{N}]|\\p{L}-)';
const NOT_AFTER = '(?![\\p{L}\\p{N}]|-\\p{L})';

/** Run `re` over the folded text; splice `fn`'s result over each match in the
 *  original. `fn` returns null to leave a match as it was. */
function replaceFolded(
  text: string,
  re: RegExp,
  fn: (m: RegExpExecArray, folded: string) => string | null,
): string {
  const folded = fold(text);
  let out = '';
  let last = 0;
  for (const m of folded.matchAll(re)) {
    const replacement = fn(m, folded);
    if (replacement === null) continue;
    out += text.slice(last, m.index) + replacement;
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

/** Folded source of a caller-supplied term regex (accents stripped). */
const termSource = (re: RegExp) => fold(re.source);

/**
 * Turn spoken numbers into digits. English runs the passes extracted from
 * normalizeTranscript (and ignores `opts`). Other languages, in order:
 *  1. a single number word 0–15 right after a score term ("mobilité trois");
 *  2. compound hundreds ("cent quatre", "zweihundertneun", "centotto",
 *     "quinientos ocho") when the result is a valid Triadan tooth, is
 *     followed by a unit, or is preceded by a score term;
 *  3. a single number word 0–15 right before a unit ("cinq millimètres");
 *  4. runs of 2–3 digit words ("un zéro quatre", "eins null acht").
 * Accents and case are ignored; numerals pass through unchanged.
 * `opts.scoreTerms` / `opts.unitTerms` replace the built-in term lists; their
 * sources are used as alternations inside a Unicode regex.
 */
export function replaceSpokenNumbers(
  text: string,
  lng: AppLanguage,
  opts?: { scoreTerms?: RegExp; unitTerms?: RegExp },
): string {
  if (lng === 'en') return englishDigitRuns(englishUnitWords(englishScoreWords(text)));

  const L = LANGS[lng];
  const score = opts?.scoreTerms ? termSource(opts.scoreTerms) : L.scoreTerms;
  const units = opts?.unitTerms ? termSource(opts.unitTerms) : L.units;
  const small = alt(Object.keys(L.small));
  const digits = alt(Object.keys(L.digits));
  const afterScore = `(?<=${NOT_BEFORE}(?:${score})[\\s,.-]+)`;
  const unitAhead = `[\\s-]*(?:${units})${NOT_AFTER}`;

  // What may follow an article-like word for it to count as a number.
  const numericNext = new RegExp(
    `^\\s*(?:$|[^\\p{L}\\s]|(?:${small}|${L.compound}|${units})${NOT_AFTER})`, 'iu');
  const scoreBefore = new RegExp(`${NOT_BEFORE}(?:${score})[\\s,.-]+$`, 'iu');
  const unitAfter = new RegExp(`^${unitAhead}`, 'iu');

  // 1. score term + single word
  let out = replaceFolded(text, new RegExp(`${afterScore}(${small})${NOT_AFTER}`, 'giu'), (m, folded) => {
    const word = m[1];
    if (L.articles.includes(word) && !numericNext.test(folded.slice(m.index + word.length))) return null;
    return String(L.small[word]);
  });

  // 2. compound hundreds
  out = replaceFolded(out, new RegExp(`${NOT_BEFORE}${L.compound}${NOT_AFTER}`, 'giu'), (m, folded) => {
    const g = m.groups ?? {};
    const n = L.hundreds(g.h) * 100 + L.small[g.r];
    const ok = isTriadan(n)
      || unitAfter.test(folded.slice(m.index + m[0].length))
      || scoreBefore.test(folded.slice(0, m.index));
    return ok ? String(n) : null;
  });

  // 3. single word + unit
  out = replaceFolded(out, new RegExp(`${NOT_BEFORE}(${small})(?=${unitAhead})`, 'giu'),
    (m) => String(L.small[m[1]]));

  // 4. digit-by-digit runs
  out = replaceFolded(
    out,
    new RegExp(`${NOT_BEFORE}(${digits})[\\s-]+(${digits})(?:[\\s-]+(${digits}))?${NOT_AFTER}`, 'giu'),
    (m) => [m[1], m[2], m[3]].filter(Boolean).map((w) => L.digits[w]).join(''),
  );
  return out;
}
