import { sampleOwnerReportSnapshot } from '../ownerReportSample';
import { buildRecordNote, recordNoteT } from '../recordNote';
import { clinicalMappingDefaults } from './clinicalMappings';
import { buildSendItems, effectiveMap, type FieldInfo } from './mapping';
import type { PimsId } from '../../extension/pims/types';
const snapshot = sampleOwnerReportSnapshot();
const fields = (...titles: string[]): FieldInfo[] => titles.map(title => ({ title, kind: 'note', acceptsImage: false }));

it.each(['ezyvet','daysmart','instinct','pulse','vetspire'] as PimsId[])('maps clinical sections to inspected SOAP fields for %s', provider => {
  const available = fields('History', 'Physical Exam', 'Assessment', 'Plan', 'Discharge Summary');
  expect(clinicalMappingDefaults(provider, available)).toMatchObject({
    consultationHistory: 'History', consultationAssessment: 'Assessment', consultationPlan: 'Plan',
    gpVitals: 'Physical Exam', gpPhysicalExam: 'Physical Exam', gpDiagnostics: 'Physical Exam', ct: 'Physical Exam',
    dischargeMedications: 'Discharge Summary', dischargeInstructions: 'Discharge Summary', dischargeFollowUp: 'Discharge Summary',
  });
});
it('uses Shepherd exact fields instead of choosing the first Assessment or Plan child', () => {
  expect(clinicalMappingDefaults('shepherd', fields('Subjective > History', 'Assessment > Assessment', 'Assessment > Laboratory', 'Assessment > Imaging', 'Plan/Schedule > Notes', 'Plan/Schedule > Recommendation', 'Objective > Physical Exam'))).toMatchObject({
    consultationHistory: 'Subjective > History', consultationAssessment: 'Assessment > Assessment', consultationPlan: 'Plan/Schedule > Recommendation',
    gpPhysicalExam: 'Objective > Physical Exam', gpVitals: 'Objective > Physical Exam', gpDiagnostics: 'Assessment > Laboratory', ct: 'Assessment > Imaging', dischargeInstructions: 'Plan/Schedule > Notes',
  });
});
it('uses Rhapsody medical and discharge notes, and Pulse generic medical notes', () => {
  expect(clinicalMappingDefaults('rhapsody', fields('Medical notes', 'Discharge notes'))).toMatchObject({ consultationHistory: 'Medical notes', gpVitals: 'Medical notes', ct: 'Medical notes', dischargeMedications: 'Discharge notes', dischargeInstructions: 'Discharge notes', dischargeFollowUp: 'Discharge notes' });
  expect(clinicalMappingDefaults('pulse', fields('Medical Notes'))).toMatchObject({ consultationHistory: 'Medical Notes', gpDiagnostics: 'Medical Notes', ct: 'Medical Notes', dischargeInstructions: 'Medical Notes' });
});
it('prefers a specific finding destination and never uses an unrelated or email field', () => {
  expect(clinicalMappingDefaults('ezyvet', fields('Physical Exam', 'Vitals', 'Diagnostics', 'Imaging'))).toMatchObject({ gpVitals: 'Vitals', gpDiagnostics: 'Diagnostics', ct: 'Imaging' });
  expect(clinicalMappingDefaults('ezyvet', [{ title: 'History', kind: 'email', acceptsImage: false }, ...fields('Current Medications', 'Owner email')])).toMatchObject({ consultationHistory: null, gpVitals: null, dischargeMedications: null });
});
it('leaves ambiguous compound fields unselected and does not fall back around ambiguity', () => {
  expect(clinicalMappingDefaults('daysmart', fields('Objective > Vitals', 'Other > Vitals', 'Physical Exam'))).toMatchObject({ gpVitals: null });
  expect(clinicalMappingDefaults('daysmart', fields('Objective > Dental', 'Objective > General'))).toMatchObject({ gpPhysicalExam: null });
});
it('preserves saved skips and explicit destinations while filling newly added sections', () => {
  expect(effectiveMap({ gpVitals: null, ct: 'Custom CT' }, 'ezyvet', fields('History', 'Physical Exam', 'Assessment', 'Plan', 'Discharge Summary'))).toMatchObject({ gpVitals: null, ct: 'Custom CT', consultationHistory: 'History', dischargeInstructions: 'Discharge Summary' });
});
it('groups all new clinical sources once into the native note destination without losing headings or text', () => {
  const available = fields('Medical notes', 'Discharge notes');
  const defaults = clinicalMappingDefaults('rhapsody', available);
  const note = { sections: Object.keys(defaults).map(key => ({ key: key as keyof typeof defaults, heading: key, lines: ['Unique '+key] })) };
  const result = buildSendItems({ note, map: effectiveMap(null, 'rhapsody', available), fields: available, pngDataUrl: null });
  expect(result.unresolved).toEqual([]);
  expect(result.items.map(item => item.fieldTitle)).toEqual(['Medical notes', 'Discharge notes']);
  for (const section of note.sections) expect(result.items.find(item => item.fieldTitle === defaults[section.key])?.text).toContain('Unique '+section.key);
});
it('does not choose between equally specific aliases', () => {
  expect(clinicalMappingDefaults('ezyvet', fields('Vitals', 'Vital signs', 'Physical Exam'))).toMatchObject({ gpVitals: null });
  expect(clinicalMappingDefaults('ezyvet', fields('Physical Exam', 'Physical examination', 'Objective'))).toMatchObject({ gpPhysicalExam: null });
});
it('sends the presenting complaint as history without sending patient demographics', () => {
  const { items } = buildSendItems({ note: buildRecordNote({ ...snapshot, patientInfo: { ...snapshot.patientInfo, patientName: 'Private patient name', complaint: 'Pain while chewing' } }, recordNoteT('en')), map: effectiveMap(null, 'ezyvet', fields('History')), fields: fields('History'), pngDataUrl: null });
  expect(items.find(item => item.fieldTitle === 'History')?.text).toContain('Pain while chewing');
  expect(JSON.stringify(items)).not.toContain('Private patient name');
});
it('keeps legacy CT destinations and skips while preferring an explicit main CT choice', () => {
  expect(effectiveMap({ ctReport: null } as never).ct).toBeNull();
  expect(effectiveMap({ ctReport: 'Custom CT' } as never).ct).toBe('Custom CT');
  expect(effectiveMap({ ct: null, ctReport: 'Legacy CT' } as never).ct).toBeNull();
});

it('routes consultation medication documentation to note fields', () => {
  expect(clinicalMappingDefaults('ezyvet', fields('History', 'Plan', 'Medications', 'Prescriptions'))).toMatchObject({
    consultationCurrentMedications: 'History',
    consultationAdministeredMedications: 'Plan',
    consultationMedicationPlan: 'Plan',
  });
  expect(clinicalMappingDefaults('ezyvet', fields('Medications', 'Prescriptions'))).toMatchObject({
    consultationCurrentMedications: null,
    consultationAdministeredMedications: null,
    consultationMedicationPlan: null,
  });
});
