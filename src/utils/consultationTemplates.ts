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
export const DISCHARGE_FIELDS = ['dischargeMedications', 'dischargeInstructions', 'dischargeFollowUp'] as const;
export type NoteTemplateKind = 'consultation' | 'discharge' | 'imaging';
export type CustomDischargeField = `dischargeCustom_${string}`;
export type CustomConsultationField = `consultationCustom_${string}`;
export type ConsultationSectionId = typeof CONSULTATION_STANDARD_FIELDS[number] | CustomConsultationField | typeof DISCHARGE_FIELDS[number] | CustomDischargeField;
export const NOTE_INPUT_TYPES = ['shortText', 'radio', 'multiselect'] as const;
export type NoteInputType = typeof NOTE_INPUT_TYPES[number];
export const NOTE_OPTION_LIMIT = 20;
export const NOTE_OPTION_LENGTH = 100;
const isChoiceInput = (type: unknown) => type === 'radio' || type === 'multiselect';
export const canConfigureNoteInput = (id: ConsultationSectionId, kind: NoteTemplateKind) =>
  kind !== 'imaging' && id !== 'gpVitals' && !(CONSULTATION_MEDICATION_FIELDS as readonly string[]).includes(id);

export interface ConsultationSection {
  id: ConsultationSectionId;
  label?: string;
  guidance?: string;
  example?: string;
  suggestedText?: string;
  format?: 'bullets' | 'paragraph';
  level?: 2;
  ownerReport?: true;
  inputType?: NoteInputType;
  options?: readonly string[];
}
export const CONSULTATION_SECTION_LIMIT = 24;
export const isCustomConsultationField = (id: string): id is CustomConsultationField =>
  /^consultationCustom_[a-z0-9-]{1,50}$/u.test(id);
export const isCustomDischargeField = (id: string): id is CustomDischargeField =>
  /^dischargeCustom_[a-z0-9-]{1,50}$/u.test(id);
export const isCustomNoteField = (id: string): id is CustomConsultationField | CustomDischargeField =>
  isCustomConsultationField(id) || isCustomDischargeField(id);
export const standardNoteFields = (kind: NoteTemplateKind) =>
  kind === 'imaging' ? [] : kind === 'discharge' ? DISCHARGE_FIELDS : CONSULTATION_STANDARD_FIELDS;
const IMAGING_SECTION_KEYS = {
  'consultationCustom_imaging-technique': 'technique',
  'consultationCustom_imaging-findings': 'findings',
  'consultationCustom_imaging-impression': 'impression',
} as const;
export const imagingSectionKey = (id: ConsultationSectionId) =>
  Object.hasOwn(IMAGING_SECTION_KEYS, id) ? IMAGING_SECTION_KEYS[id as keyof typeof IMAGING_SECTION_KEYS] : undefined;

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

export const NOTE_IMAGES_ID = 'noteImages';
export type NoteTemplateSection = Omit<ConsultationSection, 'id'> & { id: ConsultationSectionId | typeof NOTE_IMAGES_ID };
export type NoteImagePlacement = false | { index: number; label?: string; guidance?: string };

export interface ConsultationLayout {
  id: string;
  name?: string;
  fields: readonly ConsultationField[];
  sections?: readonly ConsultationSection[];
  imagePlacement?: NoteImagePlacement;
  instructions?: string;
  detail?: 'concise' | 'detailed';
}

export interface PracticeConsultationTemplate extends ConsultationLayout {
  name: string;
  archived?: boolean;
}

export interface PracticeNoteField {
  id: CustomConsultationField | CustomDischargeField;
  label: string;
  guidance?: string;
  example?: string;
  suggestedText?: string;
  inputType?: NoteInputType;
  options?: readonly string[];
  archived?: boolean;
}

export const IMAGING_REPORT_KINDS = ['radiology', 'ct'] as const;
export type ImagingReportKind = typeof IMAGING_REPORT_KINDS[number];
export interface ImagingReportField {
  label?: string;
  starterText?: string;
}
export type ImagingReportFields = Partial<Record<ImagingReportKind, ImagingReportField>>;
export const IMAGING_STARTER_TEXT_LIMIT = 4000;

