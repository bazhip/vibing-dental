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
