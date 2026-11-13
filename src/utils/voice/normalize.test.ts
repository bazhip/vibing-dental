import { describe, expect, it } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS } from '../../types';
import {
  normalizeTranscript,
  chunkWorthSending,
  isPerioOnlyText,
  actionAllowedAnywhere,
  actionAllowedInSection,
  buildChunkRequest,
  buildReviewRequest,
  type ChartContext,
} from '../aiAutofill';
import { replaceSpokenNumbers } from './numbers';
import snapshot from './__fixtures__/en-normalize-snapshot.json';
import sampleTranscript from '../../../scripts/fixtures/sample-transcript.txt?raw';
import aiAutofillTestSource from '../aiAutofill.test.ts?raw';
import type { AppLanguage } from '../../i18n/config';

type Lng = Exclude<AppLanguage, 'en'>;

// ----- English: byte-identical ---------------------------------------------

// Frozen copies of the English filters as they were before this change.
const OLD_FILLER = new Set([
  'ok', 'okay', 'k', 'yeah', 'yep', 'yes', 'no', 'nope', 'um', 'uh', 'umm', 'uhh', 'hmm', 'mm', 'mhm',
  'thanks', 'thank', 'you', 'got', 'it', 'alright', 'all', 'right', 'cool', 'sure', 'great', 'good',
  'perfect', 'nice', 'so', 'and', 'oh',
]);
function oldChunkWorthSending(chunk: string): boolean {
  const text = chunk.replace(/\bSpeaker \d+:\s*/gi, '').trim();
  if (text.length < 2) return /\d/.test(text);
  if (/\d/.test(text)) return true;
  const words = text.toLowerCase().replace(/\[\?([^\]]*)\]/g, '$1').match(/[a-z/]+/g) ?? [];
  return words.some((w) => !OLD_FILLER.has(w));
}
function oldIsPerioOnlyText(text: string): boolean {
  const rest = text
    .replace(/\b(?:GI|G|C|calc(?:ulus)?|M|mob(?:ility)?|F|furc(?:ation)?|PD|stage|grade|class|gingivitis|pocket|recession)\s*[-:=]?\s*\d+(?:\s*mm)?\b/gi, '')
    .replace(/\b\d+\s*(?:mm|millimet(?:er|re)s?)\s*(?:pocket|recession)?\b/gi, '')
    .replace(/[\s,.;/]+/g, '');
  return text.trim().length > 0 && rest.length === 0;
}

function englishInputs(): string[] {
  const lines = sampleTranscript.split('\n');
  const literals = [...aiAutofillTestSource.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1].replace(/\\(.)/g, (_e, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)));
  return [...new Set([...lines, ...lines.map((l) => l.replace(/^\[[^\]]*\]\s*/, '')), ...literals])];
}

describe('English stays byte-identical', () => {
  it("normalizeTranscript(line, 'en') equals the snapshot captured before the change", () => {
    const lines = sampleTranscript.split('\n');
    const snap = new Map(snapshot as [string, string][]);
    for (const line of lines) {
      expect(snap.has(line), line).toBe(true);
      expect(normalizeTranscript(line, 'en'), line).toBe(snap.get(line));
      expect(normalizeTranscript(line), line).toBe(snap.get(line));
    }
    for (const [input, output] of snapshot as [string, string][]) {
      expect(normalizeTranscript(input, 'en'), input).toBe(output);
    }
  });
  it('chunkWorthSending and isPerioOnlyText match the old English filters', () => {
    const inputs = englishInputs();
    expect(inputs.length).toBeGreaterThan(150);
    for (const input of inputs) {
      expect(chunkWorthSending(input, 'en'), input).toBe(oldChunkWorthSending(input));
      expect(chunkWorthSending(input), input).toBe(oldChunkWorthSending(input));
      expect(isPerioOnlyText(input, 'en'), input).toBe(oldIsPerioOnlyText(input));
      expect(isPerioOnlyText(input), input).toBe(oldIsPerioOnlyText(input));
    }
  });
});