export interface ConsultationLibrary {
  version?: 2 | 3 | 4;
  defaultId: string;
  templates: PracticeConsultationTemplate[];
  order?: string[];
  practiceFields?: PracticeNoteField[];
  imagingReportFields?: ImagingReportFields;
}

// Older clients cannot preserve custom sections and their dictation sources.
export const CONSULTATION_SNAPSHOT_VERSION = 4;
export const DISCHARGE_SNAPSHOT_VERSION = 5;
export const noteLibraryVersion = (kind: NoteTemplateKind) => kind === 'imaging' ? 2 : 4;
export const CONSULTATION_TEMPLATE_LIMIT = 24;
export const PRACTICE_NOTE_FIELD_LIMIT = 128;
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
const CONSULTATION_STARTER_NAMES: Record<ConsultationStarter, string> = {
  'dental-v2': 'Dental consultation',
  'dental-v1': 'Dental consultation (original)',
  'soap-v1': 'General SOAP',
  'recheck-v1': 'Recheck',
};
export const noteStarterName = (id: string) => isConsultationStarter(id) ? CONSULTATION_STARTER_NAMES[id]
  : id === 'dental-recovery-v1' ? 'Dental recovery' : 'Standard discharge';
export const consultationStarterNameKey = (template: ConsultationLayout) =>
  isConsultationStarter(template.id) && (!template.name || template.name === noteStarterName(template.id))
    ? `consultation.templates.starters.${template.id}` as const : undefined;

export const EMPTY_CONSULTATION_LIBRARY: ConsultationLibrary = { defaultId: DENTAL_CONSULTATION.id, templates: [] };
export const STANDARD_DISCHARGE: ConsultationLayout = {
  id: 'discharge-v1', fields: [], sections: DISCHARGE_FIELDS.map(id => ({ id })),
};
export const DISCHARGE_RECOVERY_ACTIVITY = 'dischargeCustom_recovery-activity';
export const DENTAL_RECOVERY: ConsultationLayout = {
  id: 'dental-recovery-v1', fields: [],
  sections: [...STANDARD_DISCHARGE.sections!, { id: DISCHARGE_RECOVERY_ACTIVITY }],
};
const DISCHARGE_STARTERS = [DENTAL_RECOVERY, STANDARD_DISCHARGE];
export const EMPTY_DISCHARGE_LIBRARY: ConsultationLibrary = { defaultId: DENTAL_RECOVERY.id, templates: [] };
export const isDischargeStarter = (id: string) => DISCHARGE_STARTERS.some(template => template.id === id);
export const dischargeStarterNameKey = (template: ConsultationLayout) =>
  template.id === STANDARD_DISCHARGE.id && (!template.name || template.name === 'Standard discharge') ? 'discharge.templates.starter'
    : template.id === DENTAL_RECOVERY.id && (!template.name || template.name === 'Dental recovery') ? 'discharge.templates.recovery'
      : undefined;
export const isUnmodifiedStandardDischarge = (layout: ConsultationLayout) =>
  layout.id === STANDARD_DISCHARGE.id && !layout.instructions && !layout.detail
  && JSON.stringify(layout.sections) === JSON.stringify(STANDARD_DISCHARGE.sections);

export const STANDARD_IMAGING: ConsultationLayout = {
  id: 'imaging-v1',
  fields: [],
  sections: [
    { id: 'consultationCustom_imaging-technique' },
    { id: 'consultationCustom_imaging-findings' },
    { id: 'consultationCustom_imaging-impression' },
  ],
};
export const EMPTY_IMAGING_LIBRARY: ConsultationLibrary = { defaultId: STANDARD_IMAGING.id, templates: [] };
export const defaultNoteLayout = (kind: NoteTemplateKind) =>
  kind === 'imaging' ? STANDARD_IMAGING : kind === 'discharge' ? DENTAL_RECOVERY : DENTAL_CONSULTATION;
