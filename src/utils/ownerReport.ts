import { dischargeOwnerReportFields } from './consultationTemplates';
import type { Attachment } from '../hooks/useAttachments';
import { ChartSnapshot, DentalField, EXAM_ITEMS, type ImageRole } from '../types';
import { parseRootPockets, deepestPocket } from './pocket';
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
import i18n from '../i18n';
import { ReportLocale, SUMMARY_FIELDS, SummaryExtent, SummaryField, formatReportDate, reportStrings } from './ownerReportI18n';
import { ownerFriendlyText } from './ownerReportCodes';
import { isGridComment } from './gridComments';

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
  /** Explicit review of this exact chart, text and template revision. */
  reviewed: boolean;
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
  /** Visit-specific opening that can be restored after editing. */
  generatedOpening?: string;
  /** Home-care tips, one per bullet — defaults or edited. */
  homecareTips: string[];
  /** Optional extra note from the team ('' = omit the section). */
  extraNotes: string;
  /** Lay names of teeth that were already missing before this visit. */
  alreadyMissing: string[];
  /** Lay names of teeth extracted during this visit. */
  extracted: string[];
  extractionsText?: string;
  findingsText?: string;
  examNotesText?: string;
  /** Mouth-wide findings, one line each ("Gum inflammation on most teeth
   *  (mild to moderate)"). Those fields are left out of `teeth` notes. */
  summaryLines: string[];
  /** Per-tooth findings; an omitted tooth has no recorded findings. */
  teeth: OwnerReportTooth[];
  /** The vet's notes not anchored to a tooth, codes in plain words. */
  otherFindings: string[];
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

/** The template's home-care tips, or the language's defaults when blank
 *  (the horse set for an equine chart). */
export function templateHomecareTips(template: OwnerReportTemplate, values: PlaceholderValues, species?: string): string[] {
  const tips = template.homecareTips.map((t) => t.trim()).filter(Boolean);
  if (tips.length > 0) return tips.map((t) => fillPlaceholders(t, values));
  const strings = reportStrings(template.language);
  if (species === 'rabbit') return strings.homecareTipsRabbit;
  return species === 'equine' ? strings.homecareTipsEquine : strings.homecareTips;
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

/** Canonical ordering makes persisted review fingerprints independent of object insertion order. */
function canonicalReviewValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalReviewValue);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonicalReviewValue(item)])
  );
  return value;
}

