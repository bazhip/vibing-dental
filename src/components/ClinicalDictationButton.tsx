import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ChartSnapshot, ClinicalDictationField, ClinicalDictationKind, ClinicalDictationSource, PatientInfo } from '../types';
import { isAppLanguage, type AppLanguage } from '../i18n/config';
import { useVoiceCapture } from '../hooks/useVoiceCapture';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { ensureAiConsent } from '../native/aiConsent';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { Icon } from '../ios/icons';
import { recordNoteBasis, plainTextToHtml } from '../utils/recordNote';
import { appendClinicalDictationSource } from '../utils/clinicalDictationSources';
import { allowedClinicalFields, extractClinicalDictation, type ClinicalDictationProposal } from '../utils/clinicalDictationAi';
import { copyRichText } from '../utils/clipboard';
import { ctRecordedText } from '../utils/ctReportState';
import { friendlyError } from './ui/dialogs';
import { supabase } from '../utils/supabaseClient';
import './ClinicalDictationButton.css';

interface Props {
  kind: ClinicalDictationKind;
  snapshot: ChartSnapshot;
  chartId: string | null;
  chartSession: number;
  readOnly?: boolean;
  aiEnabled?: boolean;
  gpExamEnabled?: boolean;
  strictTarget?: boolean;
  seededTranscript?: { text: string; language: AppLanguage };
  consultationEnabled?: boolean;
  /** Blocks opening when another dictation owns the microphone. */
  disabled?: boolean;
  /** null keeps the shared launcher idle. undefined renders the standalone trigger. */
  openRequest?: number | null;
  imagingFocus?: 'ctReport' | 'radiographicFindings';
  onApply: (changes: Partial<PatientInfo>, source: ClinicalDictationSource, routed?: boolean) => void;
  onOpenChange?: (open: boolean) => void;
}
type Proposal = ClinicalDictationProposal & { selected: boolean };
const MIC_ICON = 'mic';
const kinds = ['gp-visit', 'consultation', 'gp-exam', 'discharge'] as const;
const fingerprint = (snapshot: ChartSnapshot) => `${recordNoteBasis(snapshot)}\n${JSON.stringify(snapshot.clinicalDictations ?? [])}`;
const normalized = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** Capture is kept separate from dental parsing: raw wording is the saved source. */
export function ClinicalDictationButton(props: Props) {
  const { t, i18n } = useTranslation(['voice', 'common', 'forms', 'app', 'visitDocumentation']);
  const translate = React.useRef(t); translate.current = t;
  const language = (): AppLanguage => isAppLanguage(i18n.language) ? i18n.language : 'en';
  const [open, setOpen] = React.useState(false);
  const managed = props.openRequest !== undefined;
  const handledOpen = React.useRef<number | null>(null);
  const [target, setTarget] = React.useState(props.kind);
  const [transcript, setTranscript] = React.useState('');
  const [proposals, setProposals] = React.useState<Proposal[] | null>(null);
  const [reviewBasis, setReviewBasis] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [captureAttempt, setCaptureAttempt] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const epoch = React.useRef(0), locked = React.useRef(false), mounted = React.useRef(true);
  const reviewToken = React.useRef<number | null>(null);
  const requestIdentity = React.useRef('');
  const opened = React.useRef(false), sessionLanguage = React.useRef<AppLanguage | null>(null);
  const mic = React.useRef<{ token: number; basis: string; prefix: string; target: ClinicalDictationKind } | null>(null);
  const basis = fingerprint(props.snapshot);
  const identity = JSON.stringify([props.chartId, props.chartSession, props.kind]);
  const current = React.useRef({ props, basis, target, transcript, identity });
  current.current = { props, basis, target, transcript, identity };
  const prepareRef = React.useRef<(text: string) => void>(() => {});
  const stopHandler = React.useRef<(text: string) => void>(() => {});
  const capture = useVoiceCapture({ ignoreStaleStopCallbacks: true, onStop: text => stopHandler.current(text) });
  const captureRef = React.useRef(capture); captureRef.current = capture;
  const native = isNativeApp();
  const seeded = props.seededTranscript;
  const visible = open && (!seeded || !!error || !!proposals?.length || !!status);
  const modalRef = useModalFocus<HTMLDivElement>(visible && !native);
  const heading = React.useId();

  const invalidate = React.useCallback(() => {
    epoch.current++; locked.current = false; mic.current = null; reviewToken.current = null;
    setBusy(false); setProposals(null); setReviewBasis(null);
  }, []);
  const close = React.useCallback(() => {
    const wasOpen = opened.current; opened.current = false;
    invalidate(); captureRef.current.stop();
    setOpen(false); if (wasOpen) current.current.props.onOpenChange?.(false);
  }, [invalidate]);
  const backdrop = useBackdropDismiss(close);
  const show = React.useCallback(() => {
    const now = current.current.props;
    if (opened.current || now.disabled || now.readOnly || !now.aiEnabled) return;
    opened.current = true;
    setOpen(true);
    setError(null);
    setStatus(null);
    now.onOpenChange?.(true);
  }, []);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; const wasOpen = opened.current; opened.current = false; epoch.current++; mic.current = null; if (wasOpen) current.current.props.onOpenChange?.(false); };
  }, []);
  React.useEffect(() => {
    close(); setTranscript(''); setTarget(props.kind); sessionLanguage.current = null; captureRef.current.clear();
  }, [props.chartId, props.chartSession, props.kind, close]);
  React.useEffect(() => {
    if (!props.readOnly && props.aiEnabled) return;
    epoch.current++; locked.current = false; reviewToken.current = null;
    setBusy(false); setProposals(null); setReviewBasis(null); captureRef.current.stop();
  }, [props.readOnly, props.aiEnabled, invalidate]);
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange(event => {
      if (['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED', 'PASSWORD_RECOVERY'].includes(event)) {
        close(); setTranscript(''); setProposals(null); sessionLanguage.current = null;
        setStatus(null); setError(null); captureRef.current.clear();
      }
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [close]);
  React.useEffect(() => {
    if (!visible || native) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [visible, native, close]);
  // Chart edits invalidate in-flight extraction immediately, while preserving review text.
  React.useEffect(() => {
    if (!locked.current && !mic.current) return;
    epoch.current++; locked.current = false;
    captureRef.current.stop(); setBusy(false); setError(translate.current('clinical.stale'));
  }, [basis]);

  React.useEffect(() => {
    const request = props.openRequest;
    if (request == null || request === handledOpen.current || props.disabled || props.readOnly || !props.aiEnabled) return;
    handledOpen.current = request;
    show();
    if (seeded && opened.current) {
      sessionLanguage.current = seeded.language;
      setTranscript(seeded.text);
      prepareRef.current(seeded.text);
    }
  }, [props.openRequest, props.disabled, props.readOnly, props.aiEnabled, seeded, show]);
  // Failed starts do not always emit onStop. Each attempt must release its own
  // ownership even when a repeated failure has the same error and recording state.
  React.useEffect(() => {
    const owner = mic.current;
    if (!owner || capture.recording || !capture.error) return;
    mic.current = null; epoch.current++; locked.current = false; reviewToken.current = null;
    setCaptureAttempt(previous => previous + 1);
    setBusy(false); setProposals(null); setReviewBasis(null);
    if (opened.current) setTranscript([owner.prefix, captureRef.current.transcript].filter(Boolean).join('\n\n'));
  }, [capture.recording, capture.error, captureAttempt]);

  const valid = (token: number, sourceBasis: string, selectedTarget: ClinicalDictationKind) => mounted.current && opened.current
    && token === epoch.current && requestIdentity.current === current.current.identity && current.current.basis === sourceBasis && current.current.target === selectedTarget
    && !current.current.props.readOnly && !!current.current.props.aiEnabled;
  const sourceFor = (raw: string, fields: ClinicalDictationField[]): ClinicalDictationSource => ({
    id: crypto.randomUUID(), kind: current.current.target, language: sessionLanguage.current ?? language(),
    transcript: raw, recordedAt: new Date().toISOString(), fields,
  });
  const commit = (changes: Partial<PatientInfo>, source: ClinicalDictationSource) => {
    // Validate the entire addition before the parent mutates either clinical text or provenance.
    appendClinicalDictationSource(current.current.props.snapshot.clinicalDictations ?? [], source);
    if (managed && !current.current.props.strictTarget && source.kind !== 'ct') current.current.props.onApply(changes, source, true);
    else current.current.props.onApply(changes, source);
    reviewToken.current = null;
    setProposals(null); setReviewBasis(null); setTranscript(''); sessionLanguage.current = null;
    captureRef.current.clear(); setStatus(t('clinical.applied'));
  };
  const prepare = async (raw = current.current.transcript) => {
    const { props: now, basis: sourceBasis, target: selectedTarget } = current.current;
    if (locked.current || mic.current || !opened.current || now.readOnly || !now.aiEnabled) return;
    if (!raw.trim() || raw.length > 40000) { setError(t(raw.trim() ? 'clinical.transcriptTooLong' : 'clinical.emptyTranscript')); return; }
    sessionLanguage.current ??= language();
    const token = ++epoch.current; requestIdentity.current = current.current.identity;
    locked.current = true; setBusy(true); setError(null); setStatus(null); setProposals(null); setReviewBasis(null);
    try {
      if (!(await ensureAiConsent())) { if (valid(token, sourceBasis, selectedTarget)) setError(t('clinical.consentRequired')); return; }
      if (!valid(token, sourceBasis, selectedTarget)) return;
      if (selectedTarget === 'ct') {
        const result = [ctRecordedText(now.snapshot.patientInfo), raw].filter(Boolean).join('\n\n');
        if (result.length > 60000) { setError(t('clinical.sourceTooLarge')); return; }
        const source = sourceFor(raw, ['ctReport']);
        commit({ ctReport: result, ctReportLanguage: source.language, ctReviewedBasis: '' }, source); close();
      } else {
        const consultationEnabled = now.consultationEnabled ?? now.kind === 'consultation';
        const structuredConsultation = !!now.strictTarget && selectedTarget === 'consultation';
        const routedGpExamEnabled = managed && !now.strictTarget ? !!now.gpExamEnabled : undefined;
        const result = await extractClinicalDictation({ kind: selectedTarget, transcript: raw, language: sessionLanguage.current,
          patientInfo: now.snapshot.patientInfo, consultationEnabled, imagingFocus: now.imagingFocus,
          ...(structuredConsultation ? { structuredConsultation } : {}),
          ...(routedGpExamEnabled === undefined ? {} : { routedGpExamEnabled }) });
        if (!valid(token, sourceBasis, selectedTarget)) return;
        const fields = allowedClinicalFields(selectedTarget, consultationEnabled, routedGpExamEnabled, structuredConsultation), seen = new Set<string>();
        if (!Array.isArray(result) || result.some(p => !p || !fields.includes(p.field) || seen.has(p.field)
          || (seen.add(p.field), typeof p.value !== 'string') || !p.value.trim() || p.value.length > 20000
          || typeof p.evidence !== 'string' || !p.evidence.trim() || !normalized(raw).includes(normalized(p.evidence)))) {
          setError(t('clinical.invalidResponse')); return;
        }
        const changed = result.filter(p => normalized(p.value) !== normalized(now.snapshot.patientInfo[p.field] ?? ''));
        if (now.seededTranscript && !changed.length) { close(); return; }
        reviewToken.current = token;
        setReviewBasis(sourceBasis);
        setProposals(changed.map(p => {
          const existing = normalized(now.snapshot.patientInfo[p.field] ?? '');
          return { ...p, selected: !managed || !existing || normalized(p.value).includes(existing) };
        }));
      }
    } catch (cause) { if (valid(token, sourceBasis, selectedTarget)) setError(friendlyError(cause, t('clinical.failed'))); }
    finally { if (token === epoch.current && mounted.current) { locked.current = false; setBusy(false); } }
  };
  prepareRef.current = text => { void prepare(text); };
  stopHandler.current = finalText => {
    const owner = mic.current;
    if (!owner) return;
    mic.current = null;
    if (mounted.current) setCaptureAttempt(previous => previous + 1);
    const raw = [owner.prefix, finalText].filter(Boolean).join('\n\n');
    // Keep final words visible even when a source edit invalidates automatic preparation.
    if (!mounted.current || !opened.current) return;
    setTranscript(raw);
    if (valid(owner.token, owner.basis, owner.target)) void prepare(raw);
  };
  const start = async () => {
    if (locked.current || mic.current || captureRef.current.recording || props.readOnly || !props.aiEnabled) return;
    const token = ++epoch.current, sourceBasis = basis, selectedTarget = target; requestIdentity.current = current.current.identity;
    locked.current = true; setBusy(true); setError(null); setStatus(null);
    try {
      if (!(await ensureAiConsent())) { if (valid(token, sourceBasis, selectedTarget)) setError(t('clinical.consentRequired')); return; }
      if (!valid(token, sourceBasis, selectedTarget)) return;
      sessionLanguage.current = transcript.trim() ? sessionLanguage.current ?? language() : language(); setProposals(null); setReviewBasis(null);
      mic.current = { token, basis: sourceBasis, prefix: transcript, target: selectedTarget };
      if (captureRef.current.startInLanguage) captureRef.current.startInLanguage(sessionLanguage.current);
      else captureRef.current.start();
      setCaptureAttempt(previous => previous + 1);
    } catch (cause) { if (valid(token, sourceBasis, selectedTarget)) setError(friendlyError(cause, t('clinical.failed'))); }
    finally { if (token === epoch.current && mounted.current) { locked.current = false; setBusy(false); } }
  };
  const apply = () => {
    if (locked.current || reviewToken.current !== epoch.current || props.readOnly || !props.aiEnabled || reviewBasis !== basis || !proposals || !opened.current) return;
    const selected = proposals.filter(p => p.selected && p.value.trim());
    if (!selected.length) return;
    if (selected.some(p => p.value.length > 20000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(p.value))) { setError(t('clinical.invalidResponse')); return; }
    locked.current = true;
    try { commit(Object.fromEntries(selected.map(p => [p.field, p.value])), sourceFor(transcript, selected.map(p => p.field))); }
    catch (cause) { setError(friendlyError(cause, t('clinical.failed'))); }
    finally { locked.current = false; }
  };
  const fieldLabel = (field: ClinicalDictationField) => field === 'treatmentReport' ? t('forms:report.title')
    : field === 'ctReport' ? t('app:ct.title')
      : field === 'radiographicFindings' ? t('app:radiographic.title') : t(`visitDocumentation:fields.${field}.label`);
  const copy = async (raw: string) => {
    const token = epoch.current, sourceIdentity = current.current.identity, sourceBasis = current.current.basis;
    const isCurrent = () => mounted.current && opened.current && token === epoch.current
      && sourceIdentity === current.current.identity && sourceBasis === current.current.basis;
    try {
      const outcome = await copyRichText(plainTextToHtml(raw), raw, t('clinical.copyPrompt'), isCurrent);
      if (isCurrent()) setStatus(t(outcome === 'prompt' ? 'clinical.copyPromptShown' : 'clinical.copied'));
    } catch (cause) { if (isCurrent()) setError(friendlyError(cause, t('clinical.failed'))); }
  };
  const stale = reviewBasis !== null && reviewBasis !== basis;
  const restricted = !!props.readOnly || !props.aiEnabled;
  const targetName = (kind: ClinicalDictationKind) => kind === 'imaging' ? t('app:sections.images')
    : kind === 'dental-visit' ? t('app:visitTypes.dentalAdditions') : t(`clinical.kinds.${kind}`);
  const targetLabel = targetName(target);
  const title = managed ? target === 'discharge' || target === 'consultation'
    ? t(`visitDocumentation:${target}.title`)
    : targetLabel
    : t('clinical.title', { target: targetLabel });
  const draining = !!mic.current && !capture.recording;
  const liveText = capture.recording || draining ? [mic.current?.prefix, capture.transcript].filter(Boolean).join('\n\n') : transcript;
  const content = <>
    <div className="ai-settings-body clinical-dictation__body">
      <p className="ai-settings-blurb">{t(seeded ? 'app:visitTypes.dentalAdditionsHelp' : target === 'ct' ? 'clinical.ctHelp' : target === 'imaging' ? 'clinical.imagingHelp' : 'clinical.help')}</p>
      {!managed && props.kind !== 'ct' && <label className="clinical-dictation__label">{t('clinical.target')}<select value={target} disabled={capture.recording || draining || restricted} onChange={event => {
        if (mic.current) return;
        invalidate(); setTarget(event.target.value as ClinicalDictationKind); setError(null); setStatus(null);
      }}>{kinds.filter(kind => {
        if (kind === props.kind || kind === 'discharge') return true;
        return kind === 'consultation' ? props.consultationEnabled : props.gpExamEnabled;
      }).map(kind => <option key={kind} value={kind}>{t(`clinical.kinds.${kind}`)}</option>)}</select></label>}
      <div className="clinical-dictation__tools">
        {!seeded && <button type="button" className={`clinical-dictation__record${capture.recording ? ' clinical-dictation__record--live' : ''}`}
          disabled={restricted || busy || draining || !capture.supported} onClick={() => capture.recording ? capture.stop() : void start()}>
          <Icon name={MIC_ICON} filled size={16} />{t(capture.recording ? 'clinical.stop' : 'clinical.start')}
        </button>}
        <button type="button" disabled={!liveText} onClick={() => void copy(liveText)}>{t('clinical.copyTranscript')}</button>
        <span role="status">{t(draining || busy ? 'status.finishing' : capture.recording
          ? capture.ready ? 'status.listening' : 'status.connecting'
          : liveText ? 'status.stopped' : 'status.idle')}</span>
      </div>
      {!seeded && <label className="clinical-dictation__label">{t('clinical.transcript')}<textarea rows={7} value={liveText} readOnly={capture.recording || draining || restricted} onChange={event => {
        if (mic.current) return;
        invalidate(); sessionLanguage.current = event.target.value ? sessionLanguage.current ?? language() : null; setTranscript(event.target.value); setStatus(null); setError(null);
      }}/></label>}
      {!seeded && !capture.supported && <p role="note">{t('errors.unsupported')}</p>}
      {(error || capture.error) && <p className="clinical-dictation__error" role="alert">{error || capture.error}</p>}
      {status && <p role="status">{status}</p>}
      {stale && <p role="alert">{t('clinical.stale')}</p>}
      {proposals?.length === 0 && <p role="status">{t('clinical.noSections')}</p>}
      {proposals?.map((proposal, index) => <section key={proposal.field} className="clinical-dictation__proposal">
        <label className="clinical-dictation__check"><input type="checkbox" checked={proposal.selected} disabled={restricted || stale} onChange={event => setProposals(previous => previous!.map((p, i) => i === index ? { ...p, selected: event.target.checked } : p))}/>{t('clinical.includeField', { field: fieldLabel(proposal.field) })}</label>
        {props.snapshot.patientInfo[proposal.field] && <dl className="clinical-dictation__current">
          <dt>{t('clinical.current')}</dt><dd>{props.snapshot.patientInfo[proposal.field]}</dd>
        </dl>}
        <label className="clinical-dictation__label">{t('app:refinement.proposed')}<textarea rows={3} aria-label={fieldLabel(proposal.field)} value={proposal.value} disabled={restricted || stale} onChange={event => setProposals(previous => previous!.map((p, i) => i === index ? { ...p, value: event.target.value } : p))}/></label>
        <details><summary>{t('clinical.evidence')}</summary><blockquote>{proposal.evidence}</blockquote></details>
      </section>)}
      {!!props.snapshot.clinicalDictations?.length && <details className="clinical-dictation__history"><summary>{t('clinical.sources')}</summary>
        {props.snapshot.clinicalDictations.map(source => <details key={source.id}><summary>{t('clinical.savedTranscript', { date: new Date(source.recordedAt).toLocaleString(i18n.language) })}</summary><pre>{source.transcript}</pre><button type="button" onClick={() => void copy(source.transcript)}>{t('clinical.copyTranscript')}</button></details>)}
      </details>}
      <p className="ai-settings-blurb">{t('clinical.savedWithVisit')}</p>
    </div>
    <footer className="ai-settings-footer clinical-dictation__footer">
      <button type="button" className="clinical-dictation__primary" disabled={restricted || busy || capture.recording || draining || !transcript.trim() || (target !== 'ct' && !!proposals?.length && !stale && !proposals.some(p => p.selected && p.value.trim()))}
        onClick={() => target !== 'ct' && proposals?.length && !stale ? apply() : void prepare()}>
        {t(busy ? 'clinical.preparing' : target === 'ct' ? 'clinical.ctApply' : proposals?.length && !stale ? 'clinical.apply' : 'clinical.prepare')}
      </button>
    </footer>
  </>;
  return <>
    {!managed && <button type="button" className="diagram-view__action clinical-dictation__trigger" disabled={props.disabled || restricted} onClick={show}>
      <Icon name={MIC_ICON} filled size={native ? 20 : 16} />
      <span>{t('clinical.dictate', { target: targetName(props.kind) })}</span>
    </button>}
    {visible && (native ? <Sheet open onClose={close} title={title} className="clinical-dictation">{content}</Sheet>
      : ReactDOM.createPortal(<div className="ai-settings-overlay" {...backdrop} role="dialog" aria-modal="true" aria-labelledby={heading}>
        <div className="ai-settings-modal clinical-dictation" ref={modalRef} tabIndex={-1}>
          <header className="ai-settings-header"><h2 id={heading}>{title}</h2><button type="button" className="ai-settings-close" onClick={close} aria-label={t('common:actions.close')}>×</button></header>
          {content}
        </div>
      </div>, document.body))}
  </>;
}
