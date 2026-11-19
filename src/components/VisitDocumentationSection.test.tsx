import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type PatientInfo } from '../types';
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
