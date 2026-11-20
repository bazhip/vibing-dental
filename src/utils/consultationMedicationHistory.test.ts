import { previousMedicationVisit, sameMedicationPatient, medicationLookupUrl } from './consultationMedicationHistory';

const patient = { patientId: 'patient-1', patientNumber: '7', patientName: 'Milo' };
const base = { practice_id: 'practice-1', patient_id: 'patient-1', patient_number: '7', patient_name: 'Milo', species: 'canine', visit_type: 'consultation', updated_at: '2026-11-18T12:00:00Z' };

it('selects the newest prior consultation for this patient even when other records are interleaved', () => {
  const visits = [
    { ...base, id: 'older', chart_date: '2026-10-08' },
    { ...base, id: 'other-patient', patient_id: 'patient-2', chart_date: '2026-11-18' },
    { ...base, id: 'dental', visit_type: 'dental', chart_date: '2026-11-19' },
    { ...base, id: 'future', chart_date: '2026-11-20' },
    { ...base, id: 'other-practice', practice_id: 'practice-2', chart_date: '2026-11-19' },
    { ...base, id: 'prior', chart_date: '2026-11-18' },
  ];
  expect(previousMedicationVisit(visits, { ...patient, date: '2026-11-19' }, 'active', 'canine', 'practice-1')?.id).toBe('prior');
});

it('requires a matching patient ID or both legacy identifiers', () => {
  expect(sameMedicationPatient(patient, { ...patient, patientId: 'patient-2' })).toBe(false);
  expect(sameMedicationPatient({ patientName: 'Milo', patientNumber: '7' }, { patientName: 'Milo', patientNumber: '8' })).toBe(false);
  expect(sameMedicationPatient({ patientName: 'Milo', patientNumber: '7' }, { patientName: ' MILO ', patientNumber: '7' })).toBe(true);
});

it('sends only the explicitly entered name as an encoded DailyMed search', () => {
  const url = new URL(medicationLookupUrl('  drug A & drug B  '));
  expect(url.origin).toBe('https://dailymed.nlm.nih.gov');
  expect(Array.from(url.searchParams.entries())).toEqual([['query', 'drug A & drug B']]);
});
