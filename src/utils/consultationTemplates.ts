import type { PatientInfo } from '../types';

export const CONSULTATION_FIELDS = [
  'complaint', 'consultationHistory', 'consultationAssessment', 'consultationPlan',
  'gpVitals', 'gpPhysicalExam', 'gpDiagnostics',
] as const;
export type ConsultationField = typeof CONSULTATION_FIELDS[number];

const MEDICATION_SECTION: Partial<Record<ConsultationField,
  'consultationCurrentMedications' | 'consultationAdministeredMedications' | 'consultationMedicationPlan'>> = {
  consultationHistory: 'consultationCurrentMedications',
  gpDiagnostics: 'consultationAdministeredMedications',
  consultationPlan: 'consultationMedicationPlan',
};
export const CONSULTATION_MEDICATION_FIELDS = Object.values(MEDICATION_SECTION);
export const CONSULTATION_STANDARD_FIELDS = [...CONSULTATION_FIELDS, ...CONSULTATION_MEDICATION_FIELDS] as const;
export type CustomConsultationField = `consultationCustom_${string}`;
export type ConsultationSectionId = typeof CONSULTATION_STANDARD_FIELDS[number] | CustomConsultationField;
export interface ConsultationSection {
  id: ConsultationSectionId;
  label?: string;
  guidance?: string;
  example?: string;
  suggestedText?: string;
  format?: 'bullets' | 'paragraph';
  level?: 2;
}
export const CONSULTATION_SECTION_LIMIT = 24;
export const isCustomConsultationField = (id: string): id is CustomConsultationField =>
  /^consultationCustom_[a-z0-9-]{1,50}$/u.test(id);
export const DENTAL_SECTION_KEYS = {
  'consultationCustom_awake-oral-exam': 'awakeOralExam',
  'consultationCustom_preanesthetic': 'preanesthetic',
  'consultationCustom_client-discussion': 'clientDiscussion',
  'consultationCustom_home-care': 'homeCare',
  'consultationCustom_follow-up': 'followUp',
} as const;
export const dentalSectionKey = (id: ConsultationSectionId) =>
  Object.hasOwn(DENTAL_SECTION_KEYS, id) ? DENTAL_SECTION_KEYS[id as keyof typeof DENTAL_SECTION_KEYS] : undefined;

/** Medication fields stay beside their parent sections in saved layouts. */
export function consultationDocumentFields(fields: readonly ConsultationField[]) {
  return fields.flatMap(field => {
    const medications = MEDICATION_SECTION[field];
    return medications ? [field, medications] : [field];
  });
}

export interface ConsultationLayout {
  id: string;
  name?: string;
  fields: readonly ConsultationField[];
  sections?: readonly ConsultationSection[];
  instructions?: string;
  detail?: 'concise' | 'detailed';
}

export interface PracticeConsultationTemplate extends ConsultationLayout {
  name: string;
  archived?: boolean;
}

export interface ConsultationLibrary {
  version?: 2;
  defaultId: string;
  templates: PracticeConsultationTemplate[];
  order?: string[];
}

// Older clients cannot preserve custom sections and their dictation sources.
export const CONSULTATION_SNAPSHOT_VERSION = 2;
export const CONSULTATION_LIBRARY_VERSION = 2;
export const CONSULTATION_TEMPLATE_LIMIT = 24;
const CONSULTATION_LIBRARY_BYTES = 196608;
export const CONSULTATION_TEMPLATE_NAME_LIMIT = 100;
export const LEGACY_DENTAL_CONSULTATION: ConsultationLayout = {
  id: 'dental-v1',
  fields: ['complaint', 'consultationHistory', 'gpPhysicalExam', 'gpVitals', 'gpDiagnostics', 'consultationAssessment', 'consultationPlan'],
};
export const DENTAL_CONSULTATION: ConsultationLayout = {
  ...LEGACY_DENTAL_CONSULTATION,
  id: 'dental-v2',
  sections: [
    { id: 'complaint' }, { id: 'consultationHistory' }, { id: 'consultationCurrentMedications' },
    { id: 'gpVitals' }, { id: 'gpPhysicalExam' }, { id: 'consultationCustom_awake-oral-exam' },
    { id: 'gpDiagnostics' }, { id: 'consultationAdministeredMedications' }, { id: 'consultationAssessment' },
    { id: 'consultationCustom_preanesthetic' }, { id: 'consultationPlan' }, { id: 'consultationMedicationPlan' },
    { id: 'consultationCustom_client-discussion' }, { id: 'consultationCustom_home-care' }, { id: 'consultationCustom_follow-up' },
  ],
};
export const CONSULTATION_STARTERS = {
  'dental-v2': DENTAL_CONSULTATION,
  'dental-v1': LEGACY_DENTAL_CONSULTATION,
  'soap-v1': {
    id: 'soap-v1',
    fields: ['complaint', 'consultationHistory', 'gpVitals', 'gpPhysicalExam', 'gpDiagnostics', 'consultationAssessment', 'consultationPlan'],
  },
  'recheck-v1': {
    id: 'recheck-v1',
    fields: ['consultationHistory', 'complaint', 'gpVitals', 'gpPhysicalExam', 'gpDiagnostics', 'consultationAssessment', 'consultationPlan'],
  },
} as const satisfies Record<string, ConsultationLayout>;