/** Small versioned change detector, not a security signature. */
export function ownerReportReviewBasis(snapshot: ChartSnapshot, options: BuildOwnerReportOptions = {}): string {
  const { recordNote: _recordNote, ownerReport, ...clinical } = snapshot;
  const { reviewedBasis: _reviewedBasis, reviewedAttachments: _reviewedAttachments, ...overrides } = ownerReport ?? {};
  const text = JSON.stringify(canonicalReviewValue({
    clinical, overrides, template: templateForSnapshot(snapshot, options),
    practiceName: options.practiceName?.trim() ?? '', doctorName: options.doctorName?.trim() ?? '',
  }));
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let i = 0; i < text.length; i += 1) {
    first = Math.imul(first ^ text.charCodeAt(i), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(i), 0x85ebca6b);
  }
  return `v1:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

/** A null label still counts as included. Existing tags imply inclusion
 *  until the visit has an explicit checkbox choice for the image. */
export function ownerReportPhotoRoles(
  labels: Record<string, ImageRole>,
  inclusion: ChartSnapshot['ownerReportImageInclusion'] = {},
): Record<string, ImageRole | null> {
  const included: Record<string, ImageRole | null> = { ...labels };
  for (const [id, selected] of Object.entries(inclusion)) {
    if (selected === true) included[id] = labels[id] ?? null;
    else if (selected === false) delete included[id];
  }
  return included;
}

/** Signed URLs expire; only document content and membership affect review. */
export function ownerReportAttachmentBasis(items: Pick<Attachment, 'id' | 'path' | 'caption' | 'kind' | 'toothTriadan'>[], roles: Record<string, ImageRole | null> = {}): string {
  return JSON.stringify(Object.entries(roles).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, role]) => {
    const item = items.find((entry) => entry.id === id);
    return item ? [id, role, item.path, item.caption, item.kind, item.toothTriadan] : [id, role, null];
  }));
}

export function ownerReportIsReviewed(snapshot: ChartSnapshot, options: BuildOwnerReportOptions = {}): boolean {
  return snapshot.ownerReport?.reviewedBasis === ownerReportReviewBasis(snapshot, options);
}

/** Client-language labels; the clinician's wording remains verbatim. */
function recordedDischargeNotes(info: ChartSnapshot['patientInfo'], locale: ReportLocale): string {
  const t = i18n.getFixedT(locale, 'report');
  const standard = (['dischargeMedications', 'dischargeInstructions', 'dischargeFollowUp'] as const).map(key =>
    info[key]?.trim() ? `${t(`dischargeSource.${key}`)}:\n${info[key]}` : '');
  const custom = dischargeOwnerReportFields(info, t('dischargeSource.activity')).map(field => `${field.label}:\n${field.value}`);
  return [...standard, ...custom].filter(Boolean).join('\n\n');
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

  // The vet's notes: anchored ones join that tooth's notes, the rest are
  // "other findings". AVDC codes read in plain words. Auto-copied grid
  // comments are left out: they repeat the grid (in English).
  const plain = (text: string) => ownerFriendlyText(text, locale, snapshot.species);
  const commentsByTooth = new Map<number, string[]>();
  const otherFindings: string[] = [];
  for (const comment of [...(snapshot.preComments ?? []), ...(snapshot.postComments ?? [])]) {
    if (isGridComment(comment) || !comment.text.trim()) continue;
    if (comment.anchorTriadan == null) {
      otherFindings.push(plain(comment.text.trim()));
      continue;
    }
    const list = commentsByTooth.get(comment.anchorTriadan) ?? [];
    list.push(plain(comment.text.trim()));
    commentsByTooth.set(comment.anchorTriadan, list);
  }

  // Mouth-wide findings: a periodontal finding on enough teeth becomes one
  // line instead of a note on every tooth.
  // Zero in any spelling ("0", "00", "0.0") means none.
  const valueOf = (raw: unknown): string => {
    const v = typeof raw === 'string' ? raw.trim() : '';
    return /^0+(\.0+)?$/.test(v) ? '' : v;
  };
  // A grade's number, from its leading digits ("2+", "2.5", "1-2" → 2, 2.5, 1);
  // null when there's none.
  const gradeOf = (v: string): number | null => {
    const m = v.match(/\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const gone = new Set<number>([
    ...Object.entries(snapshot.preMarks ?? {}).filter(([, m]) => m === 'missing').map(([k]) => Number(k)),
    ...extractedSet,
  ]);
  const presentCount = (snapshot.toothData ?? []).filter((tooth) => !gone.has(tooth.triadan)).length;
  const summarised = new Map<SummaryField, Set<number>>(); // field → outlier teeth that keep their note
  const summaryLines: string[] = [];
  const teethWithRecordedFindings = new Set<number>();
  for (const field of SUMMARY_FIELDS) {
    // Teeth present only: a tooth removed today keeps its own grades on its line.
    const found = (snapshot.toothData ?? [])
      .filter((tooth) => !gone.has(tooth.triadan))
      .map((tooth) => ({ triadan: tooth.triadan, value: valueOf(tooth[field]) }))
      .filter((f) => f.value);
    const needed = presentCount < 12 ? Math.max(1, Math.ceil(presentCount / 2)) : 6;
    if (found.length < needed) continue;
    for (const tooth of found) teethWithRecordedFindings.add(tooth.triadan);
    const share = presentCount ? found.length / presentCount : 1;
    const extent: SummaryExtent = share >= 0.75 ? 'most' : share >= 0.4 ? 'many' : 'some';
    const graded = field === 'gingivitis' || field === 'calculus';
    const outliers = new Set<number>();
    let severity = '';
    if (graded) {
      const grades = found.map((f) => ({ triadan: f.triadan, grade: gradeOf(f.value) }));
      const levels = grades
        .filter((g): g is { triadan: number; grade: number } => g.grade !== null)
        .map((g) => Math.min(3, Math.max(1, Math.ceil(g.grade))) as 1 | 2 | 3);
      const severeTeeth = grades.filter((g) => g.grade !== null && g.grade >= 3);
      // Severe teeth stand out when most of the summarised teeth are milder.
      if (severeTeeth.length > 0 && severeTeeth.length < found.length / 2) {
        for (const g of severeTeeth) outliers.add(g.triadan);
      }
      // A grade with no number would make any range partial: no words then.
      const allGraded = levels.length === found.length;
      if (template.showGrades && levels.length && allGraded) {
        const lo = Math.min(...levels) as 1 | 2 | 3;
        const hi = Math.max(...levels) as 1 | 2 | 3;
        severity = lo === hi ? t.severitySingle(t.severityWord(lo)) : t.severityRange(t.severityWord(lo), t.severityWord(hi));
      }
    }
    summarised.set(field, outliers);
    summaryLines.push(t.summaryLine(field, extent, severity));
  }

  const teeth: OwnerReportTooth[] = [];
  for (const tooth of snapshot.toothData ?? []) {
    const notes: string[] = [];
    for (const field of FIELD_ORDER) {
      let value = valueOf(tooth[field]);
      const outliers = summarised.get(field as SummaryField);
      if (outliers && !outliers.has(tooth.triadan)) continue;
      // Per-root pockets ("M4 D6") read as the deepest one for owners;
      // all-zero roots ("M0 D0") are no finding.
      if (field === 'pocket' && parseRootPockets(value)) value = valueOf(String(deepestPocket(value) ?? value));
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

  // Use manual edits first, then the latest generated draft, then template defaults.
  const overrides = snapshot.ownerReport ?? {};
  const homecareSource = overrides.homecare ?? overrides.generatedHomecare ?? templateHomecareTips(template, values, snapshot.species).join('\n');
  const patientName = snapshot.patientInfo.patientName;
  const visitT = i18n.getFixedT(locale, 'report');
  for (const tooth of teeth) if (tooth.notes.length) teethWithRecordedFindings.add(tooth.triadan);
  const includes = (id: BuiltInSectionId) => template.sections.some(section => section.id === id && section.enabled);
  const visitHighlights = [
    includes('extractions') && extractedSet.size ? visitT('visitIntro.extractions', { total: extractedSet.size }) : '',
    includes('findings') && teethWithRecordedFindings.size ? visitT('visitIntro.findings', { total: teethWithRecordedFindings.size }) : '',
    includes('examNotes') && examNotes.length ? visitT('visitIntro.exam') : '',
  ].filter(Boolean);
  if (!visitHighlights.length && snapshot.patientInfo.treatmentReport?.trim()) visitHighlights.push(visitT('visitIntro.treatment'));
  const generatedOpening = overrides.generatedIntro ?? (
    !template.introTemplate.trim() && visitHighlights.length
      ? [visitT('visitIntro.lead', { pet: values.pet }), ...visitHighlights].join(' ')
      : undefined
  );

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
    reviewed: ownerReportIsReviewed(snapshot, options),
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
    intro: (overrides.intro ?? generatedOpening ?? templateIntro(snapshot, template, values)).trim(),
    generatedOpening,
    homecareTips: homecareSource.split('\n').map((tip) => tip.trim()).filter(Boolean),
    extraNotes: (overrides.extraNotes ?? recordedDischargeNotes(snapshot.patientInfo, locale)).trim(),
    alreadyMissing,
    extracted: [...extractedSet].sort((a, b) => a - b).map(layName),
    extractionsText: reportWording(overrides.extractionsText),
    findingsText: reportWording(overrides.findingsText),
    examNotesText: reportWording(overrides.examNotesText),
    summaryLines,
    teeth,
    otherFindings,
    examNotes,
  };
}

export const OWNER_REPORT_WORDING_LIMIT = 16000;
const reportWording = (value: unknown) => typeof value === 'string' ? value.slice(0, OWNER_REPORT_WORDING_LIMIT) : undefined;

/** The same structured defaults printed by the PDF, flattened for editing. */
export function ownerReportChartWording(model: OwnerReportModel) {
  const t = reportStrings(model.locale);
  return {
    extractions: model.extracted.join('\n'),
    findings: [
      ...model.summaryLines,
      ...teethWithFindings(model).map(tooth =>
        `${tooth.layName}${tooth.extracted ? ` — ${t.removedToday}` : ''}: ${tooth.notes.join('; ')}`),
      ...(model.otherFindings.length ? [t.otherFindingsHeading, ...model.otherFindings] : []),
    ].join('\n'),
    examNotes: model.examNotes.map(note =>
      `${note.area}${note.comment ? `: ${note.comment}` : ` — ${t.abnormalityNoted}`}`).join('\n'),
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