export const isNoteStarter = (id: string, kind: NoteTemplateKind) =>
  kind === 'consultation' ? isConsultationStarter(id) : kind === 'discharge' ? isDischargeStarter(id) : id === STANDARD_IMAGING.id;

export const isConsultationSectionId = (id: string): id is ConsultationSectionId =>
  (CONSULTATION_STANDARD_FIELDS as readonly string[]).includes(id) || isCustomConsultationField(id);

export function normalizeConsultationSections(value: unknown, kind: NoteTemplateKind = 'consultation'): ConsultationSection[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > CONSULTATION_SECTION_LIMIT) return undefined;
  const sections: ConsultationSection[] = [];
  const ids = new Set<string>();
  for (const section of value) {
    if (!section || typeof section !== 'object' || Array.isArray(section)
      || Object.keys(section).some(key => !['id', 'label', 'guidance', 'example', 'suggestedText', 'format', 'level', 'ownerReport', 'inputType', 'options'].includes(key))
      || typeof section.id !== 'string' || ids.has(section.id)) return undefined;
    const { id, label, guidance, example, suggestedText, format, level, ownerReport, inputType, options } = section;
    const validId = kind === 'imaging' ? isCustomConsultationField(id) && !dentalSectionKey(id)
      : kind === 'discharge' ? (DISCHARGE_FIELDS as readonly string[]).includes(id) || isCustomDischargeField(id)
        : isConsultationSectionId(id);
    if (!validId) return undefined;
    if (ownerReport !== undefined && (kind !== 'discharge' || !isCustomDischargeField(id) || typeof ownerReport !== 'boolean')) return undefined;
    if (label !== undefined && (typeof label !== 'string' || !label.trim() || [...label].length > 100)) return undefined;
    if (isCustomNoteField(id) && !dentalSectionKey(id) && !(kind === 'imaging' && imagingSectionKey(id)) && id !== DISCHARGE_RECOVERY_ACTIVITY && label === undefined) return undefined;
    if ([guidance, example, suggestedText].some(text => text !== undefined && (typeof text !== 'string' || [...text].length > 1000))) return undefined;
    if (level !== undefined && level !== 2) return undefined;
    if (format !== undefined && format !== 'bullets' && format !== 'paragraph') return undefined;
    if (inputType !== undefined && (!NOTE_INPUT_TYPES.includes(inputType) || !canConfigureNoteInput(id, kind))) return undefined;
    if (isChoiceInput(inputType) !== (options !== undefined)) return undefined;
    if (options !== undefined && (!Array.isArray(options) || !options.length || options.length > NOTE_OPTION_LIMIT
      || new Set(options).size !== options.length || options.some(option => typeof option !== 'string'
        || !option || option.trim() !== option || /[\r\n]/u.test(option) || [...option].length > NOTE_OPTION_LENGTH))) return undefined;
    ids.add(id);
    sections.push({ id,
      ...(label !== undefined ? { label: label.trim() } : {}),
      ...(guidance ? { guidance } : {}), ...(example ? { example } : {}),
      ...(suggestedText ? { suggestedText } : {}), ...(format ? { format } : {}), ...(level ? { level } : {}), ...(ownerReport ? { ownerReport: true } : {}),
      ...(inputType ? { inputType } : {}), ...(options ? { options } : {}),
    });
  }
  return sections;
}

