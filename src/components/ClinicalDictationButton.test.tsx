import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClinicalDictationButton } from './ClinicalDictationButton';
import { sampleOwnerReportSnapshot } from '../utils/ownerReportSample';
import i18n from '../i18n';
import type { ClinicalDictationKind } from '../types';
const mocks = vi.hoisted(() => ({ extract: vi.fn(), consent: vi.fn(), stop: vi.fn(), start: vi.fn(), startInLanguage: vi.fn(), copy: vi.fn(), recording: false, captureError: null as string | null, captureText: '', onStop: null as null | ((text: string) => void), auth: null as null | ((event: string) => void) }));
vi.mock('../utils/clinicalDictationAi', async (original) => ({ ...await original<typeof import('../utils/clinicalDictationAi')>(), extractClinicalDictation: mocks.extract }));
vi.mock('../native/aiConsent', () => ({ ensureAiConsent: mocks.consent }));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth: { onAuthStateChange: (callback: typeof mocks.auth) => { mocks.auth = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } } }));
vi.mock('../utils/clipboard', () => ({ copyRichText: mocks.copy }));
vi.mock('../hooks/useVoiceCapture', () => ({ useVoiceCapture: (options: { onStop: (text: string) => void }) => { mocks.onStop = options.onStop; return { supported: true, recording: mocks.recording, ready: false, transcript: mocks.captureText, lng: 'en', start: mocks.start, startInLanguage: mocks.startInLanguage, stop: mocks.stop, clear: vi.fn(), resume: mocks.start, error: mocks.captureError }; } }));
const text = 'Cough for three days';
const label = (key: 'transcript' | 'prepare' | 'autofilled' | 'checkTitle' | 'checkDone' | 'apply' | 'stale' | 'noSections' | 'copyTranscript' | 'copyPromptShown' | 'copied' | 'start' | 'ctApply') => i18n.t(`voice:clinical.${key}`);
// The shared setup has an existing, different complaint, so dictated text would REPLACE it and
// therefore waits for review. Autofill of empty fields is covered by the "autofill" tests below.
function setup(kind: ClinicalDictationKind = 'gp-visit') { const snapshot = sampleOwnerReportSnapshot(); snapshot.patientInfo.complaint = 'Existing reason for visit'; const props = { kind, snapshot, chartId: 'chart', chartSession: 1, aiEnabled: true, onApply: vi.fn() }; const view = render(<ClinicalDictationButton {...props}/>); fireEvent.click(screen.getByRole('button')); return { ...view, props }; }
function paste() { fireEvent.change(screen.getByLabelText(label('transcript')), { target: { value: text } }); }
async function prepare() { paste(); fireEvent.click(screen.getByRole('button', { name: label('prepare') })); await screen.findByRole('checkbox'); }
beforeEach(async () => { await i18n.changeLanguage('en'); mocks.extract.mockReset().mockResolvedValue([{ field: 'complaint', value: text, evidence: text }]); mocks.consent.mockReset().mockResolvedValue(true); mocks.copy.mockReset().mockResolvedValue('plain'); mocks.start.mockReset(); mocks.startInLanguage.mockReset().mockImplementation(() => mocks.start()); mocks.stop.mockReset(); mocks.recording = false; mocks.captureError = null; mocks.captureText = ''; });
afterEach(cleanup);
it('requires explicit recording and leaves destructive edits unchecked in managed review', async () => {
  const snapshot = sampleOwnerReportSnapshot();
  snapshot.patientInfo.complaint = 'Existing reason for visit';
  const onApply = vi.fn();
  render(<ClinicalDictationButton kind="discharge" snapshot={snapshot} chartId="chart" chartSession={1} aiEnabled
    openRequest={1} onApply={onApply} />);
  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(screen.getByRole('button', { name: label('start') })).toBeEnabled();
  expect(mocks.start).not.toHaveBeenCalled();
  await prepare();
  expect(screen.getByText('Existing reason for visit')).toBeVisible();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button', { name: label('apply') })).toBeDisabled();
  expect(mocks.extract.mock.calls[0][0]).toMatchObject({ kind: 'discharge', routedGpExamEnabled: false });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: label('apply') }));
  expect(onApply).toHaveBeenCalledExactlyOnceWith({ complaint: text }, expect.objectContaining({ fields: ['complaint'] }), true);
});
it('reviews editable proposals and applies text with raw provenance exactly once', async () => { const { props } = setup(); await prepare(); expect(props.onApply).not.toHaveBeenCalled(); fireEvent.change(screen.getByLabelText(i18n.t('visitDocumentation:fields.complaint.label')), { target: { value: 'Reviewed cough' } }); fireEvent.click(screen.getByRole('button', { name: label('apply') })); expect(props.onApply).toHaveBeenCalledExactlyOnceWith({ complaint: 'Reviewed cough' }, expect.objectContaining({ kind: 'gp-visit', language: 'en', transcript: text, fields: ['complaint'] })); });
it('blocks old proposals when chart text changes', async () => { const { props, rerender } = setup(); await prepare(); rerender(<ClinicalDictationButton {...props} snapshot={{ ...props.snapshot, patientInfo: { ...props.snapshot.patientInfo, complaint: 'Manual update' } }}/>); expect(screen.queryByRole('button', { name: label('apply') })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: label('prepare') })).toBeEnabled(); expect(screen.getByText(label('stale'))).toBeInTheDocument(); });
it('appends CT only with provenance without GP extraction', async () => { const { props } = setup('ct'); paste(); fireEvent.click(screen.getByRole('button', { name: label('ctApply') })); await waitFor(() => expect(props.onApply).toHaveBeenCalledOnce()); expect(props.onApply.mock.calls[0][0]).toEqual({ ctReport: [props.snapshot.patientInfo.ctReport, text].filter(Boolean).join('\n\n'), ctReportLanguage: 'en', ctReviewedBasis: '' }); expect(mocks.extract).not.toHaveBeenCalled(); });
it('keeps text recoverable if consent is refused', async () => { mocks.consent.mockResolvedValue(false); setup(); paste(); fireEvent.click(screen.getByRole('button', { name: label('prepare') })); await screen.findByRole('alert'); expect(mocks.extract).not.toHaveBeenCalled(); expect(screen.getByLabelText(label('transcript'))).toHaveValue(text); });
it('ignores a pending result after close', async () => { let resolve!: (value: unknown) => void; mocks.extract.mockImplementation(() => new Promise(done => { resolve = done; })); const { props } = setup(); paste(); fireEvent.click(screen.getByRole('button', { name: label('prepare') })); await waitFor(() => expect(mocks.extract).toHaveBeenCalled()); fireEvent.click(screen.getByRole('button', { name: i18n.t('common:actions.close') })); await act(async () => resolve([{ field: 'complaint', value: text, evidence: text }])); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(props.onApply).not.toHaveBeenCalled(); });
it.each(['SIGNED_OUT', 'SIGNED_IN'])('invalidates review after %s', async event => { const { props } = setup(); await prepare(); act(() => mocks.auth?.(event)); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(props.onApply).not.toHaveBeenCalled(); });
it('rejects malformed output and never clears fields', async () => { mocks.extract.mockResolvedValue([{ field: 'complaint', value: '', evidence: text }]); const { props } = setup(); paste(); fireEvent.click(screen.getByRole('button', { name: label('prepare') })); await screen.findByRole('alert'); expect(props.onApply).not.toHaveBeenCalled(); });
it('offers no apply for no clinical output', async () => { mocks.extract.mockResolvedValue([]); setup(); paste(); fireEvent.click(screen.getByRole('button', { name: label('prepare') })); await screen.findByText(label('noSections')); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); });
it('reports copy fallback without claiming clipboard success', async () => { mocks.copy.mockResolvedValue('prompt'); setup(); paste(); fireEvent.click(screen.getByRole('button', { name: label('copyTranscript') })); await screen.findByText(label('copyPromptShown')); expect(screen.queryByText(label('copied'))).not.toBeInTheDocument(); });

