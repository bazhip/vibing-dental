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

test('keeps recorded rechecks and uses the configured order of owner fields', () => {
  render(<PatientForm patientInfo={{ ...info, recallDate: '2026-12-12' }} species="canine"
    onPatientInfoChange={() => {}} onSpeciesChange={() => {}} hideRecheck
    fieldOrder={['ownerEmail', 'ownerName', 'ownerPhone', 'tech', 'recallDate']} />);
  expect(screen.getByLabelText('Recheck due')).toHaveValue('2026-12-12');
  const former = screen.getByLabelText('Owner email');
  const latter = screen.getByLabelText('Owner name');
  expect(former.compareDocumentPosition(latter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

 test('optional fields hide only when empty and retain recorded information', () => {
  const props = { species: 'canine' as const, onPatientInfoChange: () => {}, onSpeciesChange: () => {}, hiddenFields: ['ownerName', 'ownerPhone', 'ownerEmail', 'tech'] as const };
  const { rerender } = render(<PatientForm {...props} hiddenFields={[...props.hiddenFields]} patientInfo={info} />);
  expect(screen.queryByLabelText('Owner name')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Technician')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Owner phone')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Owner email')).not.toBeInTheDocument();
  rerender(<PatientForm {...props} hiddenFields={[...props.hiddenFields]} patientInfo={{ ...info, ownerName: 'Alex', tech: 'Sam' }} />);
  expect(screen.getByDisplayValue('Alex')).toBeVisible();
  expect(screen.getByDisplayValue('Sam')).toBeVisible();
});
