import { createPatientIdentity, patientNumberOf, isGeneratedPatientNumber } from './patientIds';
it('creates different IDs for different pets regardless of name', () => {
  const a = createPatientIdentity(); const b = createPatientIdentity();
  expect(a.patientId).not.toBe(b.patientId);
  expect(a.patientNumber).not.toBe(b.patientNumber);
  expect(a.patientNumber).toMatch(/^P-[0-9A-Z]{12}$/);
});
it('keeps a custom number and restores the generated number when blank', () => {
  const identity = createPatientIdentity();
  expect(isGeneratedPatientNumber(identity)).toBe(true);
  expect(patientNumberOf({ ...identity, patientNumber: '  666  ' })).toBe('666');
  expect(isGeneratedPatientNumber({ ...identity, patientNumber: '666' })).toBe(false);
  expect(patientNumberOf({ ...identity, patientNumber: '' })).toBe(identity.patientNumber);
  expect(patientNumberOf({ patientNumber: '' })).toBe('');
});
