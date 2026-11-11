import { ChartSnapshot, DentalField, EXAM_ITEMS } from '../types';
import {
  BuiltInSectionId,
  DEFAULT_TEMPLATE,
  OwnerReportContext,
  OwnerReportTemplate,
  PlaceholderValues,
  fillPlaceholders,
  isCustomSection,
  resolveTemplate,
} from './ownerReportConfig';
import { ReportLocale, formatReportDate, reportStrings } from './ownerReportI18n';

/**
 * Owner report model — the chart's structured findings translated into
 * plain language for the pet's owner. Fully deterministic: every sentence
 * comes from the mapping tables (ownerReportI18n), so the report needs no
 * AI, works offline, and never invents a finding that isn't on the chart.
 * The practice's template (ownerReportConfig) decides language, section
 * order/visibility, headings and default wording.
 */

export interface OwnerReportTooth {
  triadan: number;
  /** e.g. "Upper right canine (104)". */
  layName: string;
  /** Plain-language findings for this tooth, in chart order. */
  notes: string[];
  /** True when the tooth was extracted during this visit. */
  extracted: boolean;
}

/** One printable section, in template order (disabled ones are absent). */
export type OwnerReportRenderSection =
  | {
      kind: 'builtin';
      id: BuiltInSectionId;
      /** Resolved heading (custom, or the default). */
      heading: string;
      /** True when the template set its own heading. */
      customHeading: boolean;
    }
  | { kind: 'custom'; id: string; heading: string; body: string };

export interface OwnerReportModel {
  /** Language of the generated text (and the PDF's fixed labels). */
  locale: ReportLocale;
  /** Header title (top right of page one); '' = none. */
  title: string;
  /** Enabled sections in print order. */
  sections: OwnerReportRenderSection[];
  /** Template closing note ('' = none), placeholders filled. */
  closingNote: string;
  /** Small contact line for the bottom of each page ('' = none). */
  footer: string;
  patientName: string;
  ownerName: string;
  speciesLabel: string;
  visitDate: string;
  recallDate: string;
  /** Opening paragraph — generated, templated, or hand-edited. */
  intro: string;
  /** Home-care tips, one per bullet — defaults or edited. */
  homecareTips: string[];
  /** Optional extra note from the team ('' = omit the section). */
  extraNotes: string;
  /** Lay names of teeth that were already missing before this visit. */
  alreadyMissing: string[];
  /** Lay names of teeth extracted during this visit. */
  extracted: string[];
  /** Per-tooth findings (teeth with nothing recorded are omitted —
   *  standard charting convention: blank means healthy). */
  teeth: OwnerReportTooth[];
  /** Abnormal oral-exam areas with their comments. */
  examNotes: { area: string; comment: string }[];
}

/** "Upper right canine (104)", "lower left first molar (309)",
 *  "baby upper right canine (504)". `showNumber: false` drops the
 *  Triadan number in parentheses; `locale` picks the language. */
export function toothLayName(triadan: number, showNumber = true, locale: ReportLocale = 'en'): string {
  let quadrant = Math.floor(triadan / 100);
  const position = triadan % 100;
  const deciduous = quadrant >= 5;
  if (deciduous) quadrant -= 4;
  const name = reportStrings(locale).toothName(quadrant, position, deciduous);
  return showNumber ? `${name} (${triadan})` : name;
}

const FIELD_ORDER: DentalField[] = [
  'mobility', 'recession', 'pocket', 'furcation',
  'hyperplasia', 'calculus', 'gingivitis', 'pdstate',
];

/** The auto-generated opening paragraph (editable in the Owner Report
 *  section — this is the prefill). */
export function generatedIntro(patientName: string, locale: ReportLocale = 'en'): string {
  return reportStrings(locale).intro(patientName);
}

/** Default home-care advice — the prefill for the editable tips block. */
export const DEFAULT_HOMECARE_TIPS = reportStrings('en').homecareTips;

/** Values for the {pet}/{owner}/... placeholders, with friendly
 *  fallbacks so a blank chart field never leaves a hole mid-sentence. */
export function placeholderValuesFor(
  snapshot: ChartSnapshot,
  ctx: Pick<OwnerReportContext, 'practiceName' | 'doctorName'> = {},
  template: OwnerReportTemplate = DEFAULT_TEMPLATE
): PlaceholderValues {
  const t = reportStrings(template.language);
  const info = snapshot.patientInfo;
  return {
    pet: info.patientName?.trim() || t.yourPet,
    owner: info.ownerName?.trim() ?? '',
    species: (t.species[snapshot.species] ?? snapshot.species ?? '').toLowerCase(),
    date: formatReportDate(info.date ?? '', template.language, template.dateFormat),
    practice: ctx.practiceName?.trim() || t.ourPractice,
    doctor: info.doctor?.trim() || ctx.doctorName?.trim() || t.yourTeam,
  };
}

/** The template's intro (placeholders filled), or the generated one when
 *  the template leaves it blank. Per-chart edits still win over this. */
export function templateIntro(
  snapshot: ChartSnapshot,
  template: OwnerReportTemplate,
  values: PlaceholderValues
): string {
  return template.introTemplate.trim()
    ? fillPlaceholders(template.introTemplate, values).trim()
    : generatedIntro(snapshot.patientInfo.patientName, template.language);
}

/** The template's home-care tips, or the language's defaults when blank. */
export function templateHomecareTips(template: OwnerReportTemplate, values: PlaceholderValues): string[] {
  const tips = template.homecareTips.map((t) => t.trim()).filter(Boolean);
  return tips.length > 0
    ? tips.map((t) => fillPlaceholders(t, values))
    : reportStrings(template.language).homecareTips;
}

