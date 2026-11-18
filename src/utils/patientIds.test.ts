import { createPatientIdentity, patientNumberOf, isGeneratedPatientNumber } from './patientIds';
it('creates different IDs for different pets regardless of name', () => {
  const a = createPatientIdentity(); const b = createPatientIdentity();
  expect(a.patientId).not.toBe(b.patientId);
  expect(a.patientNumber).toBe(''); // Reserved by the database once the practice is known.
  expect(b.generatedPatientNumber).toBe('');
});
it('keeps a custom number and restores the generated number when blank', () => {
  const identity = { ...createPatientIdentity(), patientNumber: '1001', generatedPatientNumber: '1001' };
  expect(isGeneratedPatientNumber(identity)).toBe(true);
  expect(patientNumberOf({ ...identity, patientNumber: '  666  ' })).toBe('666');
  expect(isGeneratedPatientNumber({ ...identity, patientNumber: '666' })).toBe(false);
  expect(patientNumberOf({ ...identity, patientNumber: '' })).toBe(identity.patientNumber);
  expect(patientNumberOf({ patientNumber: '' })).toBe('');
});
