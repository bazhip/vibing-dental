import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { ChartSnapshot, ClinicalDictationKind, ClinicalDictationSource, PatientInfo } from './types';
import type { VoiceInputButton } from './components/VoiceInputButton';
import { localDateISO } from './utils/localDate';
import { sampleOwnerReportSnapshot } from './utils/ownerReportSample';
import { LocalizedError } from './utils/apiErrors';
import { DEFAULT_CHART_PREFS } from './utils/chartSettings';

type Control = { kind: ClinicalDictationKind; snapshot: ChartSnapshot; chartId?: string | null; chartSession?: number; readOnly?: boolean; aiEnabled?: boolean; disabled?: boolean; openRequest?: number | null; imagingFocus?: 'ctReport' | 'radiographicFindings'; onApply: (changes: Partial<PatientInfo>, source: ClinicalDictationSource) => void; onOpenChange?: (open: boolean) => void };
const state = vi.hoisted(() => ({ controls: {} as Partial<Record<ClinicalDictationKind, Control>>, voice: null as React.ComponentProps<typeof VoiceInputButton> | null, refine: vi.fn(), aiEnabled: true, profileLoaded: true, gpExamEnabled: true, consultationEnabled: true, ownerReportEnabled: false }));
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
vi.mock('./hooks/useProfile', async original => {
  const actual = await original<typeof import('./hooks/useProfile')>();
  return { ...actual, useProfile: () => ({ ...actual.useProfile(), loaded: state.profileLoaded, practiceKnown: state.profileLoaded, aiEnabled: state.aiEnabled, gpExamEnabled: state.gpExamEnabled, consultationEnabled: state.consultationEnabled, ownerReportEnabled: state.ownerReportEnabled }) };
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
const source = (overrides: Partial<ClinicalDictationSource> = {}): ClinicalDictationSource => ({ id: 'clinical-source-1', kind: 'gp-visit', language: 'en', transcript: 'Weight 4.2 kg. Possible fracture at 108.', recordedAt: '2026-11-18T15:00:00.000Z', fields: ['gpVitals'], ...overrides });
const live = (kind: ClinicalDictationKind = 'gp-visit') => state.controls[kind]!;
const persisted = () => JSON.parse(localStorage.getItem('vibing-dental.chart.patientInfo.v1')!);
const storedSources = () => JSON.parse(localStorage.getItem('vibing-dental.chart.clinicalDictations.v1')!);
const mount = () => render(<><EntryGrid /><DialogHost /></>);
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
  state.refine.mockReset().mockResolvedValue('Refined CT: possible fracture at 108.');
  localStorage.setItem('vibing-dental.onboarding.seen.v1', '1');
  localStorage.setItem('vibing-dental.chart.cloudId.v1', JSON.stringify(CHART_ID));
  localStorage.setItem('vibing-dental.chart.patientInfo.v1', JSON.stringify({ ...sampleOwnerReportSnapshot().patientInfo, patientName: 'Milo', patientNumber: '7', date: localDateISO(), radiologyReport: 'Independent X-ray report.', radiographicFindings: 'Independent X-ray findings.', ctReport: 'Existing CT context.' }));
  window.history.replaceState(null, '', `/#/chart/${CHART_ID}/gp-exam`);
});
it('applies all eleven GP clinical fields and persists transcript provenance with the actual chart', async () => {
  mount(); await waitFor(() => expect(live()).toBeDefined());
  const changes = { complaint: 'Vomiting', consultationHistory: 'Less appetite for 2 days', consultationAssessment: 'Possible gastritis', consultationPlan: 'Abdominal ultrasound planned', gpVitals: 'Weight 4.2 kg', gpPhysicalExam: 'Heart sounds normal', gpDiagnostics: 'Glucose 6.2 mmol/L', treatmentReport: 'Wound irrigated', dischargeMedications: 'Amoxicillin 50 mg PO twice daily for 5 days', dischargeInstructions: 'Keep the wound dry', dischargeFollowUp: 'Recheck in 7 days' };
  const provenance = source({ fields: Object.keys(changes) as ClinicalDictationSource['fields'] });
  act(() => live().onApply(changes, provenance));
  await waitFor(() => expect(live().snapshot.patientInfo).toMatchObject(changes));
  expect(persisted()).toMatchObject(changes); expect(live().snapshot.clinicalDictations).toEqual([provenance]); expect(storedSources()).toEqual([provenance]);
  expect(screen.getByLabelText('Vital signs')).toHaveValue(changes.gpVitals);
  expect(state.refine).not.toHaveBeenCalled();
});
it('opens clinical history from Patient information on a finalized chart', async () => {
  localStorage.setItem('vibing-dental.chart.finalizedAt.v1', JSON.stringify('2026-11-18T12:00:00Z'));
  cloud.listPatientVisits.mockResolvedValue([{ id: 'prior', patient_number: '7', patient_name: 'Milo', chart_date: '2025-11-10', updated_at: '2025-11-10T00:00:00Z' }]);
  mount(); await waitFor(() => expect(live()).toBeDefined());
  navigateSection('consultation');
  const nav = screen.getAllByRole('button').find(button => button.querySelector('.sidebar-layout__nav-label')?.textContent === 'GP examination');
  expect(nav).toBeDefined();fireEvent.click(nav!);
  await waitFor(() => expect(window.location.hash).toBe(`#/chart/${CHART_ID}/gp-exam`));
  const section = document.querySelector('[data-section-id="gp-exam"]') as HTMLElement;
  expect(section).toBeVisible(); expect(within(section).queryByRole('button', { name: 'View visit history' })).not.toBeInTheDocument();
  expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', 'gp-exam');
  navigateSection('patient');
  expect(document.querySelector('[data-section-id="patient"] [data-tour="patient-name"]')).toBeDisabled();
  fireEvent.click(await screen.findByRole('button', { name: 'View visit history' }));
  expect(await screen.findByRole('dialog',{name:/Historical patient records/})).toBeVisible();

});
it.each(['discharge', 'imaging'])('opens visit documents from %s', async section => {
  mount();
  navigateSection(section);
  await waitFor(() => expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', section));
  fireEvent.click(screen.getByRole('button', { name: 'Review and export' }));
  expect(await screen.findByRole('dialog', { name: /Mock document/ })).toBeVisible();
});

it('opens dictation according to the active section', async () => {
  mount();
  navigateSection('imaging');
  await waitFor(() => expect(state.voice?.contextualDestination?.label).toBe('Imaging'));
  fireEvent.focus(screen.getByRole('textbox', { name: 'CT report' }));
  act(() => state.voice?.contextualDestination?.onOpen?.());
  expect(live('imaging').imagingFocus).toBe('ctReport');
  expect(live('imaging').openRequest).toEqual(expect.any(Number));
  expect(live('discharge').openRequest).toBeNull();

  navigateSection('discharge');
  await waitFor(() => expect(state.voice?.contextualDestination?.label).toBe('Discharge'));
  act(() => state.voice?.contextualDestination?.onOpen?.());
  expect(live('imaging').openRequest).toBeNull();
  expect(live('discharge').openRequest).toEqual(expect.any(Number));
});

it('refines the proposed CT and radiographic reports independently', async () => {
  mount();
  navigateSection('imaging');
  await waitFor(() => expect(live('imaging')).toBeDefined());
  const provenance = source({ kind: 'imaging', fields: ['ctReport', 'radiographicFindings'], language: 'fr' });
  const ctReport = 'Existing CT context. 108: possible fracture.';
  const radiographicFindings = 'Independent X-ray findings. 307: tooth resorption.';
  act(() => live('imaging').onApply({ ctReport, radiographicFindings }, provenance));
  await waitFor(() => expect(state.refine).toHaveBeenCalledTimes(2));
  expect(state.refine).toHaveBeenCalledWith(expect.objectContaining({ patientInfo: expect.objectContaining({ radiologyReport: ctReport }) }), 'fr', 'ct');
  expect(state.refine).toHaveBeenCalledWith(expect.objectContaining({ patientInfo: expect.objectContaining({ radiologyReport: radiographicFindings }) }), 'fr');
  expect(storedSources()).toEqual([provenance]);
});
it('rejects a duplicate source before changing any clinical field', async () => {
  mount(); await waitFor(() => expect(live()).toBeDefined());
  const provenance = source();act(() => live().onApply({gpVitals:'4.2 kg'},provenance));
  await waitFor(() => expect(live().snapshot.patientInfo.gpVitals).toBe('4.2 kg'));
  expect(() => act(() => live().onApply({gpVitals:'999 kg'},provenance))).toThrow(LocalizedError);
  expect(live().snapshot.patientInfo.gpVitals).toBe('4.2 kg');expect(persisted().gpVitals).toBe('4.2 kg');expect(storedSources()).toEqual([provenance]);
});
it('rejects source storage overflow before applying any proposed values', async () => {
  const sources = Array.from({length:20},(_,index)=>source({id:`source-${index}`}));
  localStorage.setItem('vibing-dental.chart.clinicalDictations.v1',JSON.stringify(sources));
  mount();await waitFor(()=>expect(live()).toBeDefined());const previous=live().snapshot.patientInfo;
  expect(()=>act(()=>live().onApply({gpVitals:'999 kg',consultationAssessment:'Unwanted assessment'},source()))).toThrow(LocalizedError);
  expect(live().snapshot.patientInfo).toEqual(previous);expect(storedSources()).toEqual(sources);
});
it('rejects patch fields outside the source kind before changing fields or sources', async () => {
  mount();await waitFor(()=>expect(live('consultation')).toBeDefined());const previous=live().snapshot.patientInfo;
  expect(()=>act(()=>live('consultation').onApply({gpVitals:'999 kg'},source({kind:'consultation',fields:['gpVitals']})))).toThrow(LocalizedError);
  expect(live().snapshot.patientInfo).toEqual(previous);expect(live().snapshot.clinicalDictations??[]).toEqual([]);
});
it('blocks root application when an existing visit is read only', async () => {
  localStorage.setItem('vibing-dental.chart.openedExisting.v1','true');
  localStorage.setItem('vibing-dental.chart.finalizedAt.v1', JSON.stringify('2026-11-18T12:00:00Z'));
  const info=persisted();info.date='2020-01-01';localStorage.setItem('vibing-dental.chart.patientInfo.v1',JSON.stringify(info));
  mount();await waitFor(()=>expect(live()?.readOnly).toBe(true));const previous=live().snapshot.patientInfo;
  expect(()=>act(()=>live().onApply({gpVitals:'999 kg'},source()))).toThrow(LocalizedError);
  expect(live().snapshot.patientInfo).toEqual(previous);expect(live().snapshot.clinicalDictations??[]).toEqual([]);
});
it.each(['ai','cloud'] as const)('hides clinical controls and rejects retained callbacks when %s access is removed',async gate=>{
  const view=mount();await waitFor(()=>expect(live()).toBeDefined());
  const retained=live(), previous=retained.snapshot.patientInfo;
  if(gate==='ai') state.aiEnabled=false;else cloud.enabled=false;
  view.rerender(<><EntryGrid/><DialogHost/></>);
  expect(screen.queryByRole('button',{name:'Mock gp-visit dictation',hidden:true})).toBeNull();
  expect(()=>act(()=>retained.onApply({gpVitals:'999 kg'},source()))).toThrow(LocalizedError);
  expect(persisted()).toEqual(previous);
});

it.each(['gp-exam', 'consultation'] as const)('preserves an enabled %s deep link while the practice loads', async (section) => {
  state.profileLoaded = false;
  state.gpExamEnabled = false;
  state.consultationEnabled = false;
  const hash = `#/chart/${CHART_ID}/${section}`;
  window.history.replaceState(null, '', hash);
  const view = mount();
  expect(document.querySelector(`[data-section-id="${section}"]`)).toBeNull();
  expect(window.location.hash).toBe(hash);
  state.profileLoaded = true;
  state.gpExamEnabled = true;
  state.consultationEnabled = true;
  view.rerender(<><EntryGrid /><DialogHost /></>);
  await waitFor(() => expect(document.querySelector(`[data-section-id="${section}"]`)).toBeVisible());
  expect(window.location.hash).toBe(hash);
});

it('canonicalizes a pending GP link to Patient once the loaded flag is disabled', async () => {
  state.profileLoaded = false;
  state.gpExamEnabled = false;
  const view = mount();
  expect(window.location.hash).toBe(`#/chart/${CHART_ID}/gp-exam`);
  state.profileLoaded = true;
  view.rerender(<><EntryGrid /><DialogHost /></>);
  await waitFor(() => expect(window.location.hash).toBe(`#/chart/${CHART_ID}/patient`));
  expect(document.querySelector('[data-section-id="gp-exam"]')).toBeNull();
});

it('hides GP exam and falls back to Patient when a disabled practice opens a GP link', async () => {
  state.gpExamEnabled = false;
  mount();
  await waitFor(() => expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', 'patient'));
  expect(screen.queryByRole('button', { name: /GP examination/ })).not.toBeInTheDocument();
  expect(document.querySelector('[data-section-id="gp-exam"]')).toBeNull();
  navigateSection('consultation');
  await waitFor(() => expect(live('consultation')).toBeDefined());
  expect(() => act(() => live('consultation').onApply({ gpVitals: '4 kg' }, source()))).toThrow(LocalizedError);
  expect(persisted().gpVitals).toBeUndefined();
});

it('hides Consultation and falls back to Patient for a disabled practice', async () => {
  state.consultationEnabled = false;
  window.history.replaceState(null, '', `/#/chart/${CHART_ID}/consultation`);
  mount();
  await waitFor(() => expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', 'patient'));
  expect(document.querySelector('[data-section-id="consultation"]')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Consultation$/ })).not.toBeInTheDocument();
  expect(window.location.hash).toMatch(/\/patient$/);
  navigateSection('gp-exam');
  await waitFor(() => expect(live()).toBeDefined());
  expect(() => act(() => live().onApply({ consultationAssessment: 'Unwanted' }, source({ fields: ['consultationAssessment'] })))).toThrow(LocalizedError);
  act(() => live().onApply({ complaint: 'Reduced appetite' }, source({ fields: ['complaint'] })));
  expect(persisted()).toMatchObject({ complaint: 'Reduced appetite' });
});

it('rejects retained Consultation dictation when the practice disables the feature', async () => {
  const view = mount();
  navigateSection('consultation');
  await waitFor(() => expect(document.querySelector('[data-section-id="consultation"]')).toBeVisible());
  const retained = live('consultation');
  state.consultationEnabled = false;
  view.rerender(<><EntryGrid /><DialogHost /></>);
  expect(document.querySelector('[data-section-id="consultation"]')).toBeNull();
  expect(() => act(() => retained.onApply({ complaint: 'Unwanted' }, source({ kind: 'consultation', fields: ['complaint'] })))).toThrow(LocalizedError);
});

it('hides clinical-record review without an earlier saved visit', async () => {
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