it('clears account-private raw text on authentication transition', async () => { setup(); paste(); act(() => mocks.auth?.('SIGNED_OUT')); fireEvent.click(screen.getByRole('button')); expect(screen.getByLabelText(label('transcript'))).toHaveValue(''); });
it('cancels recording on dismissal without applying final CT words', async () => { const { props } = setup('ct'); fireEvent.click(screen.getByRole('button', { name: label('start') })); await waitFor(() => expect(mocks.start).toHaveBeenCalled()); mocks.stop.mockImplementationOnce(() => mocks.onStop?.(text)); fireEvent.click(screen.getByRole('button', { name: i18n.t('common:actions.close') })); await act(async () => {}); expect(props.onApply).not.toHaveBeenCalled(); });
it('automatically appends stopped CT speech with the capture session language', async () => { const { props } = setup('ct'); fireEvent.click(screen.getByRole('button', { name: label('start') })); await waitFor(() => expect(mocks.start).toHaveBeenCalled()); await act(() => i18n.changeLanguage('fr')); await act(async () => mocks.onStop?.(text)); await waitFor(() => expect(props.onApply).toHaveBeenCalledOnce()); expect(props.onApply.mock.calls[0][1]).toMatchObject({ language: 'en', transcript: text, fields: ['ctReport'] }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); });
it('stops pending extraction landing after an otherwise identical chart session changes', async () => { let resolve!: (value: unknown) => void; mocks.extract.mockImplementationOnce(() => new Promise(done => { resolve = done; })); const { props, rerender } = setup(); paste(); fireEvent.click(screen.getByRole('button', { name: label('prepare') })); await waitFor(() => expect(mocks.extract).toHaveBeenCalled()); rerender(<ClinicalDictationButton {...props} chartSession={2}/>); await act(async () => resolve([{ field: 'complaint', value: text, evidence: text }])); expect(props.onApply).not.toHaveBeenCalled(); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); });
it('rejects stale provenance even when the clinical fields are unchanged', async () => { const { props, rerender } = setup(); await prepare(); const source = { id: 'other', kind: 'ct' as const, language: 'en' as const, transcript: 'Earlier source', fields: ['ctReport' as const], recordedAt: new Date().toISOString() }; rerender(<ClinicalDictationButton {...props} snapshot={{ ...props.snapshot, clinicalDictations: [source] }}/>); expect(screen.queryByRole('button', { name: label('apply') })).not.toBeInTheDocument(); expect(props.onApply).not.toHaveBeenCalled(); });
it('prevalidates source storage bounds before changing clinical text', async () => { const { props, rerender } = setup(); const sources = Array.from({ length: 20 }, (_, index) => ({ id: String(index), kind: 'ct' as const, language: 'en' as const, transcript: 'Earlier source', fields: ['ctReport' as const], recordedAt: new Date().toISOString() })); rerender(<ClinicalDictationButton {...props} snapshot={{ ...props.snapshot, clinicalDictations: sources }}/>); await prepare(); fireEvent.click(screen.getByRole('button', { name: label('apply') })); await screen.findByRole('alert'); expect(props.onApply).not.toHaveBeenCalled(); expect(screen.getByLabelText(label('transcript'))).toHaveValue(text); });
it('revokes apply when AI access is lost', async () => { const { props, rerender } = setup(); await prepare(); rerender(<ClinicalDictationButton {...props} aiEnabled={false}/>); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(props.onApply).not.toHaveBeenCalled(); });
it('reports actual successful clipboard writes', async () => { setup(); paste(); fireEvent.click(screen.getByRole('button', { name: label('copyTranscript') })); await screen.findByText(label('copied')); expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining(text), text, expect.any(String), expect.any(Function)); });

