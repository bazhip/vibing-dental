import { CONSULTATION_FIELDS, LEGACY_DENTAL_CONSULTATION, consultationSectionKey, consultationVisitSections, dischargeVisitSections, isCustomNoteField, noteSectionLines, type CustomConsultationField, type CustomDischargeField, type ConsultationSection } from './consultationTemplates';
import { isCustomExamText } from './examLayout';
import { ctRecordedText } from './ctReportState';
import { radiologyRecordedText } from './radiologyReportState';
import { visitTypeOf } from './visitTypes';
import { readPracticeChartFieldAnswers } from './practiceChartFieldAnswers';
import type { PracticeChartPage } from './practiceChartFields';
import type { TFunction } from 'i18next';
import i18n from '../i18n';
import type { AppLanguage } from '../i18n/config';
import {
  ChartSnapshot,
  DiagramComment,
  EXAM_ITEMS,
  ExamItemValue,
  ToothData,
  type NerveBlocks,
  effectiveNerveBlockDrugs,
  formatAnestheticDrug,
} from '../types';

/**
 * Medical record note: the chart as a plain clinical note a vet pastes into
 * their practice software. A pure function of the snapshot — it only
 * restates what was charted, in the language of the `t` it is given.
 */

const NS = ['media', 'forms', 'chart', 'app', 'visitDocumentation'] as const;
export type RecordNoteT = TFunction<typeof NS>;

/** The fixed-language t the builder takes. */
export function recordNoteT(lng: AppLanguage | string): RecordNoteT {
  return i18n.getFixedT(lng, NS) as unknown as RecordNoteT;
}

export interface RecordNoteSection {
  key: RecordNoteKey;
  heading: string;
  lines: string[];
  level?: 2;
  headingOverride?: true;
}

export interface RecordNote {
  sections: RecordNoteSection[];
}

const GRID_FIELDS = [
  'mobility', 'recession', 'pocket', 'furcation', 'hyperplasia', 'calculus', 'gingivitis', 'pdstate',
] as const satisfies readonly (keyof ToothData)[];

const BLOCK_SITES = [
  ['infraorbital', 'infraorbitalRight', 'infraorbitalLeft'],
  ['caudalMaxillary', 'caudalMaxillaryRight', 'caudalMaxillaryLeft'],
  ['inferiorAlveolar', 'inferiorAlveolarRight', 'inferiorAlveolarLeft'],
  ['mental', 'mentalRight', 'mentalLeft'],
] as const;

// Headings reuse the app's own labels where it has one, so the note says
// "Anesthesia" / "Treatment report" exactly as the chart sections do.
export const HEADING_KEYS = {
  complaint: 'forms:patient.complaint',
  header: 'media:recordNote.h.header',
  patient: 'app:sections.patient',
  consultationHistory: 'media:recordNote.h.consultationHistory',
  consultationAssessment: 'media:recordNote.h.consultationAssessment',
  consultationPlan: 'media:recordNote.h.consultationPlan',
  consultationCurrentMedications: 'visitDocumentation:fields.consultationCurrentMedications.label',
  consultationAdministeredMedications: 'visitDocumentation:fields.consultationAdministeredMedications.label',
  consultationMedicationPlan: 'visitDocumentation:fields.consultationMedicationPlan.label',
  gpVitals: 'media:recordNote.h.gpVitals',
  gpPhysicalExam: 'media:recordNote.h.gpPhysicalExam',
  gpDiagnostics: 'media:recordNote.h.gpDiagnostics',
  anesthesia: 'app:sections.anesthesia',
  exam: 'media:recordNote.h.exam',
  findings: 'media:recordNote.h.findings',
  procedures: 'media:recordNote.h.procedures',
  radiographs: 'media:recordNote.h.radiographs',
  images: 'app:sections.images',
  ct: 'media:recordNote.h.ct',
  treatment: 'forms:report.title',
  dischargeMedications: 'media:recordNote.h.dischargeMedications',
  dischargeInstructions: 'media:recordNote.h.dischargeInstructions',
  dischargeFollowUp: 'media:recordNote.h.dischargeFollowUp',
  recheck: 'media:recordNote.h.recheck',
} as const;

export type RecordNoteKey = keyof typeof HEADING_KEYS | CustomConsultationField | CustomDischargeField;
/** Section keys in note order. */
export const RECORD_NOTE_KEYS = Object.keys(HEADING_KEYS) as RecordNoteKey[];