// ----- Per-language dictation ----------------------------------------------

const NORMALIZE: Record<Lng, [string, string][]> = {
  fr: [
    // scores, units
    ['cent quatre GI deux, tartre un, poche cinq millimètres', '104 GI 2, tartre 1, poche 5 millimètres'],
    // multi-tooth runs
    ['cent quatre, cent cinq, cent six fracturées', '104, 105, 106 fracturées'],
    ['trois cent neuf trois cent dix trois cent onze absentes', '309 310 311 absentes'],
    ['un zéro quatre un zéro cinq tartre deux', '104 105 tartre 2'],
    // score followed by a tooth number
    ['calcul deux cent quatre', 'calcul 2 104'],
    ['mobilité trois un zéro trois', 'mobilité 3 103'],
    ['GI 2104', 'GI 2 104'],
    ['Mobilité. Deux', 'Mobilité 2'],
    // millimetres
    ['poche de six millimètres en distal', 'poche de 6 millimètres en distal'],
    ['récession deux millimètres sur la trois cent neuf', 'récession 2 millimètres sur la 309'],
    ['poche 5 mm', 'poche 5 mm'],
    // spelled GI / F
    ['gé i deux sur la cent un', 'GI 2 sur la 101'],
    ['effe trois sur la cent huit', 'F3 sur la 108'],
    ['pé dé trois', 'PD3'],
    ['cent quatre M deux', '104 M2'],
    // slash codes and mixed English codes
    ['cent quatre T barre oblique FX barre oblique CCF', '104 T/FX/CCF'],
    ['deux cent quatre T slash FX', '204 T/FX'],
    // staging
    ['stade trois', 'stade 3'],
    // speculative phrasing is left for Claude
    ['on va peut-être extraire la deux cent neuf', 'on va peut-être extraire la 209'],
    // short real finding
    ['cinq cent quatre fracturée', '504 fracturée'],
  ],
  de: [
    ['hundertvier GI zwei, Zahnstein eins, Tasche fünf Millimeter', '104 GI 2, Zahnstein 1, Tasche 5 Millimeter'],
    ['hundertvier, hundertfünf, hundertsechs frakturiert', '104, 105, 106 frakturiert'],
    ['dreihundertneun dreihundertzehn dreihundertelf fehlen', '309 310 311 fehlen'],
    ['Zahnstein zwei hundertacht', 'Zahnstein 2 108'],
    ['Lockerungsgrad drei eins null drei', 'Lockerungsgrad 3 103'],
    ['GI 2104', 'GI 2 104'],
    ['Beweglichkeit. Zwei', 'Beweglichkeit 2'],
    ['Zahnfleischtasche sechs Millimeter distal', 'Zahnfleischtasche 6 Millimeter distal'],
    ['Gingivarezession zwei Millimeter an dreihundertneun', 'Gingivarezession 2 Millimeter an 309'],
    ['Tasche 5 mm', 'Tasche 5 mm'],
    ['ge i zwei an hundertvier', 'GI 2 an 104'],
    ['eff drei an dreihundertneun', 'F3 an 309'],
    ['pe de drei', 'PD3'],
    ['hundertvier M zwo', '104 M2'],
    ['hundertvier T Schrägstrich FX Schrägstrich CCF', '104 T/FX/CCF'],
    ['zweihundertvier T slash FX', '204 T/FX'],
    ['Stadium drei', 'Stadium 3'],
    ['Grad zwei, Klasse drei', 'Grad 2, Klasse 3'],
    ['zweihundertneun eventuell extrahieren', '209 eventuell extrahieren'],
    ['fünfhundertvier frakturiert', '504 frakturiert'],
  ],
  it: [
    ['centoquattro GI due, tartaro uno, tasca cinque millimetri', '104 GI 2, tartaro 1, tasca 5 millimetri'],
    ['centoquattro, centocinque, centosei fratturati', '104, 105, 106 fratturati'],
    ['trecentonove trecentodieci trecentoundici assenti', '309 310 311 assenti'],
    ['tartaro due centotto', 'tartaro 2 108'],
    ['mobilità tre uno zero tre', 'mobilità 3 103'],
    ['GI 2104', 'GI 2 104'],
    ['Mobilità. Due', 'Mobilità 2'],
    ['tasca di sei millimetri in distale', 'tasca di 6 millimetri in distale'],
    ['recessione due millimetri sul trecentonove', 'recessione 2 millimetri sul 309'],
    ['tasca 5 mm', 'tasca 5 mm'],
    ['gi i due sul centouno', 'GI 2 sul 101'],
    ['effe tre sul trecentonove', 'F3 sul 309'],
    ['pi di tre', 'PD3'],
    ['centoquattro M due', '104 M2'],
    ['centoquattro T barra FX barra CCF', '104 T/FX/CCF'],
    ['duecentoquattro T slash FX', '204 T/FX'],
    ['stadio tre', 'stadio 3'],
    ['forse estraiamo il duecentonove', 'forse estraiamo il 209'],
    ['cinquecentoquattro fratturato', '504 fratturato'],
  ],
  es: [
    ['ciento cuatro GI dos, sarro uno, bolsa cinco milímetros', '104 GI 2, sarro 1, bolsa 5 milímetros'],
    ['ciento cuatro, ciento cinco, ciento seis fracturados', '104, 105, 106 fracturados'],
    ['trescientos nueve trescientos diez trescientos once ausentes', '309 310 311 ausentes'],
    ['cálculo dos ciento ocho', 'cálculo 2 108'],
    ['movilidad tres uno cero tres', 'movilidad 3 103'],
    ['GI 2104', 'GI 2 104'],
    ['Movilidad. Dos', 'Movilidad 2'],
    ['bolsa de seis milímetros en distal', 'bolsa de 6 milímetros en distal'],
    ['recesión dos milímetros en el trescientos nueve', 'recesión 2 milímetros en el 309'],
    ['bolsa 5 mm', 'bolsa 5 mm'],
    ['ge i dos en el ciento uno', 'GI 2 en el 101'],
    ['efe tres en el trescientos nueve', 'F3 en el 309'],
    ['pe de tres', 'PD3'],
    ['ciento cuatro M dos', '104 M2'],
    ['ciento cuatro T barra FX barra CCF', '104 T/FX/CCF'],
    ['doscientos cuatro T diagonal FX', '204 T/FX'],
    ['doscientos cuatro T slash FX', '204 T/FX'],
    ['estadio tres', 'estadio 3'],
    ['quizás extraer el doscientos nueve', 'quizás extraer el 209'],
    ['quinientos cuatro fracturado', '504 fracturado'],
  ],
};