export function consultationSectionKey(section: ConsultationSection) {
  if (section.id === DISCHARGE_RECOVERY_ACTIVITY) return 'discharge.templates.activity' as const;
  const dentalKey = dentalSectionKey(section.id);
  if (dentalKey) return `consultation.dental.${dentalKey}` as const;
  if (isCustomNoteField(section.id)) return undefined;
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

/** Legacy Consults always displayed the gallery after the text fields. */
export function noteTemplateSections(layout: ConsultationLayout, kind: NoteTemplateKind): NoteTemplateSection[] {
  const sections: NoteTemplateSection[] = [...consultationSections(layout)];
  const placement = layout.imagePlacement ?? (kind === 'consultation' ? { index: sections.length } : false);
  if (kind !== 'imaging' && placement) {
    sections.splice(placement.index, 0, { id: NOTE_IMAGES_ID, ...(placement.label ? { label: placement.label } : {}),
      ...(placement.guidance ? { guidance: placement.guidance } : {}) });
  }
  return sections;
}
export function splitNoteTemplateSections(items: readonly NoteTemplateSection[], kind: NoteTemplateKind): Pick<ConsultationLayout, 'sections' | 'imagePlacement'> {
  const sections = items.filter((item): item is ConsultationSection => item.id !== NOTE_IMAGES_ID);
  const index = items.findIndex(item => item.id === NOTE_IMAGES_ID);
  if (index === -1) return { sections, imagePlacement: kind === 'consultation' ? false : undefined };
  const { label, guidance } = items[index];
  if (kind === 'consultation' && index === sections.length && !label && !guidance) return { sections, imagePlacement: undefined };
  return { sections, imagePlacement: { index, ...(label ? { label } : {}), ...(guidance ? { guidance } : {}) } };
}

/** Keep populated sections visible when a clinician switches templates. */
export function consultationVisitSections(info: Partial<PatientInfo>, layout: ConsultationLayout, kind: NoteTemplateKind = 'consultation'): readonly ConsultationSection[] {
  const active = consultationSections(layout);
  const ids = new Set(active.map(section => section.id));
  const retained: ConsultationSection[] = [];
  const saved = kind === 'discharge' ? info.dischargeRetainedSections : info.consultationRetainedSections;
  for (const section of [...(saved ?? []), ...standardNoteFields(kind).map(id => ({ id }))]) {
    if (!ids.has(section.id) && info[section.id]?.trim()) {
      retained.push(section);
      ids.add(section.id);
    }
  }
  return [...active, ...retained];
}

export function changeConsultationLayout(info: Partial<PatientInfo>, previous: ConsultationLayout, next: ConsultationLayout, kind: NoteTemplateKind = 'consultation'): Partial<PatientInfo> {
  const nextSections = new Set(consultationSections(next).map(section => section.id));
  const { id, name, fields, sections, instructions, detail, imagePlacement } = next;
  const layout = { id, fields, ...(name ? { name } : {}), ...(sections ? { sections } : {}),
    ...(instructions ? { instructions } : {}), ...(detail ? { detail } : {}), ...(imagePlacement === undefined ? {} : { imagePlacement }) };
  if (kind === 'discharge') {
    // Another device can fill a blank field while this device changes its layout.
    const previousSections = new Map([...info.dischargeRetainedSections ?? [], ...consultationSections(previous)]
      .map(section => [section.id, section]));
    const retained = [...previousSections.values()].filter(section => !nextSections.has(section.id));
    return {
      dischargeLayout: layout,
      ...(retained.length || info.dischargeRetainedSections?.length ? { dischargeRetainedSections: retained } : {}),
    };
  }
  const retained = consultationVisitSections(info, previous)
    .filter(section => !nextSections.has(section.id) && !!info[section.id]?.trim());
  return {
    consultationLayout: layout,
    ...(retained.length || info.consultationRetainedSections?.length ? { consultationRetainedSections: retained } : {}),
  };
}

export function normalizeConsultationLayout(value: unknown, kind: NoteTemplateKind = 'consultation'): ConsultationLayout | undefined {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return;
  const fields = 'fields' in value ? value.fields : undefined;
  const complete = Array.isArray(fields) && (kind !== 'consultation' ? fields.length === 0
    : fields.length === CONSULTATION_FIELDS.length && CONSULTATION_FIELDS.every(field => fields.includes(field)));
  const sections = 'sections' in value ? normalizeConsultationSections(value.sections, kind) : undefined;
  if ('sections' in value && !sections) return undefined;
  const instructions = 'instructions' in value ? value.instructions : undefined;
  if (instructions !== undefined && (typeof instructions !== 'string' || [...instructions].length > 2000)) return undefined;
  const detail = 'detail' in value ? value.detail : undefined;
  if (detail !== undefined && detail !== 'concise' && detail !== 'detailed') return undefined;
  const rawPlacement = 'imagePlacement' in value ? value.imagePlacement : undefined;
  let imagePlacement: NoteImagePlacement | undefined;
  if (rawPlacement !== undefined) {
    if (kind === 'imaging' || !sections) return undefined;
    if (rawPlacement === false) imagePlacement = false;
    else {
      if (!rawPlacement || typeof rawPlacement !== 'object' || Array.isArray(rawPlacement)
        || Object.keys(rawPlacement).some(key => !['index', 'label', 'guidance'].includes(key))) return undefined;
      const { index, label, guidance } = rawPlacement as Partial<Record<'index' | 'label' | 'guidance', unknown>>;
      if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > sections.length
        || (label !== undefined && (typeof label !== 'string' || !label.trim() || [...label].length > 100))
        || (guidance !== undefined && (typeof guidance !== 'string' || [...guidance].length > 1000))) return undefined;
      imagePlacement = { index, ...(typeof label === 'string' ? { label: label.trim() } : {}),
        ...(typeof guidance === 'string' && guidance ? { guidance } : {}) };
    }
  }
  const options: Pick<ConsultationLayout, 'sections' | 'instructions' | 'detail' | 'imagePlacement'> = {
    ...(sections ? { sections } : {}), ...(instructions ? { instructions } : {}), ...(detail ? { detail } : {}),
    ...(imagePlacement === undefined ? {} : { imagePlacement }),
  };
  if (kind === 'imaging' && value.id === STANDARD_IMAGING.id) return STANDARD_IMAGING;
  const dischargeStarter = kind === 'discharge' && DISCHARGE_STARTERS.find(template => template.id === value.id);
  if (dischargeStarter && !('name' in value)) return dischargeStarter;
  const consultationStarter = kind === 'consultation' && isConsultationStarter(value.id);
  if (consultationStarter && !('name' in value)) {
    if (!complete || (value.id === DENTAL_CONSULTATION.id && !sections)) return CONSULTATION_STARTERS[value.id as ConsultationStarter];
    return { id: value.id, fields: [...fields] as ConsultationField[], ...options };
  }
  if (!consultationStarter && !dischargeStarter && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.id)) return;
  if (!('name' in value) || typeof value.name !== 'string' || [...value.name].length > CONSULTATION_TEMPLATE_NAME_LIMIT || !value.name.trim()) return;
  if (!complete || ((kind !== 'consultation' || value.id === DENTAL_CONSULTATION.id) && !sections)) return;
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