it('atomically replaces CT language and clears prior review before refinement can run', async () => {
  const snapshot = sampleOwnerReportSnapshot();
  snapshot.patientInfo.ctReport = 'Previous findings';
  snapshot.patientInfo.ctReportLanguage = 'en';
  snapshot.patientInfo.ctReviewedBasis = 'Previously reviewed';
  const onApply = vi.fn();
  await i18n.changeLanguage('fr');
  render(<ClinicalDictationButton kind="ct" snapshot={snapshot} chartId="chart" chartSession={1} aiEnabled onApply={onApply}/>);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  await act(async () => mocks.onStop?.('Pas de fracture visible.'));
  await waitFor(() => expect(onApply).toHaveBeenCalledExactlyOnceWith({ ctReport: 'Previous findings\n\nPas de fracture visible.', ctReportLanguage: 'fr', ctReviewedBasis: '' }, expect.objectContaining({ language: 'fr', transcript: 'Pas de fracture visible.', fields: ['ctReport'] })));
});

it('ignores malformed prior CT data instead of serializing it into clinical text', async () => {
  const snapshot = sampleOwnerReportSnapshot();
  Object.assign(snapshot.patientInfo, { ctReport: { unexpected: 'persisted value' } });
  const onApply = vi.fn();
  render(<ClinicalDictationButton kind="ct" snapshot={snapshot} chartId="chart" chartSession={1} aiEnabled onApply={onApply}/>);
  fireEvent.click(screen.getByRole('button'));
  paste();
  fireEvent.click(screen.getByRole('button', { name: label('ctApply') }));
  await waitFor(() => expect(onApply).toHaveBeenCalledExactlyOnceWith({ ctReport: text, ctReportLanguage: 'en', ctReviewedBasis: '' }, expect.objectContaining({ transcript: text })));
});

