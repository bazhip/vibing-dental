/** Internal patient identity is independent of the editable practice number. */
export interface PatientIdFields {
  patientId?: string;
  generatedPatientNumber?: string;
  patientNumber: string;
}
export function createPatientIdentity(): Required<PatientIdFields> {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const patientId = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return { patientId, patientNumber: '', generatedPatientNumber: '' };
}
export function patientNumberOf(info: PatientIdFields): string {
  return info.patientNumber.trim() || info.generatedPatientNumber || '';
}
export function isGeneratedPatientNumber(info: PatientIdFields): boolean {
  return !!info.generatedPatientNumber && patientNumberOf(info) === info.generatedPatientNumber;
}
