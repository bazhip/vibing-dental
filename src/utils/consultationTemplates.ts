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
}

export interface PracticeConsultationTemplate extends ConsultationLayout {
  name: string;
  archived?: boolean;
}

export interface ConsultationLibrary {
  defaultId: string;
  templates: PracticeConsultationTemplate[];
}

export const CONSULTATION_TEMPLATE_LIMIT = 24;
export const CONSULTATION_TEMPLATE_NAME_LIMIT = 100;
export const DENTAL_CONSULTATION: ConsultationLayout = {
  id: 'dental-v1',
  fields: ['complaint', 'consultationHistory', 'gpPhysicalExam', 'gpVitals', 'gpDiagnostics', 'consultationAssessment', 'consultationPlan'],
};
export const CONSULTATION_STARTERS = {
  'dental-v1': DENTAL_CONSULTATION,
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

export function normalizeConsultationLayout(value: unknown): ConsultationLayout | undefined {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return;
  const fields = 'fields' in value ? value.fields : undefined;
  const complete = Array.isArray(fields) && fields.length === CONSULTATION_FIELDS.length
    && CONSULTATION_FIELDS.every(field => fields.includes(field));
  if (isConsultationStarter(value.id)) {
    return complete ? { id: value.id, fields: [...fields] as ConsultationField[] } : CONSULTATION_STARTERS[value.id];
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u.test(value.id)) return;
  if (!('name' in value) || typeof value.name !== 'string' || [...value.name].length > CONSULTATION_TEMPLATE_NAME_LIMIT || !value.name.trim()) return;
  if (!complete) return;
  return { id: value.id, name: value.name.trim(), fields: [...fields] as ConsultationField[] };
}

export function parseConsultationLibrary(value: unknown): ConsultationLibrary | undefined {
  if (!value || typeof value !== 'object' || !('templates' in value) || !Array.isArray(value.templates)
    || value.templates.length > CONSULTATION_TEMPLATE_LIMIT || !('defaultId' in value) || typeof value.defaultId !== 'string') return;
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
  return { defaultId, templates };
}

export function consultationChoices(library: ConsultationLibrary): ConsultationLayout[] {
  return [...Object.values(CONSULTATION_STARTERS), ...library.templates.filter(template => !template.archived)];
}

export function consultationLayoutFor(
  patient: Partial<PatientInfo>,
  library = EMPTY_CONSULTATION_LIBRARY,
  historical = false,
): ConsultationLayout {
  if (patient.consultationLayout) return patient.consultationLayout;
  if (historical) return DENTAL_CONSULTATION;
  return consultationChoices(library).find(layout => layout.id === library.defaultId) ?? DENTAL_CONSULTATION;
}
