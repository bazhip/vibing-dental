import {
  fold,
  NOT_AFTER,
  NOT_BEFORE,
  replaceFolded,
  replaceSpokenNumbers,
  scoreTermPattern,
  unitPattern,
  type OtherLanguage,
} from './numbers';
import { FILLER_WORDS, SCORE_LINK_WORDS, SLASH_WORDS, SPELLED_LETTERS, UNIVERSAL_FILLERS } from './terms';

// Transcript cleanup and filters for fr/de/it/es. English keeps its original
// code in aiAutofill.ts; these mirror its passes with the native vocabulary
// from ./terms. Matching is accent- and case-insensitive (on a folded copy).

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Folded alternation, longest first; spaces/hyphens inside a phrase match
 *  any run of spaces or hyphens. */
const phraseAlt = (list: string[]) =>
  [...new Set(list.map((w) => fold(w)))]
    .sort((a, b) => b.length - a.length)
    .map((w) => escapeRe(w).replace(/[\s-]+/g, '[\\s-]+'))
    .join('|');

interface Patterns {
  slash: RegExp;
  spelled: RegExp;
  spelledMap: Map<string, string>;
  scoreRunIntoTooth: RegExp;
  scorePause: RegExp;
  fillerPhrases: RegExp;
  fillerWords: Set<string>;
  perioScore: RegExp;
  perioMeasure: RegExp;
}

const cache = new Map<OtherLanguage, Patterns>();

function patterns(lng: OtherLanguage): Patterns {
  const hit = cache.get(lng);
  if (hit) return hit;
  const score = scoreTermPattern(lng);
  const units = unitPattern(lng);
  const spelledMap = new Map(
    Object.entries(SPELLED_LETTERS[lng]).map(([k, v]) => [fold(k).replace(/[\s-]+/g, ' '), v]),
  );
  const fillers = [...FILLER_WORDS[lng], ...UNIVERSAL_FILLERS].map((w) => fold(w).replace(/[’']/g, "'"));
  const phrases = fillers.filter((w) => /[\s']/.test(w));
  const link = SCORE_LINK_WORDS[lng].length ? `(?:(?:${phraseAlt(SCORE_LINK_WORDS[lng])})\\s+)?` : '';
  const p: Patterns = {
    // Only between two short code-like tokens ("T barra FX"), so ordinary
    // words stay: "fractura diagonal de la corona", "la barra".
    slash: new RegExp(
      `(?<=(?:^|[\\s,.;:/])[\\p{L}\\p{N}]{1,5})\\s*${NOT_BEFORE}(?:${phraseAlt(SLASH_WORDS[lng])})${NOT_AFTER}\\s*(?=[\\p{L}\\p{N}]{1,5}(?![\\p{L}\\p{N}]))`,
      'giu',
    ),
    spelled: new RegExp(`${NOT_BEFORE}(?:${phraseAlt([...spelledMap.keys()])})${NOT_AFTER}`, 'giu'),
    spelledMap,
    scoreRunIntoTooth: new RegExp(`(${score})\\s+(\\d)([1-8][0-1]\\d)\\b`, 'giu'),
    scorePause: new RegExp(`(${score})\\.\\s+(?=\\d)`, 'giu'),
    // No multi-word fillers: a pattern that never matches (an empty
    // alternation would match between every character).
    fillerPhrases: phrases.length ? new RegExp(`${NOT_BEFORE}(?:${phraseAlt(phrases)})${NOT_AFTER}`, 'gu') : /(?!)/gu,
    fillerWords: new Set(fillers.filter((w) => !/[\s']/.test(w))),
    perioScore: new RegExp(`${score}\\s*[-:=]?\\s*${link}\\d+(?:\\s*(?:${units}))?${NOT_AFTER}`, 'giu'),
    perioMeasure: new RegExp(`${NOT_BEFORE}\\d+\\s*(?:${units})${NOT_AFTER}`, 'giu'),
  };
  cache.set(lng, p);
  return p;
}

/** normalizeTranscript for fr/de/it/es: same passes as English, native words. */
export function normalizeOther(raw: string, lng: OtherLanguage): string {
  const p = patterns(lng);
  let text = raw.normalize('NFC');

  // Split digits run into letters ("104GI2"); code+digit pairs rejoin below.
  text = text.replace(/(\d)(?=\p{L})/gu, '$1 ').replace(/(\p{L})(?=\d)/gu, '$1 ');

  // AVDC codes dictated as words: "T barre oblique FX" → "T/FX".
  text = replaceFolded(text, p.slash, () => '/');
  // "AT" (attrition) heard as "8T".
  text = text.replace(/\b([1-8][0-1]\d)\s*8\s*T\b/g, '$1 AT');

  // Codes spelled out letter by letter: "gé i" → "GI", "effe" → "F".
  text = replaceFolded(text, p.spelled, (m) => p.spelledMap.get(m[0].replace(/[\s-]+/g, ' ')) ?? null);
  // Single letters with a break between them, in any language: "G. I." → "GI".
  text = text.replace(/\bg[\s.-]+i\b/gi, 'GI');

  // A score run into the next tooth number: "GI 2104" → "GI 2 104".
  text = replaceFolded(text, p.scoreRunIntoTooth, (m) => `${text.slice(m.index, m.index + m[1].length)} ${m[2]} ${m[3]}`);

  // Spoken numbers: scores, compound hundreds, measurements, digit runs.
  text = replaceSpokenNumbers(text, lng);

  // A pause before the value gets punctuated ("Mobilité. 2"): rejoin it.
  text = replaceFolded(text, p.scorePause, (m) => `${text.slice(m.index, m.index + m[1].length)} `);

  // "P D" → "PD"; then "PD 2" → "PD2", "M 2" → "M2", "F 3" → "F3".
  text = text.replace(/\bP[\s-]+D\b/gi, 'PD');
  text = text.replace(/\b(PD|M|C|F|G)[\s-]*(\d)\b/gi, (_, code, digit) => `${code.toUpperCase()}${digit}`);

  return text.replace(/\s+/g, ' ').trim();
}

/** chunkWorthSending for fr/de/it/es: false only for pure filler. */
export function chunkWorthSendingOther(chunk: string, lng: OtherLanguage): boolean {
  const p = patterns(lng);
  const text = chunk.replace(/\bSpeaker \d+:\s*/gi, '').trim();
  if (text.length < 2) return /\d/.test(text);
  if (/\d/.test(text)) return true;
  const folded = fold(text.normalize('NFC').replace(/\[\?([^\]]*)\]/g, '$1')).replace(/’/g, "'");
  const words = folded.replace(p.fillerPhrases, ' ').match(/[\p{L}/]+/gu) ?? [];
  return words.some((w) => !p.fillerWords.has(w));
}

/** isPerioOnlyText for fr/de/it/es: the native score terms and units, plus
 *  the English ones vets also say. */
export function isPerioOnlyOther(text: string, lng: OtherLanguage, english: (t: string) => string): boolean {
  const p = patterns(lng);
  const folded = fold(text.normalize('NFC'));
  const rest = english(folded.replace(p.perioScore, ' ').replace(p.perioMeasure, ' '))
    .replace(/[\s,.;/]+/g, '');
  return text.trim().length > 0 && rest.length === 0;
}