describe.each(Object.keys(NORMALIZE) as Lng[])('normalizeTranscript — %s', (lng) => {
  it('has at least 15 dictation lines', () => {
    expect(NORMALIZE[lng].length).toBeGreaterThanOrEqual(15);
  });
  it.each(NORMALIZE[lng])('%s → %s', (input, expected) => {
    expect(normalizeTranscript(input, lng)).toBe(expected);
  });
  it('collapses whitespace and strips speaker prefixes like English', () => {
    expect(normalizeTranscript('  GI   2  ', lng)).toBe('GI 2');
  });
});

describe('slash words only between codes', () => {
  it.each([
    ['es', 'fractura diagonal de la corona'],
    ['es', 'línea diagonal'],
    ['it', 'frattura a barra verticale'],
    ['fr', 'la radio montre une ligne, slash'],
  ] as [Lng, string][])('%s: %s stays', (lng, input) => {
    expect(normalizeTranscript(input, lng)).toBe(input);
  });
  it.each([
    ['es', 'ciento cuatro t barra fx', '104 t/fx'],
    ['it', 'T/FX barra CCF', 'T/FX/CCF'],
    ['de', 'RTR Schrägstrich 104', 'RTR/104'],
  ] as [Lng, string, string][])('%s: %s → %s', (lng, input, expected) => {
    expect(normalizeTranscript(input, lng)).toBe(expected);
  });
});