const clean = (s: string | undefined | null) => (s ?? '').trim();
const textLines = (s: string | undefined) => clean(s).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const isGridMirror = (c: DiagramComment) => c.id.startsWith('grid-');
const consultationFields = (info: ChartSnapshot['patientInfo']) => info.consultationLayout?.fields ?? CONSULTATION_FIELDS;
const consultationNoteSections = (info: ChartSnapshot['patientInfo']) => consultationVisitSections(info, info.consultationLayout ?? LEGACY_DENTAL_CONSULTATION);
const sectionHeading = (section: ConsultationSection, t: RecordNoteT) => {
  if (section.label) return section.label;
  if (!isCustomNoteField(section.id)) return t(HEADING_KEYS[section.id]);
  const key = consultationSectionKey(section);
  return key ? t(`visitDocumentation:${key}.label`) : '';
};
function commentsByTooth(comments: DiagramComment[]) {
  const pinned = new Map<number, string[]>();
  const unpinned: string[] = [];
  for (const c of comments) {
    const text = clean(c.text);
    if (!text || isGridMirror(c)) continue;
    if (c.anchorTriadan == null) unpinned.push(text);
    else pinned.set(c.anchorTriadan, [...(pinned.get(c.anchorTriadan) ?? []), text]);
  }
  return { pinned, unpinned };
}

function speciesLabel(species: ChartSnapshot['species'], t: RecordNoteT): string {
  const [base, dentition] = species.split('-') as ['canine' | 'feline' | 'equine' | 'rabbit', string | undefined];
  const name = t(`forms:patient.${base}`);
  return dentition === 'deciduous' ? `${name} (${t('forms:patient.deciduous')})` : name;
}

function examLine(label: string, v: ExamItemValue | undefined, t: RecordNoteT): string | null {
  if (!v?.status) return null;
  const status = t(v.status === 'normal' ? 'forms:exam.normal' : 'forms:exam.abnormal');
  const comment = clean(v.comment);
  return comment ? `${label}: ${status} — ${comment}` : `${label}: ${status}`;
}

