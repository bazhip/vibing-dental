import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { installPseudoLocale, restoreLocale, findUntranslated } from '../i18n/testing/pseudo';
import { EMPTY_EXAM_FINDINGS, EMPTY_NERVE_BLOCKS, type PatientInfo } from '../types';
import { VisitDocumentationSection } from './VisitDocumentationSection';
import { ConsultationTemplatesDialog } from './ConsultationTemplatesDialog';
import { CONSULTATION_FIELDS, EMPTY_CONSULTATION_LIBRARY } from '../utils/consultationTemplates';
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
  fireEvent.keyDown(fields.querySelectorAll('li')[0].querySelectorAll('button')[0], { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('button', { name: /Save/ }));
  expect(onSave).toHaveBeenCalledWith({ defaultId: id, templates: [{
    id, name: 'Custom consultation',
    fields: ['complaint', 'gpVitals', 'consultationHistory', 'gpPhysicalExam', 'consultationAssessment', 'gpDiagnostics', 'consultationPlan'],
    sections: ['gpVitals', 'complaint', 'consultationHistory', 'consultationCurrentMedications', 'gpPhysicalExam',
      'consultationAssessment', 'gpDiagnostics', 'consultationAdministeredMedications', 'consultationPlan', 'consultationMedicationPlan'].map(id => ({ id })),
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

it('closes sample import when a duplicate fills the final template slot', () => {
  const templates = Array.from({ length: 23 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    name: `Practice template ${index + 1}`,
    fields: CONSULTATION_FIELDS,
  }));
  const onSave = vi.fn();
  render(<ConsultationTemplatesDialog initial={{ ...EMPTY_CONSULTATION_LIBRARY, templates }} status="ready" canEdit
    onSave={onSave} onReload={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByText(/More options/));
  fireEvent.click(screen.getByRole('button', { name: /Create from a sample note/ }));
  fireEvent.change(screen.getByRole('textbox', { name: /Create from a sample note/ }), { target: { value: '# Summary' } });
  fireEvent.click(screen.getByRole('button', { name: /Duplicate/ }));
  expect(screen.queryByRole('textbox', { name: /Create from a sample note/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Duplicate/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /Save/ }));
  expect(onSave.mock.lastCall?.[0].templates).toHaveLength(24);
});

it('localizes the Discharge template editor and makes owner-report visibility an explicit opt-in', () => {
  const onSave = vi.fn();
  const id = '11111111-1111-4111-8111-111111111111';
  render(<ConsultationTemplatesDialog kind="discharge" initial={{ defaultId: id, templates: [{
    id, name: 'Dental recovery', fields: [], sections: [{ id: 'dischargeCustom_feeding', label: 'Feeding' }],
  }] }} status="ready" canEdit onSave={onSave} onReload={vi.fn()} onClose={vi.fn()} />);
  const dialog = screen.getByRole('dialog', { name: /Discharge templates/ });
  fireEvent.click(screen.getByRole('button', { name: 'Feeding' }));
  const include = screen.getByRole('checkbox', { name: /Include in owner report/ });
  expect(include).not.toBeChecked();
  expect(findUntranslated(dialog, ['Dental recovery', 'Feeding', /⟦Move Feeding (up|down)⟧/])).toEqual([]);
  fireEvent.click(include);
  fireEvent.click(screen.getByRole('button', { name: /Save/ }));
  expect(onSave.mock.lastCall?.[0].templates[0].sections[0]).toMatchObject({ ownerReport: true });
});

it('creates a reusable practice field, adds it to another template, and undoes a removal', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';
  const onSave = vi.fn();
  const templates = [
    { id, name: 'Dental recovery', fields: [], sections: [{ id: 'dischargeInstructions' as const }] },
    { id: otherId, name: 'Dental recheck', fields: [], sections: [{ id: 'dischargeFollowUp' as const }] },
  ];
  render(<ConsultationTemplatesDialog kind="discharge" initial={{ defaultId: id, templates }} status="ready" canEdit
    onSave={onSave} onReload={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Add section/ }));
  fireEvent.click(screen.getByRole('button', { name: /Create a field/ }));
  fireEvent.change(screen.getByRole('textbox', { name: /Field name/ }), { target: { value: 'Activity restrictions' } });
  fireEvent.click(screen.getByRole('button', { name: /Create a field/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Dental recheck' }));
  fireEvent.click(screen.getByRole('button', { name: /Add section/ }));
  fireEvent.change(screen.getByRole('searchbox', { name: /Search sections/ }), { target: { value: 'Activity' } });
  fireEvent.click(screen.getByRole('button', { name: 'Activity restrictions' }));
  fireEvent.click(screen.getByRole('button', { name: /Remove.*Activity restrictions/ }));
  expect(screen.queryByRole('button', { name: 'Activity restrictions' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
  expect(screen.getByRole('button', { name: 'Activity restrictions' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Save/ }));
  const saved = onSave.mock.lastCall?.[0];
  const field = saved.practiceFields[0];
  expect(field).toMatchObject({ label: 'Activity restrictions' });
  expect(saved.templates.every((template: { sections: { id: string }[] }) => template.sections.some(section => section.id === field.id))).toBe(true);
});

it('keeps pre-library custom fields in the practice picker when their last placement is removed', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const onSave = vi.fn();
  render(<ConsultationTemplatesDialog kind="discharge" initial={{ defaultId: id, templates: [{
    id, name: 'Recovery', fields: [], sections: [{ id: 'dischargeInstructions' }, { id: 'dischargeCustom_activity', label: 'Activity' }],
  }] }} status="ready" canEdit onSave={onSave} onReload={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Remove.*Activity/ }));
  fireEvent.click(screen.getByRole('button', { name: /Add section/ }));
  expect(screen.getByRole('button', { name: 'Activity' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: /Save/ }));
  expect(onSave.mock.lastCall?.[0].practiceFields).toEqual([expect.objectContaining({ label: 'Activity' })]);
});