it('waits for final stopped speech before permitting restart, target changes, edits or preparation', async () => {
  const { props, rerender } = setup();
  paste();
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  mocks.recording = true;
  rerender(<ClinicalDictationButton {...props}/>);
  const stop = screen.getByRole('button', { name: i18n.t('voice:clinical.stop') });
  expect(stop).toBeEnabled();
  fireEvent.click(stop);
  mocks.recording = false;
  rerender(<ClinicalDictationButton {...props}/>);
  expect(screen.getByText(i18n.t('voice:status.finishing'))).toBeInTheDocument();
  expect(screen.getByRole('button', { name: label('start') })).toBeDisabled();
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByLabelText(label('transcript'))).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: label('prepare') })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  expect(mocks.start).toHaveBeenCalledOnce();
  await act(async () => mocks.onStop?.('Final words'));
  await waitFor(() => expect(mocks.extract).toHaveBeenCalledOnce());
  expect(mocks.extract.mock.calls[0][0].transcript).toBe(text + '\n\nFinal words');
});
it('supplies a clipboard fallback guard invalidated by chart source changes', async () => {
  const { props, rerender } = setup();
  paste();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: label('copyTranscript') })));
  const isCurrent = mocks.copy.mock.calls[0][3] as () => boolean;
  expect(isCurrent()).toBe(true);
  rerender(<ClinicalDictationButton {...props} snapshot={{ ...props.snapshot, patientInfo: { ...props.snapshot.patientInfo, complaint: 'Changed' } }}/>);
  expect(isCurrent()).toBe(false);
});

it('releases failed microphone ownership on initial and repeated identical failures', async () => {
  const { props } = setup();
  paste();
  mocks.start.mockImplementation(() => { mocks.recording = false; mocks.captureError = 'Microphone unavailable'; });
  for (const count of [1, 2]) {
    fireEvent.click(screen.getByRole('button', { name: label('start') }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(count));
    await waitFor(() => expect(screen.getByRole('button', { name: label('start') })).toBeEnabled());
    expect(screen.getByLabelText(label('transcript'))).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText(label('transcript'))).toHaveValue(text);
    expect(screen.getByRole('button', { name: label('prepare') })).toBeEnabled();
  }
  expect(props.onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: label('prepare') }));
  await screen.findByRole('checkbox');
});
it('retains late final words after a same-patient source edit without automatic extraction or application', async () => {
  const { props, rerender } = setup();
  paste();
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  mocks.recording = true;
  rerender(<ClinicalDictationButton {...props}/>);
  rerender(<ClinicalDictationButton {...props} snapshot={{ ...props.snapshot, patientInfo: { ...props.snapshot.patientInfo, complaint: 'Updated while recording' } }}/>);
  mocks.recording = false;
  await act(async () => mocks.onStop?.('Late final words'));
  expect(screen.getByLabelText(label('transcript'))).toHaveValue(text + '\n\nLate final words');
  expect(screen.getByRole('button', { name: label('prepare') })).toBeEnabled();
  expect(mocks.extract).not.toHaveBeenCalled();
  expect(props.onApply).not.toHaveBeenCalled();
});

it('continues the frozen clinical language without duplicating words, then starts a fresh dictation in the current app language', async () => {
  const { props } = setup();
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.startInLanguage).toHaveBeenLastCalledWith('en'));
  await act(async () => mocks.onStop?.(text));
  await screen.findByRole('checkbox');
  await act(() => i18n.changeLanguage('fr'));
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.startInLanguage).toHaveBeenCalledTimes(2));
  expect(mocks.startInLanguage).toHaveBeenLastCalledWith('en');
  await act(async () => mocks.onStop?.('Second words'));
  await screen.findByRole('checkbox');
  expect(mocks.extract.mock.calls[1][0]).toMatchObject({ transcript: text + '\n\nSecond words', language: 'en' });
  fireEvent.click(screen.getByRole('button', { name: label('apply') }));
  expect(props.onApply.mock.calls[0][1]).toMatchObject({ transcript: text + '\n\nSecond words', language: 'en' });
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.startInLanguage).toHaveBeenLastCalledWith('fr'));
});

it('takes the current language after an empty failed capture', async () => {
  setup();
  mocks.start.mockImplementationOnce(() => { mocks.captureError = 'Microphone unavailable'; });
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByRole('button', { name: label('start') })).toBeEnabled());
  await act(() => i18n.changeLanguage('fr'));
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.startInLanguage).toHaveBeenLastCalledWith('fr'));
});

