import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import type { ChartSnapshot, PatientInfo } from '../types';
const mocks = vi.hoisted(() => ({ generate: vi.fn(), consent: vi.fn(async () => true), copy: vi.fn(async () => 'plain'), pdf: vi.fn(async () => new Uint8Array([1])), save: vi.fn(async () => 'downloaded'), auth: null as null | ((event: string) => void) }));
vi.mock('../utils/radiologyReportAi', () => ({ draftRadiologyReport: mocks.generate }));
vi.mock('../native/aiConsent', () => ({ ensureAiConsent: mocks.consent }));
vi.mock('../utils/clipboard', () => ({ copyRichText: mocks.copy }));
vi.mock('../utils/textPdf', () => ({ renderClinicalTextPdf: mocks.pdf }));
vi.mock('../utils/savePdf', () => ({ savePdf: mocks.save }));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: (callback: (event: string) => void) => { mocks.auth = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } } }));
import { RadiologyReportSection } from './RadiologyReportSection';

function snapshot(): ChartSnapshot {
  const value = sampleOwnerReportSnapshot();
  return { ...value, patientInfo: { ...value.patientInfo, patientName: 'Milo', radiographicFindings: '108: 4.5 mm bone loss, distal root.' } };
}
function Editor({ initial = snapshot(), readOnly = false, changed = vi.fn() }: { initial?: ChartSnapshot; readOnly?: boolean; changed?: (value: Partial<PatientInfo>) => void }) {
  const [value, setValue] = React.useState(initial);
  return <RadiologyReportSection snapshot={value} chartId="chart" aiEnabled readOnly={readOnly} onChange={changes => { changed(changes); setValue(previous => ({ ...previous, patientInfo: { ...previous.patientInfo, ...changes } })); }} />;
}
beforeEach(() => { vi.clearAllMocks(); mocks.generate.mockResolvedValue('Recorded findings\n108: 4.5 mm bone loss.'); mocks.consent.mockResolvedValue(true); mocks.save.mockResolvedValue('downloaded'); });
afterEach(cleanup);
it('keeps recorded findings and existing report until a generated preview is explicitly used', async () => {
  const initial = snapshot(); initial.patientInfo.radiologyReport = 'Existing report';
  const changed = vi.fn(); render(<Editor initial={initial} changed={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));
  expect(await screen.findByLabelText('Generated draft')).toHaveValue('Recorded findings\n108: 4.5 mm bone loss.');
  expect(screen.getByLabelText('Report text')).toHaveValue('Existing report');
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Use draft' }));
  expect(screen.getByLabelText('Report text')).toHaveValue('Recorded findings\n108: 4.5 mm bone loss.');
  expect(changed).toHaveBeenCalledWith(expect.objectContaining({ radiologyReviewedBasis: '', radiologyReportLanguage: 'en' }));
  expect(changed.mock.calls.every(([change]) => !('radiographicFindings' in change))).toBe(true);
  expect(screen.getByRole('button', { name: 'Copy report' })).toBeDisabled();
});
it('requires current explicit review before copy and invalidates it on edits', async () => {
  const initial = snapshot(); initial.patientInfo.radiologyReport = 'Reviewed text';
  render(<Editor initial={initial} />);
  expect(screen.getByRole('button', { name: 'Copy report' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I reviewed this report against the current chart.'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
  await waitFor(() => expect(mocks.copy).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText('Report text'), { target: { value: 'Updated text' } });
  expect(screen.getByRole('button', { name: 'Copy report' })).toBeDisabled();
});
it('only generates once through pending consent and never calls AI after consent refusal', async () => {
  mocks.consent.mockResolvedValue(false); render(<Editor />);
  const button = screen.getByRole('button', { name: 'Generate draft' });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(mocks.consent).toHaveBeenCalledOnce());
  expect(mocks.generate).not.toHaveBeenCalled();
});
it.each(['chart', 'source', 'readOnly', 'auth'] as const)('discards a response after %s changes', async mode => {
  let resolve!: (value: string) => void;
  mocks.generate.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const value = snapshot(), changed = vi.fn();
  const view = render(<RadiologyReportSection snapshot={value} chartId="chart" aiEnabled onChange={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  if (mode === 'auth') act(() => mocks.auth?.('SIGNED_OUT'));
  else view.rerender(<RadiologyReportSection snapshot={mode === 'source' ? { ...value, patientInfo: { ...value.patientInfo, radiographicFindings: 'Changed findings' } } : value}
    chartId={mode === 'chart' ? 'other' : 'chart'} readOnly={mode === 'readOnly'} aiEnabled onChange={changed} />);
  await act(async () => { resolve('Stale report'); });
  expect(screen.queryByLabelText('Generated draft')).not.toBeInTheDocument(); expect(changed).not.toHaveBeenCalled();
});
it('preserves a report when preview is discarded and leaves export unsupported outcomes unsuccessful', async () => {
  const initial = snapshot(); initial.patientInfo.radiologyReport = 'Existing report';
  render(<Editor initial={initial} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate draft' }));
  await screen.findByLabelText('Generated draft'); fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
  expect(screen.getByLabelText('Report text')).toHaveValue('Existing report');
  fireEvent.click(screen.getByLabelText('I reviewed this report against the current chart.'));
  mocks.save.mockResolvedValueOnce('unsupported'); fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await screen.findByRole('alert'); expect(screen.queryByText('Report PDF downloaded.')).not.toBeInTheDocument();
});
it('allows manual editing offline but requires source facts and AI access to generate', () => {
  const value = snapshot(); value.patientInfo.radiographicFindings = ''; value.patientInfo.complaint = ''; value.toothData = []; value.preComments = []; value.postComments = [];
  render(<RadiologyReportSection snapshot={value} onChange={vi.fn()} aiEnabled={false} />);
  expect(screen.getByLabelText('Report text')).toBeEnabled(); expect(screen.getByRole('button', { name: 'Generate draft' })).toBeDisabled();
});
it('does not download a reviewed PDF rendered after the source changes', async () => {
  let resolve!: (value: Uint8Array<ArrayBuffer>)=>void;
  mocks.pdf.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const value=snapshot(); value.patientInfo.radiologyReport='Report';
  const {radiologySourceBasis,radiologyReviewBasis}=await import('../utils/radiologyReportState');
  value.patientInfo.radiologyReportLanguage='en';value.patientInfo.radiologyReportBasis=radiologySourceBasis(value);value.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(value,'en');
  const view=render(<RadiologyReportSection snapshot={value} chartId="chart" onChange={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Download PDF'}));await waitFor(()=>expect(mocks.pdf).toHaveBeenCalledOnce());
  view.rerender(<RadiologyReportSection snapshot={{...value,patientInfo:{...value.patientInfo,radiographicFindings:'New findings'}}} chartId="chart" onChange={vi.fn()}/>);
  await act(async()=>resolve(new Uint8Array([1])));expect(mocks.save).not.toHaveBeenCalled();
});
it('undo restores only replaced report fields and never overwrites new context',async()=>{
 const initial=snapshot();initial.patientInfo.radiologyReport='Existing report';
 render(<Editor initial={initial}/>);fireEvent.click(screen.getByRole('button',{name:'Generate draft'}));
 await screen.findByLabelText('Generated draft');fireEvent.click(screen.getByRole('button',{name:'Use draft'}));
 fireEvent.click(screen.getByRole('button',{name:'Undo replacement'}));expect(screen.getByLabelText('Report text')).toHaveValue('Existing report');
});
it('source changes invalidate the current reviewed marker without deleting report text',async()=>{
 const value=snapshot();value.patientInfo.radiologyReport='Report';value.patientInfo.radiologyReportLanguage='en';
 const {radiologySourceBasis,radiologyReviewBasis}=await import('../utils/radiologyReportState');
 value.patientInfo.radiologyReportBasis=radiologySourceBasis(value);value.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(value,'en');
 const view=render(<RadiologyReportSection snapshot={value} chartId="chart" onChange={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'Copy report'})).toBeEnabled();
 view.rerender(<RadiologyReportSection snapshot={{...value,patientInfo:{...value.patientInfo,radiologyQuestion:'Updated question'}}} chartId="chart" onChange={vi.fn()}/>);
 expect(screen.getByRole('button',{name:'Copy report'})).toBeDisabled();expect(screen.getByLabelText('Report text')).toHaveValue('Report');
});
it('invalidates a reviewed report when its language changes while preserving the text',async()=>{
 const value=snapshot();value.patientInfo.radiologyReport='English report';value.patientInfo.radiologyReportLanguage='en';
 const {radiologySourceBasis,radiologyReviewBasis}=await import('../utils/radiologyReportState');
 value.patientInfo.radiologyReportBasis=radiologySourceBasis(value);value.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(value,'en');
 render(<Editor initial={value}/>);expect(screen.getByRole('button',{name:'Copy report'})).toBeEnabled();
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'fr'}});
 expect(screen.getByRole('button',{name:'Copy report'})).toBeDisabled();expect(screen.getByRole('button',{name:'Download PDF'})).toBeDisabled();
 expect(screen.getByLabelText('Report text')).toHaveValue('English report');
});
it('clears previous-account error details on an authentication transition',async()=>{
 mocks.generate.mockRejectedValueOnce(new TypeError());render(<Editor/>);
 fireEvent.click(screen.getByRole('button',{name:'Generate draft'}));await screen.findByRole('alert');
 act(()=>mocks.auth?.('SIGNED_OUT'));expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it.each(['chartSession','body','readOnly','aiEnabled'] as const)('does not call AI after deferred consent if %s changes',async mode=>{
 let resolve!:(value:boolean)=>void;mocks.consent.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const value=snapshot(),changed=vi.fn();const view=render(<RadiologyReportSection snapshot={value} chartId="chart" chartSession={1} aiEnabled onChange={changed}/>);
 fireEvent.click(screen.getByRole('button',{name:'Generate draft'}));await waitFor(()=>expect(mocks.consent).toHaveBeenCalledOnce());
 view.rerender(<RadiologyReportSection snapshot={mode==='body'?{...value,patientInfo:{...value.patientInfo,radiologyReport:'New manual report'}}:value} chartId="chart" chartSession={mode==='chartSession'?2:1} aiEnabled={mode!=='aiEnabled'} readOnly={mode==='readOnly'} onChange={changed}/>);
 await act(async()=>resolve(true));expect(mocks.generate).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();
});
it('does not download a reviewed PDF after auth changes during rendering',async()=>{
 let resolve!:(value:Uint8Array<ArrayBuffer>)=>void;mocks.pdf.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const value=snapshot();value.patientInfo.radiologyReport='Report';value.patientInfo.radiologyReportLanguage='en';
 const {radiologySourceBasis,radiologyReviewBasis}=await import('../utils/radiologyReportState');
 value.patientInfo.radiologyReportBasis=radiologySourceBasis(value);value.patientInfo.radiologyReviewedBasis=radiologyReviewBasis(value,'en');
 render(<RadiologyReportSection snapshot={value} chartId="chart" onChange={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Download PDF'}));await waitFor(()=>expect(mocks.pdf).toHaveBeenCalledOnce());
 act(()=>mocks.auth?.('SIGNED_OUT'));await act(async()=>resolve(new Uint8Array([1])));expect(mocks.save).not.toHaveBeenCalled();
});
it.each(['source','readOnly'] as const)('does not revive a pending generation after %s changes and is restored',async mode=>{
 let resolve!:(value:string)=>void;mocks.generate.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const value=snapshot(),changed=vi.fn();const view=render(<RadiologyReportSection snapshot={value} chartId="chart" aiEnabled onChange={changed}/>);
 fireEvent.click(screen.getByRole('button',{name:'Generate draft'}));await waitFor(()=>expect(mocks.generate).toHaveBeenCalledOnce());
 view.rerender(<RadiologyReportSection snapshot={mode==='source'?{...value,patientInfo:{...value.patientInfo,radiographicFindings:'Different'}}:value} chartId="chart" aiEnabled readOnly={mode==='readOnly'} onChange={changed}/>);
 view.rerender(<RadiologyReportSection snapshot={value} chartId="chart" aiEnabled onChange={changed}/>);
 await act(async()=>resolve('Old request'));expect(screen.queryByLabelText('Generated draft')).not.toBeInTheDocument();
});

it('edits the primary findings input and generates with all study context blank', async () => {
 const initial=snapshot();Object.assign(initial.patientInfo,{radiologyHistory:'',radiologyTechnique:'',radiologyQuestion:'',complaint:''});
 const changed=vi.fn();render(<Editor initial={initial} changed={changed}/>);
 const findings=screen.getByRole('textbox',{name:'Radiographic findings'});
 expect(findings.closest('.radiographic-findings')).not.toBeNull();
 expect(findings).toHaveClass('radiographic-findings__text');
 fireEvent.change(findings,{target:{value:'409: approximately 30% horizontal bone loss.'}});
 expect(changed).toHaveBeenCalledWith(expect.objectContaining({radiographicFindings:'409: approximately 30% horizontal bone loss.',radiologyReviewedBasis:''}));
 expect(screen.getByText('Optional study context').closest('details')).not.toHaveAttribute('open');
 expect(screen.getByLabelText('Report text').closest('details')).not.toHaveAttribute('open');
 fireEvent.click(screen.getByRole('button',{name:'Generate draft'}));
 await screen.findByLabelText('Generated draft');
 expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({patientInfo:expect.objectContaining({radiographicFindings:'409: approximately 30% horizontal bone loss.',radiologyTechnique:'',radiologyQuestion:''})}),'en');
});
it('lets a clinician open the manual editor without AI access and keeps findings read-only when locked', () => {
 const value=snapshot();const view=render(<RadiologyReportSection snapshot={value} aiEnabled={false} onChange={vi.fn()}/>);
 fireEvent.click(screen.getByText('Write report manually'));
 expect(screen.getByLabelText('Report text').closest('details')).toHaveAttribute('open');
 view.rerender(<RadiologyReportSection snapshot={value} readOnly onChange={vi.fn()}/>);
 expect(screen.getByRole('textbox',{name:'Radiographic findings'})).toBeDisabled();
});
it('cannot generate a radiograph report from history and a question alone', () => {
 const initial=snapshot();Object.assign(initial.patientInfo,{radiographicFindings:' ',radiologyHistory:'Pain chewing',radiologyQuestion:'Assess 409'});
 render(<Editor initial={initial}/>);
 expect(screen.getByRole('button',{name:'Generate draft'})).toBeDisabled();
});

it('keeps the manual editor open when its last character is cleared', () => {
 render(<Editor/>);
 fireEvent.click(screen.getByText('Write report manually'));
 const editor=screen.getByLabelText('Report text');
 fireEvent.change(editor,{target:{value:'A'}});
 fireEvent.change(editor,{target:{value:''}});
 expect(editor.closest('details')).toHaveAttribute('open');
});
