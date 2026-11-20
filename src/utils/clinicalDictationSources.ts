import type { ClinicalDictationField, ClinicalDictationKind, ClinicalDictationSource } from '../types';
import i18n from '../i18n';
import { isAppLanguage } from '../i18n/config';
import { CONSULTATION_MEDICATION_FIELDS } from './consultationTemplates';
import { LocalizedError } from './apiErrors';

export const CLINICAL_DICTATION_MAX_SOURCES = 20;
export const CLINICAL_DICTATION_MAX_TRANSCRIPT = 40000;
export const CLINICAL_DICTATION_MAX_TOTAL = 200000;
const KINDS: readonly ClinicalDictationKind[] = ['dental-visit', 'gp-visit', 'consultation', 'gp-exam', 'discharge', 'ct', 'imaging'];
const FIELDS: readonly ClinicalDictationField[] = ['complaint', 'consultationHistory', 'consultationAssessment', 'consultationPlan', 'gpVitals', 'gpPhysicalExam', 'gpDiagnostics', 'treatmentReport', 'ctReport', 'radiographicFindings', 'dischargeMedications', 'dischargeInstructions', 'dischargeFollowUp'];

export const DENTAL_SUPPLEMENT_FIELDS: readonly ClinicalDictationField[] = Object.freeze([
  'gpDiagnostics', 'ctReport', 'dischargeMedications', 'dischargeInstructions', 'dischargeFollowUp',
] as const);

export function isClinicalDictationSource(value: unknown): value is ClinicalDictationSource {
  if (!value || typeof value !== 'object') return false;
  const s = value as ClinicalDictationSource;
  const fields = s.kind === 'dental-visit' ? DENTAL_SUPPLEMENT_FIELDS
    : s.kind === 'consultation' ? [...FIELDS, ...CONSULTATION_MEDICATION_FIELDS] : FIELDS;
  return typeof s.id === 'string' && !!s.id.trim() && s.id.length <= 200
    && KINDS.includes(s.kind) && isAppLanguage(s.language)
    && typeof s.transcript === 'string' && !!s.transcript.trim() && s.transcript.length <= CLINICAL_DICTATION_MAX_TRANSCRIPT
    && typeof s.recordedAt === 'string' && s.recordedAt.length <= 100 && Number.isFinite(Date.parse(s.recordedAt))
    && Array.isArray(s.fields) && s.fields.length <= fields.length && s.fields.every(f => fields.includes(f)) && new Set(s.fields).size === s.fields.length;
}

/** Reject entire invalid entries without changing any retained clinical wording. */
export function normalizeClinicalDictations(value: unknown): ClinicalDictationSource[] {
  if (!Array.isArray(value)) return [];
  const result: ClinicalDictationSource[] = [];
  let total = 0;
  for (const source of value) {
    if (!isClinicalDictationSource(source) || result.some(s => s.id === source.id)) continue;
    if (result.length >= CLINICAL_DICTATION_MAX_SOURCES || total + source.transcript.length > CLINICAL_DICTATION_MAX_TOTAL) continue;
    result.push({ id: source.id, kind: source.kind, language: source.language, transcript: source.transcript, recordedAt: source.recordedAt, fields: [...source.fields] });
    total += source.transcript.length;
  }
  return result;
}

/** Live capture fails before changing state; clinical sources are never silently truncated. */
export function appendClinicalDictationSource(sources: readonly ClinicalDictationSource[], source: ClinicalDictationSource): ClinicalDictationSource[] {
  if (!isClinicalDictationSource(source) || sources.some(s => s.id === source.id)
    || sources.length >= CLINICAL_DICTATION_MAX_SOURCES
    || sources.reduce((total, s) => total + s.transcript.length, 0) + source.transcript.length > CLINICAL_DICTATION_MAX_TOTAL) {
    throw new LocalizedError(i18n.t('voice:clinical.storageLimit'));
  }
  return [...sources, { ...source, fields: [...source.fields] }];
}
