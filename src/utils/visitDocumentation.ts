import type { PatientInfo } from '../types';
import { normalizeConsultationLayout } from './consultationTemplates';

export const VISIT_DOCUMENT_MAX_LENGTH = 20000;
export const VISIT_DOCUMENT_FIELDS = [
  'gpVitals', 'gpPhysicalExam', 'gpDiagnostics',
  'consultationHistory', 'consultationAssessment', 'consultationPlan',
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
  const layout = normalizeConsultationLayout(result.consultationLayout);
  if (layout) result.consultationLayout = layout;
  else delete result.consultationLayout;
  return result;
}
export function hasVisitDocumentation(info: Partial<PatientInfo>): boolean {
  return VISIT_DOCUMENT_FIELDS.some(key => typeof info[key] === 'string' && !!info[key]?.trim());
}
