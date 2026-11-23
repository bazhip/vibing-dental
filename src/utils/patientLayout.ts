import { parsePracticeChartField, type SharedPracticeField } from './practiceChartFields';

export const PATIENT_BUILTIN_FIELDS = [
  'patientName', 'patientNumber', 'species', 'dentition', 'date', 'ownerName', 'ownerPhone', 'ownerEmail',
  'tech', 'recallDate', 'complaint',
] as const;
export type PatientBuiltinField = typeof PATIENT_BUILTIN_FIELDS[number];
export const REQUIRED_PATIENT_FIELDS: readonly PatientBuiltinField[] = ['patientName', 'patientNumber', 'species', 'dentition', 'date'];
export const PATIENT_DEFAULT_GROUPS = ['identityGroup', 'ownerGroup', 'visitGroup'] as const;
export type PatientDefaultGroup = typeof PATIENT_DEFAULT_GROUPS[number];

export interface PatientSection {
  id: string;
  label?: string;
  fields: string[];
}
export interface PatientLayout {
  sections: PatientSection[];
  customFields: SharedPracticeField[];
}

const MAX_SECTIONS = 12;
const MAX_CUSTOM_FIELDS = 20;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u;

export function defaultPatientLayout(order: readonly string[] = PATIENT_BUILTIN_FIELDS, hidden: readonly string[] = []): PatientLayout {
  const visible = order.filter(field => !hidden.includes(field));
  return {
    sections: [
      { id: 'identityGroup', fields: ['patientName', 'patientNumber', 'species', 'dentition'] },
      { id: 'ownerGroup', fields: visible.filter(field => ['ownerName', 'ownerPhone', 'ownerEmail'].includes(field)) },
      { id: 'visitGroup', fields: ['date', ...visible.filter(field => ['tech', 'recallDate'].includes(field)), 'complaint'] },
    ],
    customFields: [],
  };
}

export function patientDefaultGroup(id: string): PatientDefaultGroup | undefined {
  return PATIENT_DEFAULT_GROUPS.find(group => group === id);
}

export function parsePatientLayout(raw: unknown): PatientLayout | undefined {
  if (!raw || typeof raw !== 'object' || !('sections' in raw) || !('customFields' in raw)
    || !Array.isArray(raw.sections) || !raw.sections.length || raw.sections.length > MAX_SECTIONS
    || !Array.isArray(raw.customFields) || raw.customFields.length > MAX_CUSTOM_FIELDS) return undefined;

  const customFields = raw.customFields.map(parsePracticeChartField);
  if (customFields.some(field => !field)) return undefined;
  const fields = customFields.filter(field => field !== undefined);
  const validFields = new Set<string>([...PATIENT_BUILTIN_FIELDS, ...fields.map(field => field.id)]);
  if (validFields.size !== PATIENT_BUILTIN_FIELDS.length + fields.length) return undefined;

  const sections: PatientSection[] = [];
  const placed = new Set<string>();
  const ids = new Set<string>();
  for (const section of raw.sections) {
    if (!section || typeof section.id !== 'string' || (!patientDefaultGroup(section.id) && !UUID.test(section.id))
      || ids.has(section.id) || !Array.isArray(section.fields)) return undefined;
    const label = typeof section.label === 'string' ? section.label.trim() : '';
    if (label.length > 100 || /[\u0000\uD800-\uDFFF]/u.test(label) || (!label && !patientDefaultGroup(section.id))) return undefined;
    const sectionFields: string[] = [];
    for (const field of section.fields) {
      if (typeof field !== 'string' || !validFields.has(field) || placed.has(field)) return undefined;
      placed.add(field);
      sectionFields.push(field);
    }
    ids.add(section.id);
    sections.push({ id: section.id, ...(label ? { label } : {}), fields: sectionFields });
  }
  if (REQUIRED_PATIENT_FIELDS.some(field => !placed.has(field))) return undefined;
  return { sections, customFields: fields };
}
