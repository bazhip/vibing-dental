import type { PimsId } from '../../extension/pims/types';
import type { FieldInfo } from './mapping';

/** Note destinations only: these labels never create native measurements, prescriptions or orders. */
const EXAM = [['Physical Exam', 'Physical examination', 'Exam'], ['Objective > Notes'], ['Objective']] as const;
const DISCHARGE = [['Discharge Summary', 'Discharge notes', 'Discharge instructions'], ['Plan'], ['Plan > Notes']] as const;
const SOAP_DESTINATIONS = {
  complaint: [['History'], ['Subjective > Notes'], ['Subjective']],
  consultationHistory: [['History'], ['Subjective > Notes'], ['Subjective']],
  consultationAssessment: [['Assessment'], ['Assessment > Diagnosis']],
  consultationPlan: [['Plan'], ['Plan > Notes']],
  gpVitals: [['Vitals', 'Vital signs'], ...EXAM],
  gpPhysicalExam: EXAM,
  gpDiagnostics: [['Diagnostics', 'Diagnostic results'], ...EXAM],
  ct: [['CT report'], ['Imaging', 'Radiology'], ...EXAM],
  dischargeMedications: DISCHARGE, dischargeInstructions: DISCHARGE, dischargeFollowUp: DISCHARGE,
} as const;
export type ClinicalMappingKey = keyof typeof SOAP_DESTINATIONS;
export type ClinicalMappingDefaults = Record<ClinicalMappingKey, string | null>;

export const EZYVET_CLINICAL_DEFAULTS: ClinicalMappingDefaults = {
  complaint: 'History',
  consultationHistory: 'History', consultationAssessment: 'Assessment', consultationPlan: 'Plan',
  gpVitals: 'Physical Exam', gpPhysicalExam: 'Physical Exam', gpDiagnostics: 'Physical Exam', ct: 'Physical Exam',
  dischargeMedications: 'Discharge Summary', dischargeInstructions: 'Discharge Summary', dischargeFollowUp: 'Discharge Summary',
};
const normalize = (text: string) => text.trim().toLowerCase().replace(/[?:;.!]+$/, '').trim();
const segments = (text: string) => text.split('>').map(normalize);

/** Distinguish missing from ambiguous: ambiguity must not select a broader destination. */
function matchDefault(wanted: string, available: string[]): string | null | undefined {
  const name = normalize(wanted), parts = segments(wanted);
  const exact = available.filter(title => normalize(title) === name);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const compound = available.filter(title => {
    const path = segments(title);
    return parts.length === 1 ? path.length > 1 && path.at(-1) === name
      : path.length > 1 && path[0] === parts[0] && path.at(-1) === parts.at(-1);
  });
  return compound.length ? compound.length === 1 ? compound[0] : null : undefined;
}

export function clinicalMappingDefaults(provider: PimsId, fields?: readonly FieldInfo[]): ClinicalMappingDefaults {
  if (!fields && provider === 'ezyvet') return { ...EZYVET_CLINICAL_DEFAULTS };
  const titles = (fields ?? []).filter(field => field.kind !== 'email').map(field => field.title);
  return Object.fromEntries(Object.entries(SOAP_DESTINATIONS).map(([key, soap]) => {
    let preferred: readonly (readonly string[])[] = soap;
    if (provider === 'shepherd') {
      const specific: Partial<Record<ClinicalMappingKey, string[]>> = {
        complaint: ['Subjective > Initial Complaint'], consultationHistory: ['Subjective > History'], consultationAssessment: ['Assessment > Assessment'],
        consultationPlan: ['Plan/Schedule > Recommendation'], gpDiagnostics: ['Assessment > Laboratory'], ct: ['Assessment > Imaging'],
        dischargeMedications: ['Plan/Schedule > Notes'], dischargeInstructions: ['Plan/Schedule > Notes'], dischargeFollowUp: ['Plan/Schedule > Recommendation'],
      };
      preferred = [...(specific[key as ClinicalMappingKey] ?? []).map(label => [label]), ...preferred];
    }
    if (provider === 'pulse' || provider === 'rhapsody') preferred = [...preferred, ['Medical notes']];
    let destination: string | null = null;
    for (const tier of preferred) {
      const hits = tier.map(candidate => matchDefault(candidate, titles));
      const matches = new Set(hits.filter((hit): hit is string => typeof hit === 'string'));
      if (hits.includes(null) || matches.size > 1) break;
      if (matches.size === 1) { destination = [...matches][0]; break; }
    }
    return [key, destination];
  })) as ClinicalMappingDefaults;
}

/** Preserve existing CT destinations/skips when adopting main's record-note section ID. */
export function compatibleClinicalMapping<T extends Record<string, string | null | undefined>>(saved: T): T & { ct?: string | null } {
  return !Object.hasOwn(saved, 'ct') && Object.hasOwn(saved, 'ctReport') ? { ...saved, ct: saved.ctReport } : saved;
}