export type ConsultationStarter = keyof typeof CONSULTATION_STARTERS;
export const isConsultationStarter = (id: string): id is ConsultationStarter =>
  Object.hasOwn(CONSULTATION_STARTERS, id);
export const EMPTY_CONSULTATION_LIBRARY: ConsultationLibrary = { defaultId: DENTAL_CONSULTATION.id, templates: [] };

export const isConsultationSectionId = (id: string): id is ConsultationSectionId =>
  (CONSULTATION_STANDARD_FIELDS as readonly string[]).includes(id) || isCustomConsultationField(id);

export function normalizeConsultationSections(value: unknown): ConsultationSection[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > CONSULTATION_SECTION_LIMIT) return undefined;
  const sections: ConsultationSection[] = [];
  const ids = new Set<string>();
  for (const section of value) {
    if (!section || typeof section !== 'object' || Array.isArray(section)
      || Object.keys(section).some(key => !['id', 'label', 'guidance', 'example', 'suggestedText', 'format', 'level'].includes(key))
      || typeof section.id !== 'string' || !isConsultationSectionId(section.id) || ids.has(section.id)) return undefined;
    const { id, label, guidance, example, suggestedText, format, level } = section;
    if (label !== undefined && (typeof label !== 'string' || !label.trim() || [...label].length > 100)) return undefined;
    if (isCustomConsultationField(id) && !dentalSectionKey(id) && label === undefined) return undefined;
    if ([guidance, example, suggestedText].some(text => text !== undefined && (typeof text !== 'string' || [...text].length > 1000))) return undefined;
    if (level !== undefined && level !== 2) return undefined;
    if (format !== undefined && format !== 'bullets' && format !== 'paragraph') return undefined;
    ids.add(id);
    sections.push({ id,
      ...(label !== undefined ? { label: label.trim() } : {}),
      ...(guidance ? { guidance } : {}), ...(example ? { example } : {}),
      ...(suggestedText ? { suggestedText } : {}), ...(format ? { format } : {}), ...(level ? { level } : {}),
    });
  }
  return sections;
}

export function consultationSectionKey(section: ConsultationSection) {
  const dentalKey = dentalSectionKey(section.id);
  if (dentalKey) return `consultation.dental.${dentalKey}` as const;
  if (isCustomConsultationField(section.id)) return undefined;
  return `fields.${section.id}` as const;
}

/** Extract headings only. Record contents never become reusable clinical defaults. */
export function consultationHeadings(sample: string): string[] {
  const headings = sample.split(/\r?\n/u).flatMap(line => {
    const heading = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line)?.[1]
      ?? /^\s*([^:]{1,100}):(?:\s|$)/u.exec(line)?.[1];
    const clean = heading?.replace(/^\*{1,2}|\*{1,2}$/gu, '').trim();
    return clean && [...clean].length <= 100 ? [clean] : [];
  });
  return [...new Set(headings)].slice(0, CONSULTATION_SECTION_LIMIT);
}

export function consultationSections(layout: ConsultationLayout): readonly ConsultationSection[] {
  return layout.sections ?? consultationDocumentFields(layout.fields).map(id => ({ id }));
}

/** Keep populated sections visible when a clinician switches templates. */
export function consultationVisitSections(info: Partial<PatientInfo>, layout: ConsultationLayout): readonly ConsultationSection[] {
  const active = consultationSections(layout);
  const ids = new Set(active.map(section => section.id));
  const retained: ConsultationSection[] = [];
  for (const section of [...(info.consultationRetainedSections ?? []), ...CONSULTATION_STANDARD_FIELDS.map(id => ({ id }))]) {
    if (!ids.has(section.id) && info[section.id]?.trim()) {
      retained.push(section);
      ids.add(section.id);
    }
  }
  return [...active, ...retained];
}

export function changeConsultationLayout(info: Partial<PatientInfo>, previous: ConsultationLayout, next: ConsultationLayout): Partial<PatientInfo> {
  const nextSections = new Set(consultationSections(next).map(section => section.id));
  const retained = consultationVisitSections(info, previous)
    .filter(section => !nextSections.has(section.id) && !!info[section.id]?.trim());
  return {
    consultationLayout: { id: next.id, ...(next.name ? { name: next.name } : {}), fields: next.fields,
      ...(next.sections ? { sections: next.sections } : {}),
      ...(next.instructions ? { instructions: next.instructions } : {}), ...(next.detail ? { detail: next.detail } : {}) },
    ...(retained.length || info.consultationRetainedSections?.length ? { consultationRetainedSections: retained } : {}),
  };
}

