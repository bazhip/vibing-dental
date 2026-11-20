import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
it('shows one free-text editor with study prompts and refines in place with Undo', async () => {
  const initial = snapshot(); initial.patientInfo.radiologyReport = '108: possible fracture, 4.5 mm lucency';
  render(<Editor initial={initial} />);
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  const editor = screen.getByRole('textbox', { name: 'Report text' });
  expect(editor).toHaveAttribute('placeholder', expect.stringMatching(/history[\s\S]*technique[\s\S]*findings/i));
  expect(editor).toHaveAccessibleDescription(/Type or dictate/);
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' }));
  await waitFor(() => expect(editor).toHaveValue('Recorded findings\n108: 4.5 mm bone loss.'));
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Copy report' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Undo refinement' }));
  expect(editor).toHaveValue('108: possible fracture, 4.5 mm lucency');
});
it('preserves legacy findings/context, but an explicitly cleared report stays empty', () => {
  const value = snapshot(); value.patientInfo.radiologyTechnique = 'Two recorded intraoral views';
  render(<Editor initial={value} />);
  const editor = screen.getByLabelText('Report text');
  expect((editor as HTMLTextAreaElement).value).toContain('Two recorded intraoral views');
  fireEvent.change(editor, { target: { value: '' } });
  expect(editor).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Refine with AI' })).toBeDisabled();
});
it('requires current explicit review before copy and invalidates it on edits', async () => {
  const initial = snapshot(); initial.patientInfo.radiologyReport = 'Reviewed text';
  render(<Editor initial={initial} />);
  fireEvent.click(screen.getByLabelText('I reviewed this report against the current chart.'));
  fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
  await waitFor(() => expect(mocks.copy).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText('Report text'), { target: { value: 'Updated text' } });
  expect(screen.getByRole('button', { name: 'Copy report' })).toBeDisabled();
});
it('allows recorded legacy text to be reviewed without typing it again', async () => {
  render(<Editor />);
  fireEvent.click(screen.getByLabelText('I reviewed this report against the current chart.'));
  expect(screen.getByRole('button', { name: 'Copy report' })).toBeEnabled();
});
it('only refines once through pending consent and never calls AI after consent refusal', async () => {
  mocks.consent.mockResolvedValue(false); render(<Editor />);
  const button = screen.getByRole('button', { name: 'Refine with AI' });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(mocks.consent).toHaveBeenCalledOnce());
  expect(mocks.generate).not.toHaveBeenCalled();
});
it.each(['chart', 'chartSession', 'source', 'body', 'readOnly', 'aiEnabled', 'auth'] as const)('drops refinement after %s changes', async mode => {
  let resolve!: (value: string) => void;
  mocks.generate.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const value = snapshot(), changed = vi.fn();
  const view = render(<RadiologyReportSection snapshot={value} chartId="chart" chartSession={1} aiEnabled onChange={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  if (mode === 'auth') act(() => mocks.auth?.('SIGNED_OUT'));
  else view.rerender(<RadiologyReportSection snapshot={mode === 'source' ? { ...value, patientInfo: { ...value.patientInfo, radiographicFindings: 'Changed findings' } } : mode === 'body' ? { ...value, patientInfo: { ...value.patientInfo, radiologyReport: 'New manual text' } } : value}
    chartId={mode === 'chart' ? 'other' : 'chart'} chartSession={mode === 'chartSession' ? 2 : 1} readOnly={mode === 'readOnly'} aiEnabled={mode !== 'aiEnabled'} onChange={changed} />);
  await act(async () => { resolve('Stale report'); });
  expect(changed).not.toHaveBeenCalled();
});
it.each(['chartSession', 'body', 'readOnly', 'aiEnabled'] as const)('does not call AI after deferred consent if %s changes', async mode => {
  let resolve!: (value: boolean) => void;
  mocks.consent.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const value = snapshot(), changed = vi.fn();
  const view = render(<RadiologyReportSection snapshot={value} chartId="chart" chartSession={1} aiEnabled onChange={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' }));
  await waitFor(() => expect(mocks.consent).toHaveBeenCalledOnce());
  view.rerender(<RadiologyReportSection snapshot={mode === 'body' ? { ...value, patientInfo: { ...value.patientInfo, radiologyReport: 'New manual report' } } : value}
    chartId="chart" chartSession={mode === 'chartSession' ? 2 : 1} aiEnabled={mode !== 'aiEnabled'} readOnly={mode === 'readOnly'} onChange={changed} />);
  await act(async () => resolve(true));
  expect(mocks.generate).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
});
it.each(['source', 'readOnly'] as const)('does not revive a pending refinement after %s changes and is restored', async mode => {
  let resolve!: (value: string) => void;
  mocks.generate.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const value = snapshot(), changed = vi.fn();
  const view = render(<RadiologyReportSection snapshot={value} chartId="chart" aiEnabled onChange={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' }));
  await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  view.rerender(<RadiologyReportSection snapshot={mode === 'source' ? { ...value, patientInfo: { ...value.patientInfo, radiographicFindings: 'Different' } } : value} chartId="chart" aiEnabled readOnly={mode === 'readOnly'} onChange={changed} />);
  view.rerender(<RadiologyReportSection snapshot={value} chartId="chart" aiEnabled onChange={changed} />);
  await act(async () => resolve('Old request')); expect(changed).not.toHaveBeenCalled();
});
it('keeps the text after an error, and clears error details when the account changes', async () => {
  mocks.generate.mockRejectedValueOnce(new TypeError()); render(<Editor />);
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Report text')).toHaveValue('108: 4.5 mm bone loss, distal root.');
  act(() => mocks.auth?.('SIGNED_OUT')); expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('keeps manual editing available without AI and locks the editor for saved read-only visits', () => {
  const value = snapshot(); value.patientInfo.radiographicFindings = '';
  const view = render(<RadiologyReportSection snapshot={value} onChange={vi.fn()} />);
  expect(screen.getByLabelText('Report text')).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Refine with AI' })).toBeDisabled();
  view.rerender(<RadiologyReportSection snapshot={value} readOnly onChange={vi.fn()} />);
  expect(screen.getByLabelText('Report text')).toBeDisabled();
});
it('shows the Customize tip for a non-English preference and applies it on refinement', async () => {
  const value = snapshot(); value.patientInfo.radiologyReport = 'Report'; value.patientInfo.radiologyReportLanguage = 'en';
  const customize = vi.fn(), change = vi.fn();
  render(<RadiologyReportSection snapshot={value} aiEnabled preferredLanguage="fr" onCustomizeLanguage={customize} onChange={change} />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'AI writes in Français. Change it in Customize.' }));
  expect(customize).toHaveBeenCalledOnce();
  const refine = screen.getByRole('button', { name: 'Refine with AI' });
  expect(refine.compareDocumentPosition(screen.getByLabelText('Report text')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(refine);
  await waitFor(() => expect(change).toHaveBeenCalledWith(expect.objectContaining({ radiologyReportLanguage: 'fr', radiologyReviewedBasis: '' })));
  expect(mocks.generate).toHaveBeenCalledWith(expect.anything(), 'fr');
});

it.each(['source', 'auth'] as const)('does not save a PDF after %s changes during rendering', async mode => {
  let resolve!: (value: Uint8Array<ArrayBuffer>) => void;
  mocks.pdf.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const value = snapshot(); value.patientInfo.radiologyReport = 'Report'; value.patientInfo.radiologyReportLanguage = 'en';
  const { radiologySourceBasis, radiologyReviewBasis } = await import('../utils/radiologyReportState');
  value.patientInfo.radiologyReportBasis = radiologySourceBasis(value); value.patientInfo.radiologyReviewedBasis = radiologyReviewBasis(value, 'en');
  const view = render(<RadiologyReportSection snapshot={value} chartId="chart" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() => expect(mocks.pdf).toHaveBeenCalledOnce());
  if (mode === 'auth') act(() => mocks.auth?.('SIGNED_OUT'));
  else view.rerender(<RadiologyReportSection snapshot={{ ...value, patientInfo: { ...value.patientInfo, radiographicFindings: 'New findings' } }} chartId="chart" onChange={vi.fn()} />);
  await act(async () => resolve(new Uint8Array([1]))); expect(mocks.save).not.toHaveBeenCalled();
});
it('does not claim success for an unsupported PDF result', async () => {
  render(<Editor />); fireEvent.click(screen.getByLabelText('I reviewed this report against the current chart.'));
  mocks.save.mockResolvedValueOnce('unsupported'); fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await screen.findByRole('alert'); expect(screen.queryByText('Report PDF downloaded.')).not.toBeInTheDocument();
});
it('refines once for a new dictation completion request in its captured language', async () => {
  const changed = vi.fn(), value = snapshot(); value.patientInfo.radiologyReport = '108: possible fracture';
  const view = render(<RadiologyReportSection snapshot={value} aiEnabled onChange={changed} />);
  expect(mocks.generate).not.toHaveBeenCalled();
  view.rerender(<RadiologyReportSection snapshot={value} aiEnabled onChange={changed} refineRequest={{ id: 1, language: 'fr' }} />);
  await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ radiologyReportLanguage: 'fr', radiologyReviewedBasis: '' })));
  expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ patientInfo: expect.objectContaining({ radiologyReport: '108: possible fracture' }) }), 'fr');
  view.rerender(<RadiologyReportSection snapshot={value} aiEnabled onChange={changed} refineRequest={{ id: 1, language: 'fr' }} />);
  expect(mocks.generate).toHaveBeenCalledOnce();
});
it('does not retry an automatic refinement failure on another render', async () => {
  mocks.generate.mockRejectedValueOnce(new TypeError());
  const value = snapshot(), changed = vi.fn(), request = { id: 1, language: 'en' as const };
  const view = render(<RadiologyReportSection snapshot={value} aiEnabled onChange={changed} refineRequest={request} />);
  await screen.findByRole('alert');
  view.rerender(<RadiologyReportSection snapshot={value} aiEnabled onChange={changed} refineRequest={{ ...request }} />);
  expect(mocks.generate).toHaveBeenCalledOnce(); expect(changed).not.toHaveBeenCalled();
});

it('restores the original language when undoing automatic refinement into a different language', async()=>{
 const value=snapshot();value.patientInfo.radiologyReport='Original English findings.';
 function AutoEditor(){const [s,setS]=React.useState(value);const [request,setRequest]=React.useState<{id:number;language:'fr'}>();return <><button onClick={()=>setRequest({id:1,language:'fr'})}>Stop test dictation</button><RadiologyReportSection snapshot={s} aiEnabled onCustomizeLanguage={() => {}} refineRequest={request} onChange={changes=>setS(previous=>({...previous,patientInfo:{...previous.patientInfo,...changes}}))}/></>;}
 render(<AutoEditor/>);fireEvent.click(screen.getByRole('button',{name:'Stop test dictation'}));
 await screen.findByRole('button',{name:'Undo refinement'});expect(screen.getByRole('button', { name: /Français/ })).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Undo refinement'}));expect(screen.queryByRole('button', { name: /Change it in Customize/ })).not.toBeInTheDocument();
 expect(screen.getByLabelText('Report text')).toHaveValue('Original English findings.');
});
it('shows externally captured dictation language even if refinement fails', async()=>{
 mocks.generate.mockRejectedValueOnce(new TypeError());const value=snapshot();value.patientInfo.radiologyReport='Original';
 const view=render(<RadiologyReportSection snapshot={value} aiEnabled onChange={vi.fn()}/>);
 view.rerender(<RadiologyReportSection snapshot={{...value,patientInfo:{...value.patientInfo,radiologyReportLanguage:'fr'}}} aiEnabled onCustomizeLanguage={() => {}} onChange={vi.fn()} refineRequest={{id:1,language:'fr'}}/>);
 await screen.findByRole('alert');expect(screen.getByRole('button', { name: /Français/ })).toBeVisible();
 expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(expect.anything(),'fr');
});

it('releases a pending refinement when the app language changes on a legacy draft', async()=>{
 const i18n=(await import('../i18n')).default;let resolve!:(body:string)=>void;
 mocks.generate.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));const changed=vi.fn();
 render(<RadiologyReportSection snapshot={snapshot()} aiEnabled onChange={changed}/>);
 fireEvent.click(screen.getByRole('button',{name:'Refine with AI'}));await waitFor(()=>expect(mocks.generate).toHaveBeenCalledOnce());
 try {await act(async()=>{await i18n.changeLanguage('fr');});
 expect(screen.getByRole('button',{name:i18n.t('app:radiologyReport.refine')})).toBeEnabled();
 await act(async()=>resolve('Obsolete response'));expect(changed).not.toHaveBeenCalled();
 } finally {await act(async()=>{await i18n.changeLanguage('en');});}
});
it('keeps CT text, refinement, Undo and review independent from radiology', async () => {
  const value = snapshot(); value.patientInfo.radiologyReport = 'Existing x-ray report'; value.patientInfo.ctReport = 'CT: 108 distal root lesion, extent uncertain.';
  const changes = vi.fn();
  function CtEditor() { const [s, setS] = React.useState(value); return <RadiologyReportSection reportKind="ct" snapshot={s} aiEnabled onChange={change => { changes(change); setS(previous => ({ ...previous, patientInfo: { ...previous.patientInfo, ...change } })); }} />; }
  render(<CtEditor />);
  expect(screen.getByRole('heading', { name: 'CT report' })).toBeInTheDocument();
  const editor = screen.getByLabelText('Report text'); expect(editor).toHaveValue(value.patientInfo.ctReport);
  expect(editor).toHaveAttribute('placeholder', expect.stringMatching(/CT[\s\S]*contrast/i));
  fireEvent.change(editor, { target: { value: 'CT: corrected 409 finding.' } });
  expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ ctReport: 'CT: corrected 409 finding.', ctReviewedBasis: '' }));
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' })); await screen.findByRole('button', { name: 'Undo refinement' });
  expect(mocks.generate).toHaveBeenCalledWith(expect.anything(), 'en', 'ct');
  fireEvent.click(screen.getByRole('button', { name: 'Undo refinement' })); expect(editor).toHaveValue('CT: corrected 409 finding.');
  fireEvent.click(screen.getByLabelText('I reviewed this report against the current chart.'));
  expect(screen.getByRole('button', { name: 'Copy report' })).toBeEnabled();
  expect(changes.mock.calls.every(([change]) => Object.keys(change).every(key => key.startsWith('ct')))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Copy report' })); await waitFor(() => expect(mocks.copy).toHaveBeenCalledOnce());
  expect(mocks.copy).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('CT report'), expect.any(String));
  expect(mocks.copy).not.toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Existing x-ray report'), expect.any(String));
});
it('does not offer CT refinement based on x-ray findings alone', () => {
  render(<RadiologyReportSection reportKind="ct" snapshot={snapshot()} aiEnabled onChange={vi.fn()} />);
  expect(screen.getByLabelText('Report text')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Refine with AI' })).toBeDisabled();
});
it('drops a pending CT refinement if CT text changes while the x-ray report stays unchanged', async () => {
  let resolve!: (body: string) => void; mocks.generate.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const value = snapshot(); value.patientInfo.radiologyReport = 'Unchanged x-ray'; value.patientInfo.ctReport = 'Original CT'; const changed = vi.fn();
  const view = render(<RadiologyReportSection reportKind="ct" snapshot={value} aiEnabled onChange={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Refine with AI' })); await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce());
  view.rerender(<RadiologyReportSection reportKind="ct" snapshot={{ ...value, patientInfo: { ...value.patientInfo, ctReport: 'Corrected CT' } }} aiEnabled onChange={changed} />);
  await act(async () => resolve('Obsolete CT refinement')); expect(changed).not.toHaveBeenCalled();
});

it('drops a CT response after switching modality even when report text and source match', async()=>{
 let resolve!:(body:string)=>void;mocks.generate.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const value=snapshot();Object.assign(value.patientInfo,{radiographicFindings:'',radiologyReport:'Matching text',ctReport:'Matching text'});const changed=vi.fn();
 const view=render(<RadiologyReportSection reportKind="ct" snapshot={value} aiEnabled onChange={changed}/>);
 fireEvent.click(screen.getByRole('button',{name:'Refine with AI'}));await waitFor(()=>expect(mocks.generate).toHaveBeenCalledOnce());
 view.rerender(<RadiologyReportSection snapshot={value} aiEnabled onChange={changed}/>);
 await act(async()=>resolve('Obsolete CT'));expect(changed).not.toHaveBeenCalled();
});
it('treats malformed local CT text as empty rather than displaying an object or borrowing x-ray text',()=>{
 const value=snapshot();value.patientInfo.ctReport={untrusted:true} as never;
 render(<RadiologyReportSection reportKind="ct" snapshot={value} aiEnabled onChange={vi.fn()}/>);
 expect(screen.getByLabelText('Report text')).toHaveValue('');expect(screen.getByRole('button',{name:'Refine with AI'})).toBeDisabled();
});
it('keeps real CT capture language and clears review when automatic refinement fails', async () => {
  const i18n = (await import('../i18n')).default;
  const { ctReportSnapshot } = await import('../utils/ctReportState');
  const { radiologySourceBasis, radiologyReviewBasis } = await import('../utils/radiologyReportState');
  const value = snapshot(); Object.assign(value.patientInfo, { ctReport: 'Existing CT report.', ctReportLanguage: 'en' });
  const ct = ctReportSnapshot(value);
  value.patientInfo.ctReportBasis = radiologySourceBasis(ct); value.patientInfo.ctReviewedBasis = radiologyReviewBasis(ct, 'en');
  let latest = value;
  function RealCaptureEditor() {
    const [s, setS] = React.useState(value); latest = s;
    return <RadiologyReportSection reportKind="ct" snapshot={s} chartId="ct-chart" chartSession={1} aiEnabled
      onChange={changes => setS(previous => ({ ...previous, patientInfo: { ...previous.patientInfo, ...changes } }))}
      onDictationApply={(changes, source) => setS(previous => ({ ...previous, patientInfo: { ...previous.patientInfo, ...changes }, clinicalDictations: [source] }))} />;
  }
  mocks.generate.mockRejectedValueOnce(new TypeError());
  try {
    await act(async () => { await i18n.changeLanguage('fr'); });
    render(<RealCaptureEditor />);
    fireEvent.click(screen.getByRole('button', { name: i18n.t('voice:clinical.dictate', { target: i18n.t('voice:clinical.kinds.ct') }) }));
    fireEvent.change(screen.getByLabelText(i18n.t('voice:clinical.transcript')), { target: { value: 'Lésion de 409, étendue incertaine.' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('voice:clinical.ctApply') }));
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledOnce()); await screen.findByRole('alert');
    expect(latest.patientInfo).toMatchObject({ ctReportLanguage: 'fr', ctReviewedBasis: '', ctReport: 'Existing CT report.\n\nLésion de 409, étendue incertaine.' });
    expect(latest.clinicalDictations?.[0]).toMatchObject({ language: 'fr', kind: 'ct', transcript: 'Lésion de 409, étendue incertaine.' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText(i18n.t('app:radiologyReport.checked'))).not.toBeChecked();
  } finally { await act(async () => { await i18n.changeLanguage('en'); }); }
});
it('does not label a manually entered main report as an outdated AI draft', () => {
  const value = snapshot(); value.patientInfo.radiologyReport = value.patientInfo.radiographicFindings;
  render(<RadiologyReportSection chartEditor snapshot={value} aiEnabled onChange={() => {}} />);
  expect(screen.queryByText(/The chart changed since this report was drafted/)).not.toBeInTheDocument();
  expect(screen.getByText('Refine', { exact: false }).closest('summary')).toBeInTheDocument();
});

it('uses the report Refine control for empty X-ray and CT editors and labels CT dictation beside a mic', () => {
  const value = snapshot();
  value.patientInfo.radiographicFindings = '';
  render(<>
    <RadiologyReportSection chartEditor snapshot={value} aiEnabled onChange={vi.fn()} />
    <RadiologyReportSection chartEditor reportKind="ct" snapshot={value} aiEnabled onChange={vi.fn()} onDictationApply={vi.fn()} />
  </>);
  const xray = within(screen.getByRole('region', { name: 'Radiographic report' }));
  const ct = within(screen.getByRole('region', { name: 'CT report' }));
  expect(xray.getByRole('button', { name: 'Refine' })).toBeDisabled();
  expect(ct.getByRole('button', { name: 'Refine' })).toBeDisabled();
  expect(ct.getByRole('button', { name: 'Dictate CT report' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
});

it.each(['radiology', 'ct'] as const)('displays %s starter text without saving it and preserves recorded reports', kind => {
  const onChange = vi.fn();
  const key = kind === 'ct' ? 'ctReport' : 'radiologyReport';
  const label = 'Clinical report';
  const starterText = 'Findings:\n';
  const input = snapshot();
  const empty = { ...input, patientInfo: { ...input.patientInfo, radiographicFindings: '', [key]: '' } };
  const props = { chartEditor: true, aiEnabled: true, reportKind: kind, reportLabel: label, starterText, onChange };
  const { rerender } = render(<RadiologyReportSection {...props} snapshot={empty} />);
  expect(screen.getByRole('textbox', { name: label })).toHaveValue(starterText);
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Insert outline' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Refine' })).toBeDisabled();

  fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: starterText + 'Recorded finding.' } });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ [key]: starterText + 'Recorded finding.' }));

  rerender(<RadiologyReportSection {...props} snapshot={{ ...empty,
    patientInfo: { ...empty.patientInfo, [key]: 'Previously recorded.' },
  }} />);
  expect(screen.getByRole('textbox', { name: label })).toHaveValue('Previously recorded.');
});
