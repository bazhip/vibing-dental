import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { ChartSnapshot, ClinicalDictationKind, ClinicalDictationSource, PatientInfo } from './types';
import type { VoiceInputButton } from './components/VoiceInputButton';
import { localDateISO } from './utils/localDate';
import { sampleOwnerReportSnapshot } from './utils/ownerReportSample';
import { LocalizedError } from './utils/apiErrors';

type Control = { kind: ClinicalDictationKind; snapshot: ChartSnapshot; chartId?: string | null; chartSession?: number; readOnly?: boolean; aiEnabled?: boolean; disabled?: boolean; onApply: (changes: Partial<PatientInfo>, source: ClinicalDictationSource) => void; onOpenChange?: (open: boolean) => void };
const state = vi.hoisted(() => ({ controls: {} as Partial<Record<ClinicalDictationKind, Control>>, voice: null as React.ComponentProps<typeof VoiceInputButton> | null, refine: vi.fn(), aiEnabled: true }));
vi.mock('./components/ClinicalDictationButton', () => ({ ClinicalDictationButton: (props: Control) => {
  state.controls[props.kind] = props;
  return <button type="button" aria-label={`Mock ${props.kind} dictation`} disabled={props.disabled || props.readOnly || !props.aiEnabled}>Dictate</button>;
} }));
vi.mock('./components/VoiceInputButton', async original => {
  const actual = await original<typeof import('./components/VoiceInputButton')>();
  return { ...actual, VoiceInputButton: (props: React.ComponentProps<typeof VoiceInputButton>) => { state.voice = props; return null; } };
});
vi.mock('./utils/radiologyReportAi', () => ({ draftRadiologyReport: state.refine }));
// Diagram geometry and PDF rendering are unrelated to the section/application glue.
vi.mock('./components/toothDiagram/parseSvg', () => ({ loadParsedDiagram: async () => ({subpaths:[],outlineD:'M 0 0 L 1 1'}) }));
vi.mock('./components/DocumentsModal', () => ({ DocumentsModal: ({initialTab}:{initialTab?:string}) => <div role="dialog" aria-label={`Mock document ${initialTab}`} /> }));

vi.mock('./native/aiConsent', () => ({ ensureAiConsent: async () => true }));
vi.mock('./utils/supabaseClient', () => ({ supabase: null, cloudEnabled: false }));
vi.mock('./hooks/useProfile', async original => {
  const actual = await original<typeof import('./hooks/useProfile')>();
  return { ...actual, useProfile: () => ({ ...actual.useProfile(), loaded: true, practiceKnown: true, aiEnabled: state.aiEnabled }) };
});
const cloud = vi.hoisted(() => ({ enabled: true, status: 'saved', dirty: false, online: true, saveError: '', awaitingClinical: false,
  lastSavedAt: '', listCharts: vi.fn(async () => ({ rows: [], hasMore: false })), listPatientVisits: vi.fn(async () => []),
  openChart: vi.fn(async () => true), fetchChart: vi.fn(), deleteChart: vi.fn(), clearRecalls: vi.fn(),
  confirmDiscardIfDirty: vi.fn(async () => true), skipDuplicateCheckFor: vi.fn(), saveNow: vi.fn(), signOut: vi.fn(), restoreRevision: vi.fn() }));
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
  localStorage.clear(); sessionStorage.clear(); state.controls = {}; state.voice = null; state.aiEnabled = true; cloud.enabled = true;
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
it('navigates to the GP examination through the sidebar with a clinical-record review action', async () => {
  mount(); await waitFor(() => expect(live()).toBeDefined());
  navigateSection('consultation');
  const nav = screen.getAllByRole('button').find(button => button.querySelector('.sidebar-layout__nav-label')?.textContent === 'GP examination');
  expect(nav).toBeDefined();fireEvent.click(nav!);
  await waitFor(() => expect(window.location.hash).toBe(`#/chart/${CHART_ID}/gp-exam`));
  const section = document.querySelector('[data-section-id="gp-exam"]') as HTMLElement;
  expect(section).toBeVisible(); expect(within(section).getByRole('button', { name: 'Review clinical record' })).toBeEnabled();
  expect(document.querySelector('.sidebar-layout__main')).toHaveAttribute('data-active-section', 'gp-exam');
  fireEvent.click(within(section).getByRole('button', {name:'Review clinical record'}));
  expect(await screen.findByRole('dialog',{name:'Mock document note'})).toBeVisible();

});
it('appends CT text and provenance, then automatically refines CT without changing X-ray sources', async () => {
  mount(); navigateSection('imaging'); await waitFor(() => expect(live('ct')).toBeDefined());
  const provenance = source({kind:'ct',fields:['ctReport'],language:'fr'});
  const appended = `${live('ct').snapshot.patientInfo.ctReport}\n108: possible fracture.`;
  act(() => live('ct').onApply({ctReport:appended,ctReportLanguage:'fr',ctReviewedBasis:''},provenance));
  await waitFor(() => expect(state.refine).toHaveBeenCalledOnce());
  expect(state.refine).toHaveBeenCalledWith(expect.objectContaining({patientInfo:expect.objectContaining({radiologyReport:appended})}),'fr','ct');
  await waitFor(() => expect(live('ct').snapshot.patientInfo.ctReport).toBe('Refined CT: possible fracture at 108.'));
  expect(live('ct').snapshot.patientInfo).toMatchObject({radiologyReport:'Independent X-ray report.',radiographicFindings:'Independent X-ray findings.',ctReportLanguage:'fr'});
  expect(live('ct').snapshot.clinicalDictations).toEqual([provenance]);expect(storedSources()).toEqual([provenance]);
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