export interface BuildOwnerReportOptions extends OwnerReportContext {
  /** Render with this template regardless of config / chart choice
   *  (the template editor's preview). */
  template?: OwnerReportTemplate;
}

/** The template a chart renders with (explicit > chart choice > practice
 *  default > built-in). */
export function templateForSnapshot(snapshot: ChartSnapshot, options: BuildOwnerReportOptions = {}): OwnerReportTemplate {
  return options.template ?? resolveTemplate(options.config, snapshot.ownerReport?.templateId);
}

export function buildOwnerReportModel(
  snapshot: ChartSnapshot,
  options: BuildOwnerReportOptions = {}
): OwnerReportModel {
  const template = templateForSnapshot(snapshot, options);
  const locale = template.language;
  const t = reportStrings(locale);
  const values = placeholderValuesFor(snapshot, options, template);
  const layName = (triadan: number) => toothLayName(triadan, template.showToothNumbers, locale);

  const alreadyMissing: string[] = [];
  for (const [key, mark] of Object.entries(snapshot.preMarks ?? {})) {
    if (mark === 'missing') alreadyMissing.push(layName(Number(key)));
  }

  const extractedSet = new Set<number>();
  for (const [key, mark] of Object.entries(snapshot.postMarks ?? {})) {
    if (mark === 'extracted') extractedSet.add(Number(key));
  }

  // Comments anchored to a tooth join that tooth's notes; the vet wrote
  // them for the record, so they carry through verbatim.
  const commentsByTooth = new Map<number, string[]>();
  for (const comment of [...(snapshot.preComments ?? []), ...(snapshot.postComments ?? [])]) {
    if (comment.anchorTriadan == null || !comment.text.trim()) continue;
    const list = commentsByTooth.get(comment.anchorTriadan) ?? [];
    list.push(comment.text.trim());
    commentsByTooth.set(comment.anchorTriadan, list);
  }

  const teeth: OwnerReportTooth[] = [];
  for (const tooth of snapshot.toothData ?? []) {
    const notes: string[] = [];
    for (const field of FIELD_ORDER) {
      const raw = tooth[field];
      const value = typeof raw === 'string' ? raw.trim() : '';
      if (value) notes.push(template.showGrades ? t.fieldPhrases[field](value) : t.fieldPlain[field]);
    }
    for (const text of commentsByTooth.get(tooth.triadan) ?? []) notes.push(text);
    commentsByTooth.delete(tooth.triadan);
    const extracted = extractedSet.has(tooth.triadan);
    if (notes.length === 0 && !extracted) continue;
    teeth.push({
      triadan: tooth.triadan,
      layName: layName(tooth.triadan),
      notes,
      extracted,
    });
  }
  // Comments anchored to teeth outside the grid (species mismatch edge
  // case) still deserve a row.
  for (const [triadan, texts] of commentsByTooth) {
    teeth.push({
      triadan,
      layName: layName(triadan),
      notes: texts,
      extracted: extractedSet.has(triadan),
    });
  }
  teeth.sort((a, b) => a.triadan - b.triadan);

  const examNotes: { area: string; comment: string }[] = [];
  for (const { key, label } of EXAM_ITEMS) {
    const finding = snapshot.patientInfo.exam?.[key];
    if (finding?.status === 'abnormal' || (finding?.comment ?? '').trim()) {
      examNotes.push({ area: t.examAreas[key] ?? label, comment: (finding?.comment ?? '').trim() });
    }
  }

  // Hand-edited blocks win over the template; the template wins over
  // the generated text; absent = generated.
  const overrides = snapshot.ownerReport ?? {};
  const homecareSource = overrides.homecare ?? templateHomecareTips(template, values).join('\n');
  const patientName = snapshot.patientInfo.patientName;

  const sections: OwnerReportRenderSection[] = [];
  for (const section of template.sections) {
    if (!section.enabled) continue;
    const title = section.title.trim();
    if (isCustomSection(section)) {
      const body = fillPlaceholders(section.body, values).trim();
      if (!body && !title) continue;
      sections.push({ kind: 'custom', id: section.id, heading: fillPlaceholders(title, values), body });
    } else {
      sections.push({
        kind: 'builtin',
        id: section.id,
        heading: title ? fillPlaceholders(title, values) : t.headings[section.id](patientName),
        customHeading: !!title,
      });
    }
  }

  return {
    locale,
    title: template.title.trim() ? fillPlaceholders(template.title, values).trim() : '',
    sections,
    closingNote: fillPlaceholders(template.closingNote, values).trim(),
    footer: fillPlaceholders(template.footer, values).trim(),
    patientName,
    ownerName: snapshot.patientInfo.ownerName ?? '',
    speciesLabel: t.species[snapshot.species] ?? snapshot.species,
    visitDate: formatReportDate(snapshot.patientInfo.date, locale, template.dateFormat),
    recallDate: formatReportDate(snapshot.patientInfo.recallDate ?? '', locale, template.dateFormat),
    intro: (overrides.intro ?? templateIntro(snapshot, template, values)).trim(),
    homecareTips: homecareSource.split('\n').map((tip) => tip.trim()).filter(Boolean),
    extraNotes: (overrides.extraNotes ?? '').trim(),
    alreadyMissing,
    extracted: [...extractedSet].sort((a, b) => a - b).map(layName),
    teeth,
    examNotes,
  };
}

/** Whether a built-in section prints in this model. */
export function hasSection(model: OwnerReportModel, id: BuiltInSectionId): boolean {
  return model.sections.some((s) => s.kind === 'builtin' && s.id === id);
}

/** Teeth that get an entry (and a numbered pin on the diagram) in the
 *  owner report, in report order. Shared so the numbers always match. */
export function teethWithFindings(model: OwnerReportModel): OwnerReportTooth[] {
  return model.teeth.filter((t) => t.notes.length > 0);
}
