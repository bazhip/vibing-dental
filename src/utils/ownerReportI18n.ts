import type { TFunction } from 'i18next';
import i18n from '../i18n';
import type { DentalField, ExamFindings } from '../types';
import type { BuiltInSectionId } from './ownerReportConfig';

/**
 * Owner report translations. Every sentence the report generates (the
 * headings, finding phrases, lay tooth names, intro, home-care defaults,
 * legends, labels, and long-form dates) comes from the `report` catalogs
 * (src/locales/<lng>/report.json), so a practice can keep e.g. an English
 * and a Spanish template side by side. Only the grammar that composes a
 * lay tooth name (word order and agreement) lives here, per language.
 *
 * Free text the team typed (chart comments, exam comments, custom
 * sections, per-chart edits) prints as written — it is never machine
 * translated. Only Latin-script languages are offered: the PDF uses the
 * standard Helvetica font (WinAnsi), which covers Western European
 * accents but not other scripts.
 *
 * English strings must stay byte-identical to the original report; the
 * other languages are careful translations that should still get a
 * native-speaker review before marketing them.
 */

export const REPORT_LOCALES = ['en', 'es', 'fr', 'de', 'it', 'pt'] as const;
export type ReportLocale = (typeof REPORT_LOCALES)[number];

export const LOCALE_LABELS: Record<ReportLocale, string> = {
  en: 'English',
  es: 'Español (Spanish)',
  fr: 'Français (French)',
  de: 'Deutsch (German)',
  it: 'Italiano (Italian)',
  pt: 'Português (Portuguese)',
};

export function isReportLocale(v: unknown): v is ReportLocale {
  return typeof v === 'string' && (REPORT_LOCALES as readonly string[]).includes(v);
}

export interface ReportStrings {
  /** BCP-47 tag for Intl date formatting. */
  intlLocale: string;
  defaultTitle: string;
  /** Placeholder fallbacks. */
  yourPet: string;
  ourPractice: string;
  yourTeam: string;
  /** Default section headings; `pet` is '' when the chart has no name. */
  headings: Record<BuiltInSectionId, (pet: string) => string>;
  intro: (pet: string) => string;
  homecareTips: string[];
  fieldPhrases: Record<DentalField, (value: string) => string>;
  fieldPlain: Record<DentalField, string>;
  /** Lay tooth name without the Triadan number, capitalized. */
  toothName: (quadrant: number, position: number, deciduous: boolean) => string;
  species: Record<string, string>;
  examAreas: Record<keyof ExamFindings, string>;
  patientLabel: string;
  ownerLabel: string;
  extractionsLead: string;
  removedToday: string;
  alreadyMissingLine: (list: string) => string;
  abnormalityNoted: string;
  noProblems: string;
  legendNumbers: string;
  legendFilled: string;
  legendRemoved: string;
  before: string;
  after: string;
  preparedBy: (doctor: string, practice: string) => string;
}

const cap = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

type ToothKind = 'incisor' | 'canine' | 'premolar' | 'molar';

/** Tooth type for a Triadan position (1-3 incisors, 4 canine, 5-8
 *  premolars, 9-11 molars) and its 0-based ordinal within the type. */
function toothType(position: number): { kind: ToothKind; ordinal: number } {
  if (position <= 3) return { kind: 'incisor', ordinal: position - 1 };
  if (position === 4) return { kind: 'canine', ordinal: 0 };
  if (position <= 8) return { kind: 'premolar', ordinal: position - 5 };
  return { kind: 'molar', ordinal: position - 9 };
}

const INTL_LOCALES: Record<ReportLocale, string> = {
  en: 'en-US',
  es: 'es',
  fr: 'fr',
  de: 'de',
  it: 'it',
  pt: 'pt',
};

const SIDE_KEYS = { 1: 'upperRight', 2: 'upperLeft', 3: 'lowerLeft', 4: 'lowerRight' } as const;
const ORDINAL_KEYS = ['first', 'second', 'third', 'fourth'] as const;

/** One tooth's words, looked up in the report catalog. */
interface ToothWords {
  side: string;
  ordinal: string;
  kind: string;
  isCanine: boolean;
  deciduous: string;
}

/** Word order per language. The catalog supplies the words, already in
 *  the right gender and case (French nouns are feminine, Italian and
 *  Spanish masculine, German uses the strong article-less declension). */
type ToothGrammar = (w: ToothWords, deciduous: boolean) => string;

/** English: "baby upper right canine tooth", "lower left first molar". */
const prefixGrammar: ToothGrammar = (w, deciduous) => {
  const tooth = w.isCanine ? w.kind : `${w.ordinal} ${w.kind}`;
  return `${deciduous ? `${w.deciduous} ` : ''}${w.side} ${tooth}`.trim();
};

/** Romance: "canino superior derecho de leche", "première molaire inférieure gauche". */
const romanceGrammar: ToothGrammar = (w, deciduous) => {
  const tooth = w.isCanine ? w.kind : `${w.ordinal} ${w.kind}`;
  return `${tooth} ${w.side}${deciduous ? ` ${w.deciduous}` : ''}`.trim();
};

/** German: "Zweiter oberer linker Prämolar", "Unterer rechter Eckzahn (Milchzahn)". */
const germanGrammar: ToothGrammar = (w, deciduous) => {
  const name = w.isCanine ? `${w.side} ${w.kind}` : `${w.ordinal} ${w.side} ${w.kind}`;
  return `${name.replace(/\s+/g, ' ').trim()}${deciduous ? ` ${w.deciduous}` : ''}`;
};