export function buildRecordNote(snapshot: ChartSnapshot, t: RecordNoteT): RecordNote {
  const info = snapshot.patientInfo;
  const consultation = visitTypeOf(info.visitType) === 'consultation';
  const practiceAnswers = readPracticeChartFieldAnswers(info.practiceChartFields);
  const practiceLines = (page: PracticeChartPage) => practiceAnswers.flatMap(({ page: source, field, value }) => {
    if (page !== source) return [];
    const [first, ...rest] = textLines(value);
    return [`${field.label}: ${first}`, ...rest];
  });
  const sections: RecordNoteSection[] = [];
  const add = (key: RecordNoteKey, lines: (string | null | false | undefined)[], heading = isCustomNoteField(key) ? '' : t(HEADING_KEYS[key]), level?: 2, headingOverride?: true) => {
    const kept = lines.filter((l): l is string => !!l);
    if (kept.length) sections.push({ key, heading, lines: kept, ...(level ? { level } : {}), ...(headingOverride ? { headingOverride } : {}) });
  };

  // 1. Header
  add('header', [
    [clean(info.patientName), speciesLabel(snapshot.species, t)].filter(Boolean).join(' — '),
    clean(info.patientNumber) && `${t('forms:patient.number')}: ${clean(info.patientNumber)}`,
    clean(info.date),
    clean(info.doctor) && `${t('media:recordNote.doctor')}: ${clean(info.doctor)}`,
    clean(info.tech) && `${t('forms:patient.tech')}: ${clean(info.tech)}`,
  ], consultation ? t('visitDocumentation:consultation.title') : undefined);
  add('patient', practiceLines('patient'));

  if (consultation) {
    for (const section of consultationNoteSections(info)) {
      add(section.id, noteSectionLines(info[section.id], section), sectionHeading(section, t), section.level, section.label && !isCustomNoteField(section.id) ? true : undefined);
    }
    add('exam', practiceLines('exam'));
    add('anesthesia', practiceLines('anesthesia'));
    add('images', practiceLines('images'));
    add('dischargeFollowUp', textLines(info.dischargeFollowUp));
    add('recheck', [clean(info.recallDate)]);
    return { sections };
  }

  for (const field of consultationFields(info)) add(field, textLines(info[field]));

  // 2. Anesthesia
  const nb = info.nerveBlocks;
  const recordedBlockLines = (blocks?: NerveBlocks) => BLOCK_SITES.map(([site, r, l]) => {
    const parts = [
      clean(blocks?.[r]) && `${t('forms:anesthesia.right')} ${clean(blocks?.[r])}`,
      clean(blocks?.[l]) && `${t('forms:anesthesia.left')} ${clean(blocks?.[l])}`,
    ].filter(Boolean);
    return parts.length ? `${t(`forms:anesthesia.blocks.${site}`)}: ${parts.join(', ')}` : null;
  });
  // As on the chart PDF: blocks charted without a drug use the template's
  // default anesthetic (an empty drug list means "the default").
  const blockLines = recordedBlockLines(nb);
  const anyBlock = blockLines.some(Boolean) || !!clean(nb?.other);
  const drugs = (anyBlock && nb ? effectiveNerveBlockDrugs(nb, snapshot.logo) : (nb?.drugs ?? []).filter((d) => clean(d.name)))
    .map(formatAnestheticDrug);
  const custom = info.customAnesthesia;
  const second = info.secondNerveBlocks;
  const secondLines = second ? [
    second.drugs.filter(d => clean(d.name)).map(formatAnestheticDrug).join(' + '),
    ...recordedBlockLines(second),
    clean(second.other) && `${t('forms:anesthesia.other')}: ${clean(second.other)}`,
  ].filter(Boolean) : [];
  add('anesthesia', [
    drugs.length > 0 && drugs.join(' + '),
    ...blockLines,
    clean(nb?.other) && `${t('forms:anesthesia.other')}: ${clean(nb?.other)}`,
    ...(custom?.blocks ?? []).map((b) => {
      const parts = [
        clean(b.right) && `${t('forms:anesthesia.right')} ${clean(b.right)}`,
        clean(b.left) && `${t('forms:anesthesia.left')} ${clean(b.left)}`,
      ].filter(Boolean);
      return parts.length ? `${clean(b.label)}: ${parts.join(', ')}` : null;
    }),
    ...(custom?.fields ?? []).map((f) =>
      clean(f.value) ? `${clean(f.label)}: ${clean(f.value)}${f.unit ? ` ${f.unit}` : ''}` : null),
    ...(secondLines.length ? [t('forms:anesthesia.secondTitle'), ...secondLines] : []),
    ...practiceLines('anesthesia'),
  ]);

  // 3. Oral exam
  add('exam', [
    ...EXAM_ITEMS.map(({ key }) => examLine(t(`forms:exam.items.${key}`), info.exam?.[key], t)),
    ...(info.customExam ?? []).map((c) => isCustomExamText(c.id)
      ? clean(c.comment) && `${clean(c.label)}: ${clean(c.comment)}`
      : examLine(clean(c.label), c, t)),
    ...practiceLines('exam'),
  ]);

  // 4. Findings by tooth
  const pre = commentsByTooth(snapshot.preComments ?? []);
  const toothRows = new Map<number, string[]>();
  const push = (triadan: number, part: string) => toothRows.set(triadan, [...(toothRows.get(triadan) ?? []), part]);
  for (const tooth of snapshot.toothData) {
    for (const f of GRID_FIELDS) {
      const v = clean(tooth[f]);
      if (v) push(tooth.triadan, `${t(`chart:columns.${f}`)} ${v}`);
    }
  }
  for (const [triadan, texts] of pre.pinned) texts.forEach((x) => push(triadan, x));
  const missing = Object.entries(snapshot.preMarks ?? {})
    .filter(([, m]) => m === 'missing').map(([n]) => Number(n)).sort((a, b) => a - b);
  add('findings', [
    ...[...toothRows.keys()].sort((a, b) => a - b).map((n) => `${n}: ${toothRows.get(n)!.join('; ')}`),
    missing.length > 0 && t('media:recordNote.alreadyMissing', { teeth: missing.join(', ') }),
    pre.unpinned.length > 0 && t('media:recordNote.otherNotes', { text: pre.unpinned.join('; ') }),
  ]);

  // 5. Procedures
  const post = commentsByTooth(snapshot.postComments ?? []);
  const extracted = Object.entries(snapshot.postMarks ?? {})
    .filter(([, m]) => m === 'extracted').map(([n]) => Number(n)).sort((a, b) => a - b);
  add('procedures', [
    extracted.length > 0 && t('media:recordNote.extracted', { teeth: extracted.join(', ') }),
    ...[...post.pinned.keys()].sort((a, b) => a - b).map((n) => `${n}: ${post.pinned.get(n)!.join('; ')}`),
    post.unpinned.length > 0 && t('media:recordNote.otherNotes', { text: post.unpinned.join('; ') }),
  ]);

  // 6–8. Free text and recheck
  add('radiographs', textLines(radiologyRecordedText(info)));
  add('ct', textLines(info.ctReport));
  add('images', practiceLines('images'));
  add('treatment', textLines(info.treatmentReport));
  for (const section of dischargeVisitSections(info)) {
    add(section.id, noteSectionLines(info[section.id], section), sectionHeading(section, t), section.level,
      section.label && !isCustomNoteField(section.id) ? true : undefined);
  }
  add('recheck', [clean(info.recallDate)]);

  return { sections };
}

