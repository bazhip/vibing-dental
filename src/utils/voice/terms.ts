import type { AppLanguage } from '../../i18n/config';
import glossary from '../../locales/glossary.json';

// Per-language dictation terms. This module is the single source for
// native voice vocabulary: score terms, units, slash words, spelled letters
// and filler words. English keeps its original hand-written patterns in
// numbers.ts and aiAutofill.ts, so its output stays byte-identical.

type GlossaryTerm = { id: string } & Partial<Record<AppLanguage, string>>;
const BY_ID = new Map((glossary as { terms: GlossaryTerm[] }).terms.map((t) => [t.id, t]));

/** Glossary ids whose clinical value, said before a number, marks that number
 *  as a score or measurement (perio grid columns, staging, tooth surfaces). */
export const SCORE_GLOSSARY_IDS = [
  'gingivitis', 'calculus', 'mobility', 'furcation', 'pocket', 'probing_depth', 'recession',
  'hyperplasia', 'periodontal_stage', 'periodontal_disease',
  'mesial', 'distal', 'palatal', 'buccal', 'lingual',
] as const;

/** What vets actually say before a score that the glossary doesn't hold as a
 *  clinical value: short column labels, lay words and grade/class words. */
export const SPOKEN_SYNONYMS: Record<AppLanguage, string[]> = {
  en: [], // English keeps its own SCORE_TERMS list in numbers.ts.
  fr: [
    'mobilité', // column label; glossary value is "mobilité dentaire"
    'poche', // short for "poche parodontale"
    'récession', // short for "récession gingivale"
    'furcation', // column label; glossary value is "atteinte de furcation"
    'tartre', // what French vets say for calculus ("calcul dentaire" is the formal term)
    'calcul', // short for "calcul dentaire"
    'stade', // "stade deux" for the PD stage
    'grade', // generic grading word
    'classe', // generic class word (malocclusion, mobility class)
  ],
  de: [
    'Beweglichkeit', // column label; glossary value is "Zahnbeweglichkeit"
    'Lockerungsgrad', // usual German clinical word for the mobility grade
    'Lockerung', // short form of Lockerungsgrad
    'Tasche', // short for "Parodontaltasche" (compounds: GERMAN_COMPOUND_ENDS)
    'Rezession', // short for "Gingivarezession"
    'Furkation', // column label; glossary value is "Furkationsbefall"
    'Stadium', // "Stadium zwei" for the PD stage
    'Grad', // generic grading word
    'Klasse', // generic class word
  ],
  it: [
    'mobilità', // column label; glossary value is "mobilità dentale"
    'tasca', // short for "tasca parodontale"
    'recessione', // short for "recessione gengivale"
    'forcazione', // column label; glossary value is "coinvolgimento della forcazione"
    'calcolo', // formal synonym some vets use instead of "tartaro"
    'stadio', // "stadio due" for the PD stage
    'grado', // generic grading word
    'classe', // generic class word
  ],
  es: [
    'movilidad', // column label; glossary value is "movilidad dental"
    'bolsa', // short for "bolsa periodontal"
    'recesión', // short for "recesión gingival"
    'furca', // column label; glossary value is "lesión de furca"
    'sarro', // lay word Spanish vets say for calculus
    'cálculo', // short for "cálculo dental"
    'estadio', // "estadio dos" for the PD stage
    'grado', // generic grading word
    'clase', // generic class word
  ],
};

/** English abbreviations vets say in every language ("GI deux", "M zwei"). */
export const SCORE_ABBREVIATIONS = ['GI', 'GE', 'G', 'C', 'calc', 'M', 'F', 'PD'];

/** Native score terms for `lng`: the glossary clinical values for
 *  SCORE_GLOSSARY_IDS, then SPOKEN_SYNONYMS, de-duplicated. */
