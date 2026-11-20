import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type PatientInfo } from '../types';
import { CONSULTATION_FIELDS, DISCHARGE_RECOVERY_ACTIVITY, EMPTY_DISCHARGE_LIBRARY } from '../utils/consultationTemplates';
import { VisitDocumentationSection } from './VisitDocumentationSection';
export const patient: PatientInfo = { patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '', date: '', complaint: 'Reason', treatmentReport: 'Existing treatment', recallDate: '', nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS } };
it('edits declarative consultation sources with linked visible help and reviews the existing output', () => {
  const onChange = vi.fn(); const onReview = vi.fn();
  render(<VisitDocumentationSection kind="consultation" patientInfo={patient} onChange={onChange} onReview={onReview} />);
  const field = screen.getByRole('textbox', { name: 'History' });
  fireEvent.change(field, { target: { value: 'Exact uncertain wording?' } });
  expect(onChange).toHaveBeenCalledWith({ consultationHistory: 'Exact uncertain wording?' });
  expect(document.getElementById(field.getAttribute('aria-describedby')!)).toBeVisible();
  expect(field).toHaveAttribute('maxlength', '20000');
  expect(screen.getByRole('textbox', { name: 'Reason for visit' })).toHaveValue('Reason');
  fireEvent.click(screen.getByRole('button', { name: 'Review clinical record' }));
  expect(onReview).toHaveBeenCalledOnce();
});
it('shows the shared treatment recap, child output, and read-only source fields without a second treatment editor', () => {
  render(<VisitDocumentationSection kind="discharge" patientInfo={patient} onChange={vi.fn()} readOnly><p>Existing client output</p></VisitDocumentationSection>);
  expect(screen.getByText('Existing treatment')).toBeVisible();
  expect(screen.getByText('Existing client output')).toBeVisible();
  expect(screen.getAllByRole('textbox')).toHaveLength(3);
  for (const field of screen.getAllByRole('textbox')) expect(field).toHaveAttribute('readonly');
});
it('does not dispatch source changes while read-only, including synthetic changes', () => {
  const onChange = vi.fn();
  render(<VisitDocumentationSection kind="discharge" patientInfo={patient} onChange={onChange} readOnly />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Medications' }), { target: { value: 'Should not write' } });
  expect(onChange).not.toHaveBeenCalled();
});
it('shows the client-language source notice only for discharge', () => {
  const { rerender } = render(<VisitDocumentationSection kind="consultation" patientInfo={patient} onChange={vi.fn()} />);
  expect(screen.queryByText(/Recorded wording stays as entered/)).not.toBeInTheDocument();
  rerender(<VisitDocumentationSection kind="discharge" patientInfo={patient} onChange={vi.fn()} />);
  expect(screen.getByText(/Recorded wording stays as entered/)).toBeVisible();
});

it('places the discharge dictation control in the section title action slot', () => {
  render(<VisitDocumentationSection kind="discharge" patientInfo={patient} onChange={vi.fn()}
    dictation={<button type="button">Dictate discharge instructions</button>} />);
  const heading = screen.getByRole('heading', { name: 'Discharge' });
  const dictation = screen.getByRole('button', { name: 'Dictate discharge instructions' });
  expect(heading.parentElement?.querySelector('.section-header__title-action')).toContainElement(dictation);
});

it('selects a consult template without changing any clinical fields', () => {
  const onChange = vi.fn();
  render(<VisitDocumentationSection kind="consultation" patientInfo={patient} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Dental consultation', pressed: true }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'General SOAP', pressed: false }));
  expect(onChange).toHaveBeenCalledWith({ consultationLayout: expect.objectContaining({ id: 'soap-v1' }) });
  expect(screen.getByRole('textbox', { name: 'Reason for visit' })).toHaveValue('Reason');
});

it('keeps a saved consult template visible and protects its sources when locked', () => {
  render(<VisitDocumentationSection kind="consultation" patientInfo={patient} onChange={vi.fn()} readOnly />);
  expect(screen.getByText('Dental consultation (original)')).toBeVisible();
  expect(screen.queryByRole('group', { name: 'Note template' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Reason for visit' })).toHaveAttribute('readonly');
});

it('only inserts suggested text when requested and keeps a populated custom section after switching', () => {
  const field = 'consultationCustom_decision';
  const id = '11111111-1111-4111-8111-111111111111';
  const template = {
    id, name: 'Intake',
    fields: CONSULTATION_FIELDS,
    sections: [{ id: field, label: 'Decision', suggestedText: 'Client received an estimate.' }],
  } as const;
  const onChange = vi.fn();
  const props = {
    kind: 'consultation' as const, onChange,
    consultation: { library: { defaultId: id, templates: [template] } },
  };
  const { rerender } = render(<VisitDocumentationSection {...props} patientInfo={patient} />);
  expect(screen.getByRole('textbox', { name: 'Decision' })).toHaveValue('');
  fireEvent.click(screen.getByText('Suggested text'));
  fireEvent.click(screen.getByRole('button', { name: 'Use suggested text' }));
  expect(onChange).toHaveBeenLastCalledWith({ [field]: 'Client received an estimate.' });
  const documented = { ...patient, consultationLayout: template, [field]: 'Client received an estimate.' };
  rerender(<VisitDocumentationSection {...props} patientInfo={documented} />);
  fireEvent.click(screen.getByRole('button', { name: 'General SOAP' }));
  const patch = onChange.mock.lastCall![0];
  expect(patch.consultationRetainedSections).toEqual(template.sections);
  rerender(<VisitDocumentationSection {...props} patientInfo={{ ...documented, ...patch }} />);
  fireEvent.click(screen.getByText('Fields from other templates'));
  expect(screen.getByRole('textbox', { name: 'Decision' })).toHaveValue('Client received an estimate.');
});


it('retains recorded activity when switching from Dental recovery and skips blank fields with guidance', () => {
  const onChange = vi.fn();
  const props = { kind: 'discharge' as const, onChange, discharge: { library: EMPTY_DISCHARGE_LIBRARY } };
  const { rerender } = render(<VisitDocumentationSection {...props} patientInfo={patient} />);

  const activity = screen.getByRole('textbox', { name: 'Activity' });
  expect(activity).toHaveAccessibleDescription('Record any activity restrictions discussed.');
  expect(activity).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Standard discharge' }));
  rerender(<VisitDocumentationSection {...props} patientInfo={{ ...patient, ...onChange.mock.lastCall![0] }} />);
  expect(screen.queryByText('Fields from other templates')).toBeNull();

  rerender(<VisitDocumentationSection {...props} patientInfo={patient} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Activity' }), { target: { value: 'Activity restrictions reviewed.' } });
  expect(onChange.mock.lastCall![0]).toEqual({ [DISCHARGE_RECOVERY_ACTIVITY]: 'Activity restrictions reviewed.' });
  const documented = { ...patient, ...onChange.mock.lastCall![0] };
  rerender(<VisitDocumentationSection {...props} patientInfo={documented} />);
  fireEvent.click(screen.getByRole('button', { name: 'Standard discharge' }));
  rerender(<VisitDocumentationSection {...props} patientInfo={{ ...documented, ...onChange.mock.lastCall![0] }} />);
  fireEvent.click(screen.getByText('Fields from other templates'));
  expect(screen.getByRole('textbox', { name: 'Activity' })).toHaveValue('Activity restrictions reviewed.');
});