export const recordNoteSectionHeading = (section: RecordNoteSection) =>
  section.level === 2 ? `  ${section.heading.toLocaleUpperCase()}` : section.heading.toLocaleUpperCase();

export function recordNoteSectionText(s: RecordNoteSection): string {
  return [recordNoteSectionHeading(s), ...s.lines.map(line => s.level === 2 ? `  ${line}` : line)].join('\n');
}

export function recordNoteText(note: RecordNote): string {
  return note.sections.map(recordNoteSectionText).join('\n\n');
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function recordNoteSectionHtml(s: RecordNoteSection): string {
  return `<p${s.level === 2 ? ' style="margin-inline-start: 1em"' : ''}><strong>${esc(s.heading)}</strong>${s.lines.map((l) => `<br>${esc(l)}`).join('')}</p>`;
}

export function recordNoteHtml(note: RecordNote): string {
  return note.sections.map(recordNoteSectionHtml).join('');
}

/** Plain text (as typed or AI-written) → simple HTML for a rich paste. */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.split('\n').map(esc).join('<br>')}</p>`)
    .join('');
}

function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Fingerprint of the chart data the note is built from (never the
 *  language), so a stored note can tell when the chart moved on. */
export function recordNoteBasis(snapshot: ChartSnapshot): string {
  const i = snapshot.patientInfo;
  const answers = readPracticeChartFieldAnswers(i.practiceChartFields)
    .map(({ page, field, value }) => [page, field.label, textLines(value)]);
  const practiceBasis = answers.length ? [['practiceChartFields', answers]] : [];
  if (visitTypeOf(i.visitType) === 'consultation') {
    return hashStr(JSON.stringify([
      'consultation', snapshot.species, i.patientName, i.patientNumber, i.date, i.doctor, i.tech,
      consultationNoteSections(i).flatMap(section => {
        const lines = noteSectionLines(i[section.id], section);
        return lines.length ? [[section.id, lines, ...(section.label ? [section.label] : []), ...(section.level ? [section.level] : [])]] : [];
      }),
      textLines(i.dischargeFollowUp), clean(i.recallDate),
      ...practiceBasis,
    ]));
  }
  const recordedFields = CONSULTATION_FIELDS.filter(field => textLines(i[field]).length);
  const templateOrder = i.consultationLayout?.fields.filter(field => recordedFields.includes(field));
  const reordered = templateOrder?.some((field, index) => field !== recordedFields[index]);
  return hashStr(JSON.stringify([
    snapshot.species, snapshot.logo,
    i.patientName, i.patientNumber, i.date, i.doctor, i.tech, i.complaint,
    i.nerveBlocks, ...(i.secondNerveBlocks ? [i.secondNerveBlocks] : []), i.customAnesthesia ?? null, i.exam, i.customExam ?? null,
    radiologyRecordedText(i), i.ctReport ?? '', i.treatmentReport, i.recallDate,
    ...([i.consultationHistory, i.consultationAssessment, i.consultationPlan, i.dischargeMedications, i.dischargeInstructions, i.dischargeFollowUp, i.gpVitals, i.gpPhysicalExam, i.gpDiagnostics].some(value => value?.trim())
      ? [i.consultationHistory ?? '', i.consultationAssessment ?? '', i.consultationPlan ?? '', i.dischargeMedications ?? '', i.dischargeInstructions ?? '', i.dischargeFollowUp ?? '', i.gpVitals ?? '', i.gpPhysicalExam ?? '', i.gpDiagnostics ?? ''] : []),
    ...(reordered ? [templateOrder] : []),
    ...(i.dischargeLayout ? [dischargeVisitSections(i).flatMap(section => {
      const lines = noteSectionLines(i[section.id], section);
      return lines.length ? [[section.id, lines, section.label, section.level]] : [];
    })] : []),
    snapshot.toothData.map((td) => GRID_FIELDS.map((f) => td[f] ?? '')),
    snapshot.preMarks, snapshot.postMarks,
    (snapshot.preComments ?? []).map((c) => [c.id, c.text, c.anchorTriadan]),
    (snapshot.postComments ?? []).map((c) => [c.id, c.text, c.anchorTriadan]),
    ...practiceBasis,
  ]));
}