export function nativeScoreTerms(lng: AppLanguage): string[] {
  const fromGlossary = SCORE_GLOSSARY_IDS.map((id) => BY_ID.get(id)?.[lng]).filter((v): v is string => !!v);
  const seen = new Set<string>();
  return [...fromGlossary, ...SPOKEN_SYNONYMS[lng]].filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** German compound words that end in a score term and still mark the next
 *  number as a score ("Zahnfleischtasche drei", "Zahnlockerungsgrad zwei").
 *  Matched as the end of a word, so only long clinical stems belong here:
 *  short generic words ("Tasche", "Grad", "Klasse") would also catch
 *  "Handtasche zwei", "Schwierigkeitsgrad zwei", "Schulklasse drei". */
export const GERMAN_COMPOUND_ENDS = [
  'Zahnfleischtasche', 'Parodontaltasche', 'Knochentasche', 'Gingivaltasche',
  'Beweglichkeit', 'Lockerungsgrad', 'Zahnstein', 'Rezession', 'Furkation', 'Gingivitis',
];

/** Millimetre words, said after a measurement. */
export const UNIT_WORDS: Record<AppLanguage, string[]> = {
  en: [], // English keeps its own unit pattern in numbers.ts.
  fr: ['mm', 'millimètre', 'millimètres'],
  de: ['mm', 'Millimeter', 'Millimetern'],
  it: ['mm', 'millimetro', 'millimetri'],
  es: ['mm', 'milímetro', 'milímetros'],
};

/** What STT writes when a vet says "/" inside an AVDC code ("T slash FX"). */
export const SLASH_WORDS: Record<AppLanguage, string[]> = {
  en: ['slash'],
  fr: ['barre oblique', 'slash'],
  de: ['Schrägstrich', 'slash'],
  it: ['barra', 'slash'],
  es: ['barra', 'diagonal', 'slash'],
};

/** Codes spelled out letter by letter, as STT in each language writes the
 *  letter names, plus the English letter names vets also use for codes.
 *  Keys are matched accent- and case-insensitively, as whole words. */
const ENGLISH_LETTER_NAMES: Record<string, string> = {
  'gee eye': 'GI', 'gee i': 'GI', 'pee dee': 'PD', 'eff': 'F',
};
export const SPELLED_LETTERS: Record<AppLanguage, Record<string, string>> = {
  en: {}, // English keeps its own letter passes in normalizeTranscript.
  fr: { 'gé i': 'GI', 'gé-i': 'GI', 'pé dé': 'PD', 'effe': 'F', 'èf': 'F', ...ENGLISH_LETTER_NAMES },
  de: { 'ge i': 'GI', 'ge-i': 'GI', 'pe de': 'PD', 'eff': 'F', 'ef': 'F', ...ENGLISH_LETTER_NAMES },
  it: { 'gi i': 'GI', 'gi-i': 'GI', 'pi di': 'PD', 'effe': 'F', ...ENGLISH_LETTER_NAMES },
  es: { 'ge i': 'GI', 'ge-i': 'GI', 'pe de': 'PD', 'efe': 'F', ...ENGLISH_LETTER_NAMES },
};

/** Words that on their own carry no finding: a chunk made only of these
 *  (side talk, acknowledgements) is not sent to the model. Multi-word and
 *  elided entries ("d'accord", "va bene") are matched as phrases. */
export const FILLER_WORDS: Record<AppLanguage, string[]> = {
  en: [], // English keeps its own FILLER_WORDS set in aiAutofill.ts.
  fr: ['euh', 'bon', 'voilà', "d'accord", 'ok', 'merci', 'oui', 'non', 'alors', 'donc', 'et'],
  de: ['äh', 'ähm', 'also', 'okay', 'ja', 'nein', 'danke', 'gut', 'und', 'so'],
  it: ['ehm', 'allora', 'ok', 'va bene', 'sì', 'no', 'grazie', 'quindi', 'e'],
  es: ['eh', 'este', 'bueno', 'vale', 'ok', 'sí', 'no', 'gracias', 'entonces', 'y'],
};

/** Hesitation sounds and "ok" spellings STT writes in any language. */
export const UNIVERSAL_FILLERS = ['ok', 'okay', 'hm', 'hmm', 'mm', 'mhm'];

/** Words between a score term and its number ("poche de 5 mm"). */
export const SCORE_LINK_WORDS: Record<AppLanguage, string[]> = {
  en: [],
  fr: ['de', 'à'],
  de: ['von'],
  it: ['di', 'da'],
  es: ['de'],
};