it('unlocks draining controls after a source edit when the final suffix is empty', async () => {
  const { props, rerender } = setup();
  paste();
  fireEvent.click(screen.getByRole('button', { name: label('start') }));
  await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
  mocks.recording = true;
  rerender(<ClinicalDictationButton {...props}/>);
  const snapshot = { ...props.snapshot, patientInfo: { ...props.snapshot.patientInfo, complaint: 'Updated during capture' } };
  rerender(<ClinicalDictationButton {...props} snapshot={snapshot}/>);
  mocks.recording = false;
  rerender(<ClinicalDictationButton {...props} snapshot={snapshot}/>);
  expect(screen.getByText(i18n.t('voice:status.finishing'))).toBeInTheDocument();
  await act(async () => mocks.onStop?.(''));
  expect(screen.queryByText(i18n.t('voice:status.finishing'))).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: label('start') })).toBeEnabled();
  expect(screen.getByRole('button', { name: label('prepare') })).toBeEnabled();
  expect(screen.getByRole('combobox')).toBeEnabled();
  expect(screen.getByLabelText(label('transcript'))).toHaveValue(text);
  expect(screen.getByLabelText(label('transcript'))).not.toHaveAttribute('readonly');
  expect(mocks.extract).not.toHaveBeenCalled();
  expect(props.onApply).not.toHaveBeenCalled();
});

it('hides GP dictation targets from consultation when GP exam is off', () => {
  setup('consultation');
  const select = screen.getByLabelText(i18n.t('voice:clinical.target'));
  expect([...select.querySelectorAll('option')].map(option => option.value)).toEqual(['consultation', 'discharge']);
});

it('omits Consultation from dictation targets when only GP examination is enabled', () => {
  render(<ClinicalDictationButton kind="gp-visit" snapshot={sampleOwnerReportSnapshot()} chartId="chart" chartSession={1}
    aiEnabled gpExamEnabled consultationEnabled={false} onApply={vi.fn()} />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getAllByRole('option').map(option => (option as HTMLOptionElement).value)).toEqual(['gp-visit', 'gp-exam', 'discharge']);
});

it('reviews additional dental findings using the completed recording without restarting the microphone', async () => {
  const onApply = vi.fn();
  const seededTranscript = { text: 'CT: possible fracture at 108.', language: 'fr' as const };
  const proposal = { field: 'ctReport', value: seededTranscript.text, evidence: seededTranscript.text, confidence: 'high' as const };
  mocks.extract.mockResolvedValue([proposal]);
  const props = { kind: 'dental-visit' as const, snapshot: sampleOwnerReportSnapshot(), chartId: 'chart', chartSession: 1, aiEnabled: true,
    seededTranscript, strictTarget: true, openRequest: 1, onApply };
  const view = render(<ClinicalDictationButton {...props} disabled />);
  expect(mocks.extract).not.toHaveBeenCalled();
  view.rerender(<ClinicalDictationButton {...props} />);
  expect(await screen.findByRole('dialog', { name: 'Additional dental findings' })).toBeVisible();
  expect(mocks.extract).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'dental-visit', transcript: seededTranscript.text, language: 'fr' }));
  expect(mocks.start).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: label('start') })).not.toBeInTheDocument();
  // Voice first: the finding is filled in straight away, with no Apply tap.
  await waitFor(() => expect(onApply).toHaveBeenCalledExactlyOnceWith({ ctReport: proposal.value }, expect.objectContaining({ language: 'fr', fields: ['ctReport'] })));
  expect(screen.queryByRole('button', { name: label('apply') })).not.toBeInTheDocument();
  expect(screen.getByText(i18n.t('voice:clinical.autofilled', { fields: i18n.t('app:ct.title') }))).toBeVisible();
});

it('does not open an extra dialog when the completed dental recording has no supplemental fields', async () => {
  const onApply = vi.fn();
  const onOpenChange = vi.fn();
  mocks.extract.mockResolvedValue([]);
  render(<ClinicalDictationButton kind="dental-visit" snapshot={sampleOwnerReportSnapshot()} chartId="chart" chartSession={1} aiEnabled
    seededTranscript={{ text: 'Tooth 108 pocket four.', language: 'en' }} strictTarget openRequest={1} onApply={onApply} onOpenChange={onOpenChange} />);
  await waitFor(() => expect(onOpenChange.mock.calls).toEqual([[true], [false]]));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onApply).not.toHaveBeenCalled();
});

