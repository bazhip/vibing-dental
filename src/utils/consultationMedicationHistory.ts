import type { CloudChartMeta } from './chartQueries';
import type { PatientInfo } from '../types';
import { speciesBase } from './species';

type Identity = Pick<PatientInfo, 'patientId' | 'patientNumber' | 'patientName'>;
type MedicationVisit = Pick<CloudChartMeta, 'id' | 'patient_id' | 'practice_id' | 'patient_number' | 'patient_name' | 'chart_date' | 'updated_at' | 'species' | 'visit_type'>;

export interface PreviousMedicationList {
  date: string;
  current: string;
  decisions: string;
}

export function sameMedicationPatient(first: Identity, second: Identity): boolean {
  if (first.patientId || second.patientId) return !!first.patientId && first.patientId === second.patientId;
  const number = first.patientNumber.trim().toLowerCase();
  const name = first.patientName.trim().toLowerCase();
  return !!number && !!name && number === second.patientNumber.trim().toLowerCase() && name === second.patientName.trim().toLowerCase();
}

export function previousMedicationVisit(
  visits: readonly MedicationVisit[], patient: Identity & { date: string }, currentId: string, species: string, practiceId: string,
): MedicationVisit | undefined {
  if (!patient.date || !practiceId) return;
  const current = visits.find(row => row.id === currentId);
  return visits.filter(row =>
    row.id !== currentId && row.practice_id === practiceId && row.visit_type === 'consultation' && row.species === speciesBase(species)
    && row.chart_date && (row.chart_date < patient.date
      || (row.chart_date === patient.date && (!current || row.updated_at < current.updated_at)))
    && sameMedicationPatient(patient, { patientId: row.patient_id, patientNumber: row.patient_number, patientName: row.patient_name }),
  ).sort((first, second) => second.chart_date.localeCompare(first.chart_date) || second.updated_at.localeCompare(first.updated_at))[0];
}

export function medicationLookupUrl(drug: string): string {
  const url = new URL('https://dailymed.nlm.nih.gov/dailymed/search.cfm');
  url.searchParams.set('query', drug.trim());
  return url.href;
}