describe('German compound endings (carry-forward)', () => {
  it.each([
    'Handtasche zwei', 'Schwierigkeitsgrad zwei', 'Schulklasse drei', 'Kaffeetasche drei',
  ])('leaves an ordinary compound alone: %s', (input) => {
    expect(replaceSpokenNumbers(input, 'de')).toBe(input);
    expect(normalizeTranscript(input, 'de')).toBe(input);
  });
  it.each([
    ['Zahnfleischtasche drei', 'Zahnfleischtasche 3'],
    ['Parodontaltasche fünf Millimeter', 'Parodontaltasche 5 Millimeter'],
    ['Knochentasche vier', 'Knochentasche 4'],
    ['Zahnbeweglichkeit zwei', 'Zahnbeweglichkeit 2'],
    ['Zahnlockerungsgrad zwei', 'Zahnlockerungsgrad 2'],
    ['Oberkieferzahnstein eins', 'Oberkieferzahnstein 1'],
    ['Grad zwei', 'Grad 2'],
    ['Klasse drei', 'Klasse 3'],
    ['Tasche vier', 'Tasche 4'],
  ])('real dental terms still convert: %s', (input, expected) => {
    expect(replaceSpokenNumbers(input, 'de')).toBe(expected);
  });
});

// ----- chunkWorthSending ---------------------------------------------------

const FILLER_ONLY: Record<Lng, string[]> = {
  fr: ['euh, bon, d\'accord, merci', 'oui alors voilà', 'Speaker 1: ok merci', 'Bon. Donc. Et euh…', 'D’accord, oui, non'],
  de: ['äh, also, ja, danke', 'okay gut', 'Speaker 1: ja so', 'Ähm, nein, und also…'],
  it: ['ehm, allora, va bene, grazie', 'sì sì ok', 'Speaker 1: no, quindi', 'Va bene, grazie e allora'],
  es: ['eh, bueno, vale, gracias', 'sí, entonces', 'Speaker 1: ok, no', 'Este… bueno, y vale'],
};
const REAL: Record<Lng, string[]> = {
  fr: ['504 fracturée', 'dent fracturée', 'et la suivante aussi', 'oui, tartre partout', 'barre oblique'],
  de: ['504 frakturiert', 'Zahn frakturiert', 'und der nächste auch', 'ja, Zahnstein überall'],
  it: ['504 fratturato', 'dente fratturato', 'e anche il successivo', 'sì, tartaro ovunque'],
  es: ['504 fracturado', 'diente fracturado', 'y el siguiente también', 'sí, sarro en todos', 'este diente'],
};

describe.each(Object.keys(FILLER_ONLY) as Lng[])('chunkWorthSending — %s', (lng) => {
  it.each(FILLER_ONLY[lng])('rejects side talk: %s', (chunk) => {
    expect(chunkWorthSending(chunk, lng)).toBe(false);
  });
  it.each(REAL[lng])('sends a real finding: %s', (chunk) => {
    expect(chunkWorthSending(chunk, lng)).toBe(true);
  });
  it('handles empty and one-character chunks like English', () => {
    expect(chunkWorthSending('', lng)).toBe(false);
    expect(chunkWorthSending('5', lng)).toBe(true);
    expect(chunkWorthSending('e', lng)).toBe(false);
  });
});

// ----- isPerioOnlyText -----------------------------------------------------

