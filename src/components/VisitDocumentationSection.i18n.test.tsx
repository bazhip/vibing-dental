import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type PatientInfo } from '../types';
import { VisitDocumentationSection } from './VisitDocumentationSection';
import { ConsultationTemplatesDialog } from './ConsultationTemplatesDialog';
import { EMPTY_CONSULTATION_LIBRARY } from '../utils/consultationTemplates';
const patient: PatientInfo = { patientName: '', patientNumber: '', ownerName: '', ownerPhone: '', ownerEmail: '', doctor: '', tech: '', date: '', complaint: '', treatmentReport: '', recallDate: '', nerveBlocks: { ...EMPTY_NERVE_BLOCKS }, exam: { ...EMPTY_EXAM_FINDINGS } };
beforeAll(() => installPseudoLocale());
afterAll(() => restoreLocale());
it.each(['consultation', 'gp-exam', 'discharge'] as const)('translates the %s source form and review action', kind => {
  const { container } = render(<VisitDocumentationSection kind={kind} patientInfo={patient} onChange={vi.fn()} onReview={vi.fn()} />);
  expect(findUntranslated(container)).toEqual([]);
});

it('translates the consultation template library and fictional preview', () => {
  render(<ConsultationTemplatesDialog initial={EMPTY_CONSULTATION_LIBRARY} status="ready" canEdit
    onSave={vi.fn()} onReload={vi.fn()} onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog');
  fireEvent.click(dialog.querySelector('button[aria-pressed]')!);
  expect(findUntranslated(dialog)).toEqual([]);
});

it('reorders the clinical fields and lists the shared Images section', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const onSave = vi.fn();
  render(<ConsultationTemplatesDialog initial={{ defaultId: id, templates: [{
    id, name: 'Custom consultation', fields: ['complaint', 'gpVitals', 'consultationHistory', 'gpPhysicalExam',
      'consultationAssessment', 'gpDiagnostics', 'consultationPlan'],
  }] }} status="ready" canEdit onSave={onSave} onReload={vi.fn()} onClose={vi.fn()} />);
  const fields = screen.getAllByRole('list')[1];
  expect(fields.querySelectorAll('li')).toHaveLength(11);
  expect(fields.lastElementChild).toHaveTextContent(/Images/);
  fireEvent.click(fields.querySelectorAll('li')[0].querySelectorAll('button')[1]);
  fireEvent.click(screen.getByRole('button', { name: /Save/ }));
  expect(onSave).toHaveBeenCalledWith({ defaultId: id, templates: [{
    id, name: 'Custom consultation', fields: ['gpVitals', 'complaint', 'consultationHistory', 'gpPhysicalExam',
      'consultationAssessment', 'gpDiagnostics', 'consultationPlan'],
  }] });
});


it('translates a previous medication list and the external drug lookup', () => {
  const { container } = render(<VisitDocumentationSection kind="consultation" patientInfo={patient} onChange={vi.fn()}
    consultation={{ library: EMPTY_CONSULTATION_LIBRARY, previousMedicationList: {
      date: '2026-11-18', current: 'Medication A', decisions: 'Recheck before change',
    }, onCopyMedicationList: vi.fn() }} />);
  fireEvent.click(screen.getByText(/Look up a drug/));
  const input = screen.getByRole('textbox', { name: /Drug name/ });
  fireEvent.change(input, { target: { value: 'Medication A' } });
  expect(screen.getByRole('button', { name: /Search labels/ })).toBeEnabled();
  expect(findUntranslated(container, ['Medication A', 'Recheck before change'])).toEqual([]);
});
