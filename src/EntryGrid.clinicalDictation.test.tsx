import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { ChartSnapshot, ClinicalDictationKind, ClinicalDictationSource, PatientInfo } from './types';
import type { VoiceInputButton } from './components/VoiceInputButton';
import { applyAiActions } from './utils/aiAutofill';
import { localDateISO } from './utils/localDate';
import { sampleOwnerReportSnapshot } from './utils/ownerReportSample';
import { LocalizedError } from './utils/apiErrors';
import { DEFAULT_CHART_PREFS } from './utils/chartSettings';

type Control = { kind: ClinicalDictationKind; snapshot: ChartSnapshot; chartId?: string | null; chartSession?: number; readOnly?: boolean; aiEnabled?: boolean; disabled?: boolean; openRequest?: number | null; seededTranscript?: { text: string; language: string }; onApply: (changes: Partial<PatientInfo>, source: ClinicalDictationSource) => void; onOpenChange?: (open: boolean) => void };
const state = vi.hoisted(() => ({ controls: {} as Partial<Record<ClinicalDictationKind, Control>>, voice: null as React.ComponentProps<typeof VoiceInputButton> | null, refine: vi.fn(), reloadExamLayout: vi.fn(), aiEnabled: true, profileLoaded: true, gpExamEnabled: true, consultationEnabled: true, ownerReportEnabled: false }));
vi.mock('./components/ClinicalDictationButton', () => ({ ClinicalDictationButton: (props: Control) => {
  state.controls[props.kind] = props;
  if (props.openRequest !== undefined) return null;
  return <button type="button" aria-label={`Mock ${props.kind} dictation`} disabled={props.disabled || props.readOnly || !props.aiEnabled}>Dictate</button>;
} }));
vi.mock('./components/VoiceInputButton', async original => {
  const actual = await original<typeof import('./components/VoiceInputButton')>();
  return { ...actual, VoiceInputButton: (props: React.ComponentProps<typeof VoiceInputButton>) => { state.voice = props; return null; } };
});
vi.mock('./utils/radiologyReportAi', () => ({ draftRadiologyReport: state.refine }));
// Diagram geometry and PDF rendering are unrelated to the section/application glue.
vi.mock('./components/toothDiagram/parseSvg', () => ({ loadParsedDiagram: async () => ({subpaths:[],outlineD:'M 0 0 L 1 1'}) }));
vi.mock('./components/DocumentsModal', () => ({
  DocumentsModal: ({ open, initialTab, ownerReport }: { open: boolean; initialTab?: string; ownerReport?: { onEditWording: () => void } }) => open
    ? <div role="dialog" aria-label={`Mock document ${initialTab}`}>
        {ownerReport && <button type="button" onClick={ownerReport.onEditWording}>Edit the wording</button>}
      </div>
    : null,
}));