describe('voice-first autofill', () => {
  function emptySetup() { const snapshot = sampleOwnerReportSnapshot(); snapshot.patientInfo.complaint = ''; const props = { kind: 'gp-visit' as const, snapshot, chartId: 'chart', chartSession: 1, aiEnabled: true, onApply: vi.fn() }; const view = render(<ClinicalDictationButton {...props}/>); fireEvent.click(screen.getByRole('button')); return { ...view, props }; }
  const prepareAuto = () => { paste(); fireEvent.click(screen.getByRole('button', { name: label('prepare') })); };
  it('fills a confident result straight into an empty field with no review step', async () => {
    mocks.extract.mockResolvedValue([{ field: 'complaint', value: text, evidence: text, confidence: 'high' }]);
    const { props } = emptySetup(); prepareAuto();
    await waitFor(() => expect(props.onApply).toHaveBeenCalledExactlyOnceWith({ complaint: text }, expect.objectContaining({ kind: 'gp-visit', transcript: text, fields: ['complaint'] })));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(label('checkTitle'))).not.toBeInTheDocument();
    expect(screen.getByText(i18n.t('voice:clinical.autofilled', { fields: i18n.t('visitDocumentation:fields.complaint.label') }))).toBeVisible();
  });
  it('fills a low-confidence result too, and keeps it on screen to double-check', async () => {
    mocks.extract.mockResolvedValue([{ field: 'complaint', value: text, evidence: text, confidence: 'low' }]);
    const { props } = emptySetup(); prepareAuto();
    await waitFor(() => expect(props.onApply).toHaveBeenCalledOnce());
    expect(await screen.findByText(label('checkTitle'))).toBeVisible();
    expect(screen.getByLabelText(i18n.t('visitDocumentation:fields.complaint.label'))).toHaveValue(text);
    fireEvent.click(screen.getByRole('button', { name: label('checkDone') }));
    expect(props.onApply).toHaveBeenCalledOnce(); // confirming applies nothing more
    expect(screen.queryByText(label('checkTitle'))).not.toBeInTheDocument();
  });
  it('applies an edit made in the check card as a correction', async () => {
    mocks.extract.mockResolvedValue([{ field: 'complaint', value: text, evidence: text, confidence: 'low' }]);
    const { props } = emptySetup(); prepareAuto();
    await screen.findByText(label('checkTitle'));
    fireEvent.change(screen.getByLabelText(i18n.t('visitDocumentation:fields.complaint.label')), { target: { value: 'Cough for four days' } });
    fireEvent.click(screen.getByRole('button', { name: label('checkDone') }));
    expect(props.onApply).toHaveBeenCalledTimes(2);
    expect(props.onApply.mock.calls[1][0]).toEqual({ complaint: 'Cough for four days' });
  });
  it('treats a result with no confidence rating as low', async () => {
    mocks.extract.mockResolvedValue([{ field: 'complaint', value: text, evidence: text }]);
    const { props } = emptySetup(); prepareAuto();
    await waitFor(() => expect(props.onApply).toHaveBeenCalledOnce());
    expect(await screen.findByText(label('checkTitle'))).toBeVisible();
  });
  it('shows the review instead when the commit is refused, so nothing dictated is lost', async () => {
    mocks.extract.mockResolvedValue([{ field: 'complaint', value: text, evidence: text, confidence: 'high' }]);
    const { props } = emptySetup(); props.onApply.mockImplementationOnce(() => { throw new Error('stale'); });
    prepareAuto();
    expect(await screen.findByRole('checkbox')).toBeChecked();
    expect(screen.getByLabelText(label('transcript'))).toHaveValue(text);
  });
  it('never autofills over existing text: a replacement waits for a tap', async () => {
    mocks.extract.mockResolvedValue([{ field: 'complaint', value: text, evidence: text, confidence: 'high' }]);
    const { props } = setup(); prepareAuto();
    expect(await screen.findByRole('checkbox')).toBeVisible();
    expect(screen.getByRole('button', { name: label('apply') })).toBeVisible();
    expect(props.onApply).not.toHaveBeenCalled();
  });
  it('fills a result that extends existing text without asking', async () => {
    mocks.extract.mockResolvedValue([{ field: 'complaint', value: 'Existing reason for visit. ' + text, evidence: text, confidence: 'high' }]);
    const { props } = setup(); prepareAuto();
    await waitFor(() => expect(props.onApply).toHaveBeenCalledOnce());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