const TOOTH_GRAMMAR: Record<ReportLocale, ToothGrammar> = {
  en: prefixGrammar,
  es: romanceGrammar,
  fr: romanceGrammar,
  de: germanGrammar,
  it: romanceGrammar,
  pt: romanceGrammar,
};

/** Headings that name the pet have a `_named` and `_unnamed` key, so each
 *  language can word both cases naturally. */
const PET_SECTIONS = ['diagram', 'homecare'] as const satisfies readonly BuiltInSectionId[];
const PLAIN_SECTIONS = [
  'extractions', 'findings', 'alreadyMissing', 'examNotes', 'photos', 'teamNote', 'recheck',
] as const satisfies readonly BuiltInSectionId[];

const DENTAL_FIELDS = [
  'mobility', 'recession', 'pocket', 'furcation',
  'hyperplasia', 'calculus', 'gingivitis', 'pdstate',
] as const satisfies readonly DentalField[];

const EXAM_AREAS = [
  'extraoral', 'lymph', 'buccal', 'tongue', 'palate', 'pharynx',
] as const satisfies readonly (keyof ExamFindings)[];

const SPECIES_KEYS = ['feline', 'canine', 'feline-deciduous', 'canine-deciduous'] as const;

const HOMECARE_TIP_KEYS = ['brushing', 'products', 'warningSigns'] as const;

function buildStrings(locale: ReportLocale): ReportStrings {
  const t: TFunction<'report'> = i18n.getFixedT(locale, 'report');
  const yourPet = t('yourPet');
  const grammar = TOOTH_GRAMMAR[locale];
  const map = <K extends string, V>(keys: readonly K[], f: (k: K) => V) =>
    Object.fromEntries(keys.map((k) => [k, f(k)])) as Record<K, V>;

  return {
    intlLocale: INTL_LOCALES[locale],
    defaultTitle: t('defaultTitle'),
    yourPet,
    ourPractice: t('ourPractice'),
    yourTeam: t('yourTeam'),
    headings: {
      ...map(PET_SECTIONS, (id) => (pet: string) =>
        pet ? t(`headings.${id}_named`, { pet }) : t(`headings.${id}_unnamed`)),
      ...map(PLAIN_SECTIONS, (id) => () => t(`headings.${id}`)),
    },
    // Without a name the sentence opens with the capitalized "your pet".
    intro: (pet) => t('intro', { pet: pet || cap(yourPet) }),
    homecareTips: HOMECARE_TIP_KEYS.map((k) => t(`homecareTips.${k}`)),
    fieldPhrases: map(DENTAL_FIELDS, (f) => (value: string) => t(`fieldPhrases.${f}`, { value })),
    fieldPlain: map(DENTAL_FIELDS, (f) => t(`fieldPlain.${f}`)),
    toothName: (quadrant, position, deciduous) => {
      const { kind, ordinal } = toothType(position);
      const sideKey = SIDE_KEYS[quadrant as keyof typeof SIDE_KEYS];
      return cap(grammar({
        side: sideKey ? t(`tooth.sides.${sideKey}`) : '',
        ordinal: t(`tooth.ordinals.${ORDINAL_KEYS[ordinal]}`),
        kind: t(`tooth.kinds.${kind}`),
        isCanine: kind === 'canine',
        deciduous: t('tooth.deciduous'),
      }, deciduous));
    },
    species: map(SPECIES_KEYS, (k) => t(`species.${k}`)),
    examAreas: map(EXAM_AREAS, (a) => t(`examAreas.${a}`)),
    patientLabel: t('patientLabel'),
    ownerLabel: t('ownerLabel'),
    extractionsLead: t('extractionsLead'),
    removedToday: t('removedToday'),
    alreadyMissingLine: (list) => t('alreadyMissingLine', { list }),
    abnormalityNoted: t('abnormalityNoted'),
    noProblems: t('noProblems'),
    legendNumbers: t('legendNumbers'),
    legendFilled: t('legendFilled'),
    legendRemoved: t('legendRemoved'),
    before: t('before'),
    after: t('after'),
    preparedBy: (doctor, practice) => {
      const name = doctor || t('preparedBy.team');
      return practice ? t('preparedBy.doctorAtPractice', { doctor: name, practice }) : t('preparedBy.doctor', { doctor: name });
    },
  };
}

const cache = new Map<ReportLocale, ReportStrings>();

export function reportStrings(locale: ReportLocale | undefined): ReportStrings {
  const lng = isReportLocale(locale) ? locale : 'en';
  let strings = cache.get(lng);
  if (!strings) {
    strings = buildStrings(lng);
    cache.set(lng, strings);
  }
  return strings;
}

/** Format a yyyy-mm-dd chart date for the report. 'iso' keeps the value
 *  as charted (the original behaviour); 'long' spells it out in the
 *  report language ("19 de julio de 2026"). Unparseable input passes
 *  through untouched. */
export function formatReportDate(value: string, locale: ReportLocale, style: 'iso' | 'long'): string {
  if (!value || style === 'iso') return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(reportStrings(locale).intlLocale, { dateStyle: 'long' }).format(date);
  } catch {
    return value;
  }
}