export function normalizeConsultationLayout(value: unknown): ConsultationLayout | undefined {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return;
  const fields = 'fields' in value ? value.fields : undefined;
  const complete = Array.isArray(fields) && fields.length === CONSULTATION_FIELDS.length
    && CONSULTATION_FIELDS.every(field => fields.includes(field));
  const sections = 'sections' in value ? normalizeConsultationSections(value.sections) : undefined;
  if ('sections' in value && !sections) return undefined;
  const instructions = 'instructions' in value ? value.instructions : undefined;
  if (instructions !== undefined && (typeof instructions !== 'string' || [...instructions].length > 2000)) return undefined;
  const detail = 'detail' in value ? value.detail : undefined;
  if (detail !== undefined && detail !== 'concise' && detail !== 'detailed') return undefined;
  const options: Pick<ConsultationLayout, 'sections' | 'instructions' | 'detail'> = { ...(sections ? { sections } : {}), ...(instructions ? { instructions } : {}), ...(detail ? { detail } : {}) };
  if (isConsultationStarter(value.id)) {
    if (!complete || (value.id === DENTAL_CONSULTATION.id && !sections)) return CONSULTATION_STARTERS[value.id];
    return { id: value.id, fields: [...fields] as ConsultationField[], ...options };
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.id)) return;
  if (!('name' in value) || typeof value.name !== 'string' || [...value.name].length > CONSULTATION_TEMPLATE_NAME_LIMIT || !value.name.trim()) return;
  if (!complete) return;
  return { id: value.id, name: value.name.trim(), fields: [...fields] as ConsultationField[], ...options };
}

/** PostgreSQL jsonb adds a space after each object colon and list separator. */
function jsonbSpaces(value: unknown): number {
  if (Array.isArray(value)) return Math.max(0, value.length - 1) + value.reduce((bytes, entry) => bytes + jsonbSpaces(entry), 0);
  if (!value || typeof value !== 'object') return 0;
  const entries = Object.values(value).filter(entry => entry !== undefined);
  return entries.length + Math.max(0, entries.length - 1) + entries.reduce<number>((bytes, entry) => bytes + jsonbSpaces(entry), 0);
}

export function consultationLibraryFits(config: ConsultationLibrary): boolean {
  return new TextEncoder().encode(JSON.stringify(config)).byteLength + jsonbSpaces(config) <= CONSULTATION_LIBRARY_BYTES;
}

export function parseConsultationLibrary(value: unknown): ConsultationLibrary | undefined {
  if (!value || typeof value !== 'object' || !('templates' in value) || !Array.isArray(value.templates)
    || value.templates.length > CONSULTATION_TEMPLATE_LIMIT || !('defaultId' in value) || typeof value.defaultId !== 'string') return;
  const version = 'version' in value ? value.version : undefined;
  if (version !== undefined && version !== CONSULTATION_LIBRARY_VERSION) return undefined;
  const templates: PracticeConsultationTemplate[] = [];
  const ids = new Set<string>();
  for (const raw of value.templates) {
    const layout = normalizeConsultationLayout(raw);
    if (!layout?.name || ids.has(layout.id) || (raw.archived !== undefined && typeof raw.archived !== 'boolean')) return;
    ids.add(layout.id);
    templates.push({ ...layout, name: layout.name, ...(raw.archived ? { archived: true } : {}) });
  }
  const defaultId = value.defaultId;
  if (!isConsultationStarter(defaultId) && !templates.some(template => template.id === defaultId && !template.archived)) return;
  const order = 'order' in value ? value.order : undefined;
  if (order !== undefined && (!Array.isArray(order) || new Set(order).size !== order.length
    || order.some(id => typeof id !== 'string' || (!isConsultationStarter(id) && !ids.has(id))))) return undefined;
  const config: ConsultationLibrary = { defaultId, templates, ...(order ? { order } : {}),
    ...(version ? { version } : {}) };
  return consultationLibraryFits(config) ? config : undefined;
}

export function consultationChoices(library: ConsultationLibrary): ConsultationLayout[] {
  const choices = [...Object.values(CONSULTATION_STARTERS), ...library.templates.filter(template => !template.archived)]
    .filter(template => template.id !== LEGACY_DENTAL_CONSULTATION.id || library.defaultId === template.id);
  const byId = new Map(choices.map(layout => [layout.id, layout]));
  return [...(library.order ?? []).flatMap(id => {
    const template = byId.get(id);
    byId.delete(id);
    return template ? [template] : [];
  }), ...byId.values()];
}

export function consultationLayoutFor(
  patient: Partial<PatientInfo>,
  library = EMPTY_CONSULTATION_LIBRARY,
  historical = false,
): ConsultationLayout {
  if (patient.consultationLayout) return patient.consultationLayout;
  if (historical) return LEGACY_DENTAL_CONSULTATION;
  return consultationChoices(library).find(layout => layout.id === library.defaultId) ?? DENTAL_CONSULTATION;
}