function normalizePracticeNoteFields(value: unknown, kind: NoteTemplateKind): PracticeNoteField[] | undefined {
  if (!Array.isArray(value) || value.length > PRACTICE_NOTE_FIELD_LIMIT) return undefined;
  const result: PracticeNoteField[] = [];
  const ids = new Set<string>();
  for (const field of value) {
    if (!field || typeof field !== 'object' || Array.isArray(field)
      || Object.keys(field).some(key => !['id', 'label', 'guidance', 'example', 'suggestedText', 'inputType', 'options', 'archived'].includes(key))
      || (field.archived !== undefined && typeof field.archived !== 'boolean')) return undefined;
    const { archived, ...raw } = field;
    const section = normalizeConsultationSections([raw], kind)?.[0];
    if (!section?.label || section.id === DISCHARGE_RECOVERY_ACTIVITY || !isCustomNoteField(section.id) || dentalSectionKey(section.id) || (kind === 'imaging' && imagingSectionKey(section.id)) || ids.has(section.id)) return undefined;
    ids.add(section.id);
    result.push({ ...section, id: section.id, label: section.label, ...(archived ? { archived: true } : {}) });
  }
  return result;
}

/** Reuse existing custom fields from older libraries without changing their pinned layouts. */
export function practiceNoteFields(library: ConsultationLibrary, kind: NoteTemplateKind = 'consultation'): PracticeNoteField[] {
  const result = new Map((library.practiceFields ?? []).map(field => [field.id, field]));
  for (const template of library.templates) {
    for (const section of consultationSections(template)) {
      if (!isCustomNoteField(section.id) || section.id === DISCHARGE_RECOVERY_ACTIVITY || dentalSectionKey(section.id) || (kind === 'imaging' && imagingSectionKey(section.id)) || !section.label || result.has(section.id)) continue;
      const { id, label, guidance, example, suggestedText, inputType, options } = section;
      result.set(section.id, { id, label, guidance, example, suggestedText, inputType, options });
    }
  }
  return [...result.values()];
}