const PERIO: Record<Lng, { yes: string[]; no: string[] }> = {
  fr: {
    yes: ['GI 2, tartre 1, poche 5 mm', 'mobilité 2', 'poche de 6 millimètres', 'Récession 2 mm; furcation 1', 'GI 2, calc 1, M3', 'stade 3'],
    no: ['T/FX', '104 T/FX', 'dent fracturée', 'GI 2, fracture'],
  },
  de: {
    yes: ['GI 2, Zahnstein 1, Tasche 5 mm', 'Lockerungsgrad 2, Zahnfleischtasche 4 mm', 'Beweglichkeit 1', '6 Millimeter', 'Stadium 2'],
    no: ['T/FX', '104 T/FX', 'Zahn frakturiert', 'Handtasche 2'],
  },
  it: {
    yes: ['GI 2, tartaro 1, tasca 5 mm', 'mobilità 2', 'tasca di 6 millimetri', 'recessione 2 mm, forcazione 1', 'stadio 3'],
    no: ['T/FX', '104 T/FX', 'dente fratturato'],
  },
  es: {
    yes: ['GI 2, sarro 1, bolsa 5 mm', 'movilidad 2', 'bolsa de 6 milímetros', 'recesión 2 mm, furca 1', 'estadio 3'],
    no: ['T/FX', '104 T/FX', 'diente fracturado'],
  },
};

describe.each(Object.keys(PERIO) as Lng[])('isPerioOnlyText — %s', (lng) => {
  it.each(PERIO[lng].yes)('true for scores only: %s', (text) => {
    expect(isPerioOnlyText(text, lng)).toBe(true);
  });
  it.each(PERIO[lng].no)('false for a finding: %s', (text) => {
    expect(isPerioOnlyText(text, lng)).toBe(false);
  });
  it('false for empty text', () => {
    expect(isPerioOnlyText('  ', lng)).toBe(false);
  });
  it('threads into the section filters', () => {
    const perio = { name: 'add_comment', input: { triadan: 104, text: PERIO[lng].yes[0], diagram: 'pre' } };
    const finding = { name: 'add_comment', input: { triadan: 104, text: 'T/FX', diagram: 'pre' } };
    expect(actionAllowedAnywhere(perio, lng)).toBe(false);
    expect(actionAllowedAnywhere(finding, lng)).toBe(true);
    expect(actionAllowedInSection(perio, 'charting', lng)).toBe(false);
    expect(actionAllowedInSection(finding, 'charting', lng)).toBe(true);
  });
});

// ----- Request builders ----------------------------------------------------

const context: ChartContext = {
  patientInfo: {
    patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
    date: '', complaint: '', treatmentReport: '', recallDate: '',
    nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
  },
  species: 'canine', logo: 'socal', toothData: [],
  preMarks: {}, preComments: [], postMarks: {}, postComments: [],
};

describe('request builders thread the language', () => {
  it('buildChunkRequest drops native filler and cleans native numbers', () => {
    expect(buildChunkRequest({ delta: 'euh, bon, merci', recentContext: '', context, lng: 'fr' })).toBeNull();
    const req = buildChunkRequest({ delta: 'cinq cent quatre fracturée', recentContext: '', context, lng: 'fr' });
    expect(req).not.toBeNull();
    expect(req!.messages[0].content[0].text).toContain('AUTO-CLEANED:\n504 fracturée');
  });
  it('buildChunkRequest defaults to English', () => {
    // "merci" is not an English filler word, so English sends it.
    expect(buildChunkRequest({ delta: 'euh, bon, merci', recentContext: '', context })).not.toBeNull();
  });
  it('buildReviewRequest drops a filler-only transcript in the given language', () => {
    expect(buildReviewRequest({ transcript: 'ja\ndanke\nalso gut', context, rejected: [], lng: 'de' })).toBeNull();
    expect(buildReviewRequest({ transcript: 'ja\ndanke\nalso gut', context, rejected: [] })).not.toBeNull();
  });
});
