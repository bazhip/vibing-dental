import { render, screen } from '@testing-library/react';
import { PatientForm } from './PatientForm';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, PatientInfo } from '../types';

const info: PatientInfo = {
  patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '',
  date: '2026-11-12', complaint: '', treatmentReport: '', recallDate: '',
  nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS },
};

test('Recheck due shows by default and hides with the personal setting', () => {
  const { rerender } = render(<PatientForm patientInfo={info} species="canine" onPatientInfoChange={() => {}} onSpeciesChange={() => {}} />);
  expect(screen.getByText('Recheck due')).toBeInTheDocument();
  rerender(<PatientForm patientInfo={info} species="canine" onPatientInfoChange={() => {}} onSpeciesChange={() => {}} hideRecheck />);
  expect(screen.queryByText('Recheck due')).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Set the recheck date/)).not.toBeInTheDocument();
});