vi.mock('./native/aiConsent', () => ({ ensureAiConsent: async () => true }));
vi.mock('./utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));
vi.mock('./hooks/useExamLayout', async original => {
  const actual = await original<typeof import('./hooks/useExamLayout')>();
  return { ...actual, useExamLayout: (practiceId: string) => {
    const layout = actual.useExamLayout(practiceId);
    return { ...layout, reload: () => { state.reloadExamLayout(); layout.reload(); } };
  } };
});
vi.mock('./hooks/useProfile', async original => {
  const actual = await original<typeof import('./hooks/useProfile')>();
  return { ...actual, useProfile: () => ({ ...actual.useProfile(), loaded: state.profileLoaded, practiceKnown: state.profileLoaded, practiceId: 'practice-1', maxImages: 10, aiEnabled: state.aiEnabled, gpExamEnabled: state.gpExamEnabled, consultationEnabled: state.consultationEnabled, ownerReportEnabled: state.ownerReportEnabled }) };
});
const cloud = vi.hoisted(() => ({ enabled: true, status: 'saved', dirty: false, online: true, saveError: '', awaitingClinical: false,
  lastSavedAt: '', listCharts: vi.fn(async () => ({ rows: [], hasMore: false })), listPatientVisits: vi.fn(async (): Promise<{ id: string; patient_number: string; patient_name: string; chart_date: string; updated_at: string }[]> => []),
  openChart: vi.fn(async () => true), fetchChart: vi.fn(), deleteChart: vi.fn(), clearRecalls: vi.fn(),
  confirmDiscardIfDirty: vi.fn(async () => true), skipDuplicateCheckFor: vi.fn(), saveNow: vi.fn(async () => {}), signOut: vi.fn(), restoreRevision: vi.fn() }));
vi.mock('./hooks/useCloudSync', () => ({ useCloudSync: () => cloud }));
function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, String(value)); }, removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null, get length() { return values.size; } };
}
vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
import EntryGrid from './EntryGrid';
import { DialogHost } from './components/ui/dialogs';
const CHART_ID = '33333333-3333-4333-8333-333333333333';
const source = (overrides: Partial<ClinicalDictationSource> = {}): ClinicalDictationSource => ({ id: 'clinical-source-1', kind: 'dental-visit', language: 'en', transcript: 'Blood glucose 6.2 mmol/L. CT: possible fracture at 108.', recordedAt: '2026-11-18T15:00:00.000Z', fields: ['gpDiagnostics'], ...overrides });
const live = (kind: ClinicalDictationKind = 'dental-visit') => state.controls[kind]!;
const persisted = () => JSON.parse(localStorage.getItem('vibing-dental.chart.patientInfo.v1')!);
const storedSources = () => JSON.parse(localStorage.getItem('vibing-dental.chart.clinicalDictations.v1')!);
const mount = () => render(<><EntryGrid /><DialogHost /></>);
const openConsultation = () => {
  localStorage.setItem('vibing-dental.chart.patientInfo.v1', JSON.stringify({ ...persisted(), visitType: 'consultation' }));
  window.history.replaceState(null, '', `/#/chart/${CHART_ID}/consultation`);
};
const navigateSection = (section: string) => act(() => {
  window.history.replaceState(null, '', `/#/chart/${CHART_ID}/${section}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
});
beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia ?? ((media: string) => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {}; window.scrollTo = () => {};
});
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); state.controls = {}; state.voice = null; state.aiEnabled = true; state.profileLoaded = true; state.gpExamEnabled = true; state.consultationEnabled = true; state.ownerReportEnabled = false; cloud.enabled = true;
  cloud.dirty = false; cloud.awaitingClinical = false; cloud.status = 'saved'; cloud.saveNow.mockClear();
  cloud.fetchChart.mockReset().mockResolvedValue(sampleOwnerReportSnapshot());
  cloud.listPatientVisits.mockReset().mockResolvedValue([]);
  state.reloadExamLayout.mockClear();
  state.refine.mockReset().mockResolvedValue('Refined CT: possible fracture at 108.');
  localStorage.setItem('vibing-dental.onboarding.seen.v1', '1');
  localStorage.setItem('vibing-dental.chart.cloudId.v1', JSON.stringify(CHART_ID));
  localStorage.setItem('vibing-dental.chart.patientInfo.v1', JSON.stringify({ ...sampleOwnerReportSnapshot().patientInfo, patientName: 'Milo', patientNumber: '7', date: localDateISO(), radiologyReport: 'Independent X-ray report.', radiographicFindings: 'Independent X-ray findings.', ctReport: 'Existing CT context.' }));
  window.history.replaceState(null, '', `/#/chart/${CHART_ID}/gp-exam`);
});
it('uses one dental recorder from all dental sections and passes its complete transcript and language to the supplemental review', async () => {
  mount();
  for (const section of ['exam', 'anesthesia', 'charting', 'diagnosis', 'procedure', 'imaging', 'discharge']) {
    navigateSection(section);
    await waitFor(() => expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', section));
    expect(state.voice?.contextualDestination).toEqual({ label: 'Dictate dental visit' });
  }
  const transcript = 'CT: possible fracture at 108. Blood glucose 6.2 mmol/L.';
  act(() => state.voice?.onDictationComplete?.('fr', transcript));
  expect(live().openRequest).toEqual(expect.any(Number));
  expect(live().seededTranscript).toEqual({ text: transcript, language: 'fr' });
});

it('writes a batch of dental findings into multiple sections while viewing Imaging', async () => {
  mount();
  navigateSection('imaging');
  await waitFor(() => expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', 'imaging'));
  const actions = [
    { name: 'set_patient_field', input: { field: 'complaint', value: 'Difficulty chewing' } },
    { name: 'set_exam_finding', input: { area: 'tongue', status: 'abnormal', comment: 'Focal redness' } },
    { name: 'set_nerve_block', input: { site: 'infraorbitalRight', mL: '0.3' } },
    { name: 'set_anesthetic_drug', input: { drug: 'bupivacaine', concentration: '0.5' } },
    { name: 'set_tooth_field', input: { triadan: 108, field: 'pocket', value: 'D4' } },
    { name: 'add_comment', input: { diagram: 'pre', triadan: 108, text: 'Crown fracture' } },
    { name: 'set_tooth_mark', input: { diagram: 'post', triadan: 109, mark: 'extracted' } },
    { name: 'append_treatment_report', input: { text: 'Scaling completed.' } },
    { name: 'append_radiographic_findings', input: { text: '108: distal bone loss.' } },
  ];
  act(() => expect(applyAiActions(actions, state.voice!.handlers, 'en')).toHaveLength(actions.length));
  expect(persisted()).toMatchObject({
    complaint: 'Difficulty chewing',
    exam: { tongue: { status: 'abnormal', comment: 'Focal redness' } },
    nerveBlocks: { infraorbitalRight: '0.3', drugs: [{ name: 'bupivacaine', concentration: '0.5' }] },
    treatmentReport: expect.stringContaining('Scaling completed.'),
    radiographicFindings: expect.stringContaining('108: distal bone loss.'),
  });
  const read = (key: string) => JSON.parse(localStorage.getItem(`vibing-dental.chart.${key}.v1`)!);
  expect(read('toothData')).toEqual(expect.arrayContaining([expect.objectContaining({ triadan: 108, pocket: 'D4' })]));
  expect(read('preComments')).toEqual(expect.arrayContaining([expect.objectContaining({ anchorTriadan: 108, text: 'Crown fracture' })]));
  expect(read('postMarks')).toMatchObject({ 109: 'extracted' });
});

it('persists diagnostics, CT and discharge in the same dental visit, with transcript provenance', async () => {
  mount();
  const changes = { gpDiagnostics: 'Glucose 6.2 mmol/L', ctReport: 'CT: possible fracture at 108.',
    dischargeMedications: 'Recorded medication instructions', dischargeInstructions: 'Keep the wound dry', dischargeFollowUp: 'Recheck in 7 days' };
  const provenance = source({ fields: Object.keys(changes) as ClinicalDictationSource['fields'] });
  act(() => live().onApply(changes, provenance));
  await waitFor(() => expect(persisted()).toMatchObject(changes));
  expect(persisted().ctReportLanguage).toBe('en');
  expect(storedSources()).toEqual([provenance]);
  navigateSection('imaging');
  await waitFor(() => expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', 'imaging'));
  expect(screen.queryByRole('textbox', { name: 'Diagnostics' })).toBeNull();
  navigateSection('exam');
  expect(await screen.findByRole('textbox', { name: 'Diagnostics' })).toHaveValue(changes.gpDiagnostics);
});

it('does not allow the supplement to write standard dental fields or Consultation fields', async () => {
  mount();
  const previous = persisted();
  expect(() => act(() => live().onApply({ consultationAssessment: 'Unwanted' },
    source({ fields: ['consultationAssessment'] })))).toThrow(LocalizedError);
  expect(() => act(() => live().onApply({ complaint: 'Unwanted' }, source({ fields: ['complaint'] })))).toThrow(LocalizedError);
  expect(persisted()).toEqual(previous);
  expect(live().snapshot.clinicalDictations ?? []).toEqual([]);
});

it('rejects duplicate or overflowing sources before touching any supplemental fields', async () => {
  const sources = Array.from({ length: 20 }, (_, index) => source({ id: `source-${index}` }));
  localStorage.setItem('vibing-dental.chart.clinicalDictations.v1', JSON.stringify(sources));
  mount();
  const previous = persisted();
  expect(() => act(() => live().onApply({ gpDiagnostics: 'Unwanted' }, sources[0]))).toThrow(LocalizedError);
  expect(() => act(() => live().onApply({ gpDiagnostics: 'Unwanted' }, source()))).toThrow(LocalizedError);
  expect(persisted()).toEqual(previous);
  expect(storedSources()).toEqual(sources);
});

it('opens clinical history from a finalized patient visit', async () => {
  // Exercise the finalized-record entry point separately from the PDF bundle's cold import.
  await import('./components/PatientRecordHistory');
  localStorage.setItem('vibing-dental.chart.finalizedAt.v1', JSON.stringify('2026-11-18T12:00:00Z'));
  cloud.listPatientVisits.mockResolvedValue([{ id: 'prior', patient_number: '7', patient_name: 'Milo', chart_date: '2025-11-10', updated_at: '2025-11-10T00:00:00Z' }]);
  mount();
  navigateSection('patient');
  expect(document.querySelector('[data-section-id="patient"] [data-tour="patient-name"]')).toBeDisabled();
  fireEvent.click(await screen.findByRole('button', { name: 'View visit history' }));
  expect(await screen.findByRole('dialog', { name: /Historical patient records/ })).toBeVisible();
  expect(() => act(() => live().onApply({ gpDiagnostics: 'Unwanted' }, source()))).toThrow(LocalizedError);
});

it.each(['discharge', 'imaging'])('opens dental documents from %s', async section => {
  mount();
  navigateSection(section);
  await waitFor(() => expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', section));
  fireEvent.click(screen.getByRole('button', { name: 'Review and export' }));
  expect(await screen.findByRole('dialog', { name: /Mock document/ })).toBeVisible();
});

it('opens the separate Consultation workspace and its record note without mounting a dental diagram', async () => {
  openConsultation();
  mount();
  expect(document.querySelector('[data-section-id="consultation"]')).toBeVisible();
  expect(document.querySelector('[data-section-id="exam"]')).toBeNull();
  expect(document.querySelector('[data-section-id="gp-exam"]')).toBeNull();
  expect(live()).toBeUndefined();
  act(() => state.voice?.contextualDestination?.onOpen?.());
  expect(live('consultation').openRequest).toEqual(expect.any(Number));
  fireEvent.click(screen.getByRole('button', { name: 'Review clinical record' }));
  expect(await screen.findByRole('dialog', { name: 'Mock document note' })).toBeVisible();
});

it('shows editable objective fields and a visit image uploader with every consultation template', async () => {
  openConsultation();
  mount();
  const exam = await screen.findByRole('textbox', { name: 'Physical examination' });
  fireEvent.change(exam, { target: { value: 'Focal redness.' } });
  expect(persisted().gpPhysicalExam).toBe('Focal redness.');
  expect(screen.getByRole('textbox', { name: 'Vital signs' })).toHaveValue('');
  expect(screen.getByRole('textbox', { name: 'Diagnostics' })).toHaveValue('');
  expect(screen.getByRole('heading', { name: 'Images' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add images' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'General SOAP' }));
  expect(screen.getByRole('textbox', { name: 'Physical examination' })).toHaveValue('Focal redness.');
  expect(screen.getByRole('heading', { name: 'Images' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add images' })).toBeEnabled();
});

it('applies reviewed medication facts to the active consultation and keeps them through template changes', async () => {
  openConsultation();
  mount();
  const current = await screen.findByRole('textbox', { name: 'Current medications' });
  expect(current).toHaveValue('');
  const changes = {
    consultationCurrentMedications: 'The owner reports medicine A.',
    consultationAdministeredMedications: 'Medicine B was given.',
    consultationMedicationPlan: 'May stop medicine C.',
  };
  const transcript = Object.values(changes).join(' ');
  const fields = Object.keys(changes) as ClinicalDictationSource['fields'];
  act(() => live('consultation').onApply(changes, source({ kind: 'consultation', transcript, fields })));
  expect(storedSources()).toEqual([expect.objectContaining({ fields, transcript })]);
  fireEvent.click(screen.getByRole('button', { name: 'General SOAP' }));
  expect(screen.getByRole('textbox', { name: 'Current medications' })).toHaveValue(changes.consultationCurrentMedications);
  expect(screen.getByRole('textbox', { name: 'Medications given during this visit' })).toHaveValue(changes.consultationAdministeredMedications);
  expect(screen.getByRole('textbox', { name: 'Medication changes and prescriptions' })).toHaveValue(changes.consultationMedicationPlan);
});

it('finds the prior consultation and copies its reviewed list without copying prior decisions or replacing edits', async () => {
  openConsultation();
  const row = { id: 'medication-prior', practice_id: 'practice-1', patient_number: '7', patient_name: 'Milo',
    chart_date: '2025-10-10', updated_at: '2025-10-10T13:00:00Z', species: 'canine', visit_type: 'consultation' };
  cloud.listPatientVisits.mockResolvedValue([row]);
  const currentMedications = 'Owner reported Medication A.';
  const recordedChanges = 'Consider stopping Medication A after a recheck.';
  const previous = sampleOwnerReportSnapshot();
  previous.patientInfo = { ...previous.patientInfo, patientName: 'Milo', patientNumber: '7',
    visitType: 'consultation', date: row.chart_date, consultationCurrentMedications: currentMedications,
    consultationMedicationPlan: recordedChanges };
  cloud.fetchChart.mockResolvedValue(previous);
  mount();
  const input = await screen.findByRole('textbox', { name: 'Current medications' });
  const summary = await screen.findByText(/Previous medication list/);
  expect(cloud.fetchChart).toHaveBeenCalledWith(row.id, row.practice_id);
  expect(input).toHaveValue('');
  fireEvent.click(summary);
  expect(screen.getByText(recordedChanges)).toBeVisible();
  fireEvent.change(input, { target: { value: 'Medication B today.' } });
  expect(screen.queryByRole('button', { name: 'Copy to current medications' })).toBeNull();
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Copy to current medications' }));
  expect(input).toHaveValue(currentMedications);
  expect(screen.getByRole('textbox', { name: 'Medication changes and prescriptions' })).toHaveValue('');
});

it('keeps the Consultation record readable when the practice disables new consultations', async () => {
  openConsultation();
  const view = mount();
  const retained = live('consultation');
  state.consultationEnabled = false;
  view.rerender(<><EntryGrid /><DialogHost /></>);
  expect(document.querySelector('[data-section-id="consultation"]')).toBeVisible();
  expect(() => act(() => retained.onApply({ complaint: 'Unwanted' },
    source({ kind: 'consultation', fields: ['complaint'] })))).toThrow(LocalizedError);
});

it('falls back to Patient on retired GP and legacy Consultation links to a dental visit', async () => {
  mount();
  for (const section of ['gp-exam', 'consultation']) {
    navigateSection(section);
    await waitFor(() => expect(window.location.hash).toBe(`#/chart/${CHART_ID}/patient`));
    expect(document.querySelector(`[data-section-id="${section}"]`)).toBeNull();
  }
});

it.each(['ai', 'cloud'] as const)('rejects a retained dental supplement when %s access is removed', async gate => {
  const view = mount(), retained = live();
  if (gate === 'ai') state.aiEnabled = false; else cloud.enabled = false;
  view.rerender(<><EntryGrid /><DialogHost /></>);
  expect(() => act(() => retained.onApply({ gpDiagnostics: 'Unwanted' }, source()))).toThrow(LocalizedError);
  expect(persisted().gpDiagnostics).toBeUndefined();
});

it('hides clinical-record history without an earlier saved visit', async () => {
  mount();
  navigateSection('patient');
  await waitFor(() => expect(cloud.listPatientVisits).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'View visit history' })).not.toBeInTheDocument();
});

it.each([
  [true, 'Saving automatically…'],
  [false, 'Autosave is off. Save this visit to sync it to the cloud.'],
] as const)('reflects the save preference when autosave is %s', async (autosave, message) => {
  localStorage.setItem('vibing-dental.chart.prefs.v1', JSON.stringify({ ...DEFAULT_CHART_PREFS, autosave }));
  cloud.dirty = true;
  cloud.awaitingClinical = true;
  cloud.status = 'idle';
  mount();
  const tab = await screen.findByRole('tab', { selected: true });
  expect(within(tab).getByText('Not saved')).toHaveAttribute('title', message);
  expect(document.querySelector('.ui-toast')).toBeNull();
  if (autosave) {
    expect(screen.queryByRole('button', { name: 'Save now' })).toBeNull();
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Save now' }));
    expect(cloud.saveNow).toHaveBeenCalledOnce();
  }
});

it('jumps from Edit the wording to the owner report itself', async () => {
  state.ownerReportEnabled = true;
  mount();
  navigateSection('imaging');
  fireEvent.click(screen.getByRole('button', { name: 'Review and export' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Edit the wording' }));
  const editor = screen.getByRole('region', { name: 'Owner report' });
  await waitFor(() => expect(editor).toHaveFocus());
  expect(editor.closest('[data-section-id]')).toHaveAttribute('data-section-id', 'discharge');
});

it('starts a separate consultation for a new patient from the Patients dialog', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Open another animal' }));
  fireEvent.click(await screen.findByRole('button', { name: 'New patient' }));
  const chooser = await screen.findByRole('dialog', { name: 'New visit' });
  expect(within(chooser).getByRole('radio', { name: /Dental procedure/ })).toBeChecked();
  fireEvent.click(within(chooser).getByRole('radio', { name: /Consultation/ }));
  fireEvent.click(within(chooser).getByRole('button', { name: 'Start visit' }));
  expect(await screen.findByRole('button', { name: 'Review clinical record' })).toBeVisible();
  expect(persisted().visitType).toBe('consultation');
  expect(window.location.hash).toMatch(/^#\/chart\/[^/]+\/consultation$/);
});

it('applies reviewed awake oral findings and keeps them when the clinician switches templates', async () => {
  openConsultation();
  mount();
  const field = 'consultationCustom_awake-oral-exam';
  const text = 'Visible gingival redness on the awake exam.';
  expect(await screen.findByRole('textbox', { name: 'Awake oral examination' })).toHaveValue('');
  act(() => live('consultation').onApply({ [field]: text }, source({
    kind: 'consultation', transcript: text, fields: [field],
  })));
  expect(persisted()[field]).toBe(text);
  fireEvent.click(screen.getByRole('button', { name: 'General SOAP' }));
  fireEvent.click(screen.getByText('Fields from other templates'));
  expect(screen.getByRole('textbox', { name: 'Awake oral examination' })).toHaveValue(text);
  expect(() => act(() => live('consultation').onApply({ [field]: 'Stale change' }, source({
    kind: 'consultation', transcript: 'Stale change', fields: [field],
  })))).toThrow(LocalizedError);
  expect(persisted()[field]).toBe(text);
});

it('shows and applies custom Discharge fields with the Consult flag off', async () => {
  state.consultationEnabled = false;
  const id = '11111111-1111-4111-8111-111111111111';
  const field = 'dischargeCustom_activity';
  const text = 'Restrict activity as discussed.';
  localStorage.setItem('vibing-dental.chart.patientInfo.v1', JSON.stringify({
    ...persisted(), dischargeLayout: { id, name: 'Recovery', fields: [], sections: [{ id: field, label: 'Activity' }] },
  }));
  mount();
  navigateSection('discharge');
  expect(await screen.findByRole('button', { name: 'Manage templates' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Activity' })).toHaveValue('');
  act(() => state.voice?.onDictationComplete?.('en', text));
  expect(live().snapshot.version).toBe(5);
  act(() => live().onApply({ [field]: text }, source({ transcript: text, fields: [field] })));
  expect(screen.getByRole('textbox', { name: 'Activity' })).toHaveValue(text);
  fireEvent.click(screen.getByRole('button', { name: 'Standard discharge' }));
  const retained = screen.getByText('Fields from other templates').closest('details');
  expect(retained).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText('Fields from other templates'));
  expect(screen.getByRole('textbox', { name: 'Activity' })).toHaveValue(text);
});

it('opens the Imaging layout from Customize and keeps Imaging and PDF preferences accessible', async () => {
  mount();
  navigateSection('imaging');
  fireEvent.click(await screen.findByRole('button', { name: 'Customize' }));
  expect(screen.queryByRole('button', { name: 'Insert outline' })).toBeNull();
  const templates = await screen.findByRole('dialog', { name: 'Customize Imaging' });
  expect(within(templates).getByText('Radiographic report')).toBeVisible();
  expect(within(templates).getByText('CT report')).toBeVisible();
  fireEvent.click(within(templates).getByRole('button', { name: 'Imaging and PDF settings' }));
  expect(await screen.findByRole('dialog', { name: 'Chart settings' })).toBeVisible();
  expect(state.reloadExamLayout).toHaveBeenCalledOnce();
});

it('opens the Exam layout editor from the chart', async () => {
  mount();
  navigateSection('exam');
  expect(await screen.findByRole('textbox', { name: 'Diagnostics' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
  const settings = await screen.findByRole('dialog', { name: 'Chart settings' });
  expect(within(settings).getByRole('region', { name: 'Customize Exam' })).toBeVisible();
});