export function updatePracticeNoteField(library: ConsultationLibrary, field: PracticeNoteField): ConsultationLibrary {
  const { id, label, guidance, example, suggestedText, inputType, options } = field;
  const practiceFields = (library.practiceFields ?? []).filter(item => item.id !== id);
  return {
    ...library,
    practiceFields: [...practiceFields, field],
    templates: library.templates.map(template => {
      if (!template.sections?.some(section => section.id === id)) return template;
      return { ...template, sections: template.sections.map(section =>
        section.id === id ? { ...section, label, guidance, example, suggestedText, inputType, options } : section) };
    }),
  };
}

function normalizeImagingReportFields(value: unknown): ImagingReportFields | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const fields: ImagingReportFields = {};
  for (const [kind, field] of Object.entries(value)) {
    if ((kind !== 'radiology' && kind !== 'ct') || !field || typeof field !== 'object' || Array.isArray(field)
      || Object.keys(field).some(key => key !== 'label' && key !== 'starterText')) return undefined;
    const { label, starterText } = field;
    if (label !== undefined && (typeof label !== 'string' || [...label].length > CONSULTATION_TEMPLATE_NAME_LIMIT)) return undefined;
    if (starterText !== undefined && (typeof starterText !== 'string' || [...starterText].length > IMAGING_STARTER_TEXT_LIMIT)) return undefined;
    fields[kind] = { ...(label?.trim() ? { label: label.trim() } : {}), ...(starterText?.trim() ? { starterText } : {}) };
  }
  return fields;
}

export function parseConsultationLibrary(value: unknown, kind: NoteTemplateKind = 'consultation'): ConsultationLibrary | undefined {
  if (!value || typeof value !== 'object' || !('templates' in value) || !Array.isArray(value.templates)
    || value.templates.length > CONSULTATION_TEMPLATE_LIMIT + (kind === 'discharge' ? DISCHARGE_STARTERS.length : kind === 'consultation' ? Object.keys(CONSULTATION_STARTERS).length : 0) || !('defaultId' in value) || typeof value.defaultId !== 'string') return;
  const version = 'version' in value ? value.version : undefined;
  if ((kind !== 'consultation' || version !== undefined) && version !== 2 && (kind === 'imaging' || (version !== 3 && version !== 4))) return undefined;
  const templates: PracticeConsultationTemplate[] = [];
  const ids = new Set<string>();
  for (const raw of value.templates) {
    const layout = normalizeConsultationLayout(raw, kind);
    if (version !== 4 && layout?.imagePlacement !== undefined) return undefined;
    if (version !== 3 && version !== 4 && ((kind === 'consultation' && layout && isConsultationStarter(layout.id)) || layout?.sections?.some(section => section.inputType))) return undefined;
    if (!layout?.name || ids.has(layout.id) || (raw.archived !== undefined && typeof raw.archived !== 'boolean')) return;
    ids.add(layout.id);
    templates.push({ ...layout, name: layout.name, ...(raw.archived ? { archived: true } : {}) });
  }
  if (templates.filter(template => !isNoteStarter(template.id, kind)).length > CONSULTATION_TEMPLATE_LIMIT) return;
  const defaultId = value.defaultId;
  const defaultTemplate = templates.find(template => template.id === defaultId);
  if (defaultTemplate ? defaultTemplate.archived : !isNoteStarter(defaultId, kind)) return;
  const order = 'order' in value ? value.order : undefined;
  if (order !== undefined && (!Array.isArray(order) || new Set(order).size !== order.length
    || order.some(id => typeof id !== 'string' || (!isNoteStarter(id, kind) && !ids.has(id))))) return undefined;
  const rawFields = 'practiceFields' in value ? value.practiceFields : undefined;
  const practiceFields = rawFields === undefined ? undefined : normalizePracticeNoteFields(rawFields, kind);
  if (rawFields !== undefined && (!practiceFields || version === undefined || (version !== 3 && version !== 4 && practiceFields.some(field => field.inputType)))) return undefined;
  const rawImagingFields = 'imagingReportFields' in value ? value.imagingReportFields : undefined;
  const imagingReportFields = rawImagingFields === undefined ? undefined : normalizeImagingReportFields(rawImagingFields);
  if (rawImagingFields !== undefined && (kind !== 'imaging' || !imagingReportFields)) return undefined;
  const config: ConsultationLibrary = { defaultId, templates, ...(order ? { order } : {}),
    ...(imagingReportFields ? { imagingReportFields } : {}),
    ...(version === 2 || version === 3 || version === 4 ? { version } : {}), ...(practiceFields ? { practiceFields } : {}) };
  return consultationLibraryFits(config) ? config : undefined;
}

