import type { PatientInfo } from '../types';
import { CONSULTATION_MEDICATION_FIELDS, isCustomNoteField, normalizeConsultationLayout, normalizeConsultationSections, type ConsultationSection } from './consultationTemplates';

export const VISIT_DOCUMENT_MAX_LENGTH = 20000;
export const VISIT_DOCUMENT_FIELDS = [
  'gpVitals', 'gpPhysicalExam', 'gpDiagnostics',
  'consultationHistory', 'consultationAssessment', 'consultationPlan',
  ...CONSULTATION_MEDICATION_FIELDS,
  'dischargeMedications', 'dischargeInstructions', 'dischargeFollowUp',
] as const satisfies readonly (keyof PatientInfo)[];
export type VisitDocumentField = typeof VISIT_DOCUMENT_FIELDS[number];
export type VisitDocumentKind = 'consultation' | 'gp-exam' | 'discharge';
export const visitDocumentField = <T extends VisitDocumentField | 'complaint'>(id: T) => ({
  id, labelKey: `fields.${id}.label` as const, helperKey: `fields.${id}.helper` as const,
});
/** Stable document IDs and source field IDs can also be reused by future GP templates. */
export const VISIT_DOCUMENT_TEMPLATES = {
  'gp-exam': { id: 'gp-exam-v1', fields: [visitDocumentField('gpVitals'), visitDocumentField('gpPhysicalExam'), visitDocumentField('gpDiagnostics')] },
  consultation: { id: 'consultation-v1', fields: [visitDocumentField('complaint'), visitDocumentField('consultationHistory'), visitDocumentField('consultationAssessment'), visitDocumentField('consultationPlan')] },
  discharge: { id: 'discharge-v1', fields: [visitDocumentField('dischargeMedications'), visitDocumentField('dischargeInstructions'), visitDocumentField('dischargeFollowUp')] },
} as const;

/** Imported sources are optional; never stringify malformed values or truncate clinical wording. */
export function normalizeVisitDocumentation<T extends Partial<PatientInfo>>(info: T): T {
  const result = { ...info };
  for (const key of VISIT_DOCUMENT_FIELDS) {
    const value: unknown = result[key];
    if (value !== undefined && (typeof value !== 'string' || value.length > VISIT_DOCUMENT_MAX_LENGTH)) delete result[key];
  }
  for (const kind of ['consultation', 'discharge'] as const) {
    const layoutKey = `${kind}Layout` as const;
    const retainedKey = `${kind}RetainedSections` as const;
    const layout = normalizeConsultationLayout(result[layoutKey], kind);
    if (layout) result[layoutKey] = layout;
    else delete result[layoutKey];
    const raw = result[retainedKey];
    const retained = new Map<string, ConsultationSection>();
    if (Array.isArray(raw)) {
      for (const candidate of raw) {
        const section = normalizeConsultationSections([candidate], kind)?.[0];
        if (section && !retained.has(section.id)) retained.set(section.id, section);
      }
    }
    if (retained.size) result[retainedKey] = [...retained.values()];
    else delete result[retainedKey];
  }
  for (const key of Object.keys(result) as Array<keyof PatientInfo>) {
    const value = result[key];
    if (key.startsWith('consultationCustom_') || key.startsWith('dischargeCustom_')) {
      if (!isCustomNoteField(key) || typeof value !== 'string' || value.length > VISIT_DOCUMENT_MAX_LENGTH) delete result[key];
    }
  }
  return result;
}
export function hasVisitDocumentation(info: Partial<PatientInfo>): boolean {
  return VISIT_DOCUMENT_FIELDS.some(key => typeof info[key] === 'string' && !!info[key]?.trim())
    || Object.keys(info).some(key => isCustomNoteField(key) && !!info[key]?.trim());
}