export function consultationChoices(library: ConsultationLibrary, kind: NoteTemplateKind = 'consultation'): ConsultationLayout[] {
  const starters: readonly ConsultationLayout[] = kind === 'consultation' ? Object.values(CONSULTATION_STARTERS) : kind === 'discharge' ? DISCHARGE_STARTERS : [STANDARD_IMAGING];
  const choices = [...starters.flatMap(starter => {
    const override = library.templates.find(template => template.id === starter.id);
    return override?.archived ? [] : [override ?? starter];
  }), ...library.templates.filter(template => !template.archived && !isNoteStarter(template.id, kind))]
    .filter(template => template.id !== LEGACY_DENTAL_CONSULTATION.id || library.defaultId === template.id || !!template.name);
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

export function dischargeLayoutFor(patient: Partial<PatientInfo>, library = EMPTY_DISCHARGE_LIBRARY, historical = false): ConsultationLayout {
  if (patient.dischargeLayout) return patient.dischargeLayout;
  if (historical) return STANDARD_DISCHARGE;
  return consultationChoices(library, 'discharge').find(layout => layout.id === library.defaultId) ?? DENTAL_RECOVERY;
}

export function dischargeVisitSections(info: Partial<PatientInfo>) {
  return consultationVisitSections(info, info.dischargeLayout ?? STANDARD_DISCHARGE, 'discharge');
}

export function dischargeOwnerReportFields(info: Partial<PatientInfo>, activityLabel?: string) {
  return consultationSections(info.dischargeLayout ?? STANDARD_DISCHARGE).flatMap(section => {
    if (!isCustomDischargeField(section.id) || !section.ownerReport) return [];
    const label = section.label ?? (section.id === DISCHARGE_RECOVERY_ACTIVITY ? activityLabel : undefined);
    const value = info[section.id];
    return label && value?.trim() ? [{ id: section.id, label, value }] : [];
  });
}

export function noteSectionLines(value: string | undefined, section: ConsultationSection): string[] {
  const lines = (value ?? '').split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  return section.format === 'bullets' ? lines.map(line => `• ${line.replace(/^(?:[-*•] |\d+[.)] )/u, '')}`) : lines;
}

/** An outline only adds labels, and leaves clinical wording as entered. */
export function insertImagingOutline(report: string, headings: readonly string[]): string {
  const normalize = (value: string) => value.replace(/：/gu, ':').trim().toLowerCase();
  const lines = report.split(/\r?\n/u).map(line => normalize(line.trim().replace(/^#{1,6}\s+/u, '').replace(/\*\*/gu, '')));
  const missing = headings.flatMap(heading => {
    const label = heading.replace(/[\r\n]+/gu, ' ').trim().replace(/[:：]$/u, '').trim();
    const key = normalize(label);
    if (!label || lines.some(line => line === key || line.startsWith(`${key}:`))) return [];
    lines.push(key);
    return [`${label}:`];
  });
  return missing.length ? [report, ...missing].filter(Boolean).join('\n\n') : report;
}
