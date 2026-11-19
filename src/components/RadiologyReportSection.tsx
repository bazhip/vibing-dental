import { RefineTextAction } from './RefineTextAction';
import { ClinicalDictationButton } from './ClinicalDictationButton';
import React from 'react';
import { ctReportChanges, ctReportSnapshot } from '../utils/ctReportState';
import { useTranslation } from 'react-i18next';
import type { ChartSnapshot, PatientInfo, ClinicalDictationSource } from '../types';
import { LANGUAGE_NAMES, isAppLanguage, type AppLanguage } from '../i18n/config';
import { ensureAiConsent } from '../native/aiConsent';
import { draftRadiologyReport } from '../utils/radiologyReportAi';
import { hasRadiologySource, radiologyEditorText, isRadiologyReportReviewed, radiologyReportText, radiologyReviewBasis, radiologySourceBasis } from '../utils/radiologyReportState';
import { renderClinicalTextPdf } from '../utils/textPdf';
import { copyRichText } from '../utils/clipboard';
import { savePdf } from '../utils/savePdf';
import { supabase } from '../utils/supabaseClient';
import { friendlyError } from './ui/dialogs';
import { CodeField } from './CodeField';
import './RadiologyReportSection.css';

interface Props {
  snapshot: ChartSnapshot;
  chartEditor?: boolean;
  preferredLanguage?: AppLanguage | null;
  onCustomizeLanguage?: () => void;
  reportKind?: 'radiology' | 'ct';
  chartId?: string | null;
  chartSession?: number;
  readOnly?: boolean;
  aiEnabled?: boolean;
  showAiNotice?: boolean;
  onDictationApply?: (changes: Partial<PatientInfo>, source: ClinicalDictationSource) => void;
  dictationDisabled?: boolean;
  dictationOpenRequest?: number | null;
  onDictationOpenChange?: (open: boolean) => void;
  refineRequest?: { id: number; language: AppLanguage };
  onChange: (changes: Partial<PatientInfo>) => void;
}
type Guard = { epoch: number; source: string; report: string; reviewed: string; storedLanguage: string; chartId: string | null; session: number; language: AppLanguage };
const reportFields = ['radiologyReport', 'radiologyReportLanguage', 'radiologyReportBasis', 'radiologyReviewedBasis', 'radiologyReportGeneratedAt'] as const;
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function RadiologyReportSection({ snapshot: originalSnapshot, chartEditor = false, preferredLanguage, onCustomizeLanguage, reportKind = 'radiology', chartId = null, chartSession = 0, readOnly = false, aiEnabled = false, showAiNotice = true, onDictationApply, dictationDisabled, dictationOpenRequest, onDictationOpenChange, refineRequest, onChange: onPatientChange }: Props): React.ReactElement {
  const { t, i18n } = useTranslation('app');
  const snapshot = reportKind === 'ct' ? ctReportSnapshot(originalSnapshot) : originalSnapshot;
  const onChange = (changes: Partial<PatientInfo>) => onPatientChange(reportKind === 'ct' ? ctReportChanges(changes) : changes);
  const reportKey = (key: 'title' | 'editorHelp' | 'editorPlaceholder' | 'filename' | 'copyPrompt') => reportKind === 'ct' ? `ctReport.${key}` as const : `radiologyReport.${key}` as const;
  const info = snapshot.patientInfo;
  const fieldId = React.useId();
  const source = radiologySourceBasis(snapshot), report = info.radiologyReport ?? '';
  const language: AppLanguage = isAppLanguage(info.radiologyReportLanguage) ? info.radiologyReportLanguage : isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en';
  const outputLanguage = preferredLanguage ?? language;
  const draft = radiologyEditorText(snapshot, language);
  const handledRequest = React.useRef<number | null>(null);
  const localRefineSerial = React.useRef(0);
  const [localRefineRequest, setLocalRefineRequest] = React.useState<{ id: number; language: AppLanguage }>();
  const requestedRefinement = refineRequest ?? localRefineRequest;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<'copied' | 'downloaded' | 'shared' | 'copyPromptShown' | null>(null);
  const [undo, setUndo] = React.useState<{ previous: Partial<PatientInfo>; applied: string; source: string } | null>(null);
  const mounted = React.useRef(true), epoch = React.useRef(0), locked = React.useRef(false);
  const inputKey = [source, report, info.radiologyReviewedBasis, info.radiologyReportBasis, info.radiologyReportLanguage, readOnly, aiEnabled, language, outputLanguage, reportKind] as const;
  const observedInput = React.useRef(inputKey);
  if (inputKey.some((value, index) => value !== observedInput.current[index])) {
    epoch.current++; observedInput.current = inputKey;
  }
  React.useEffect(() => {
    locked.current = false; setBusy(false); setError(null); setFeedback(null);
  }, [source, report, info.radiologyReviewedBasis, info.radiologyReportBasis, info.radiologyReportLanguage, readOnly, aiEnabled, language, outputLanguage, reportKind]);
  const current = React.useRef({ snapshot, chartId, chartSession, readOnly, aiEnabled, language });
  current.current = { snapshot, chartId, chartSession, readOnly, aiEnabled, language };
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; }; }, []);
  React.useEffect(() => {
    epoch.current++; locked.current = false; setBusy(false); setError(null); setFeedback(null); setUndo(null);
  }, [chartId, chartSession, reportKind]);
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange(event => {
      if (['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
        epoch.current++; locked.current = false; setBusy(false); setError(null); setFeedback(null); setUndo(null);
      }
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  const storedLanguage = isAppLanguage(info.radiologyReportLanguage) ? info.radiologyReportLanguage : language;
  const reviewed = isRadiologyReportReviewed(snapshot, storedLanguage);
  const stale = !!report.trim() && !!info.radiologyReportBasis && info.radiologyReportBasis !== source;
  const guard = (): Guard => ({ epoch: epoch.current, source, report, reviewed: info.radiologyReviewedBasis ?? '', storedLanguage: info.radiologyReportLanguage ?? '', chartId, session: chartSession, language });
  const active = (value: Guard, editing = true) => {
    const live = current.current, data = live.snapshot.patientInfo;
    return mounted.current && value.epoch === epoch.current && (!editing || !live.readOnly)
      && live.chartId === value.chartId && live.chartSession === value.session && live.language === value.language
      && radiologySourceBasis(live.snapshot) === value.source && (data.radiologyReport ?? '') === value.report
      && (data.radiologyReviewedBasis ?? '') === value.reviewed && (data.radiologyReportLanguage ?? '') === value.storedLanguage;
  };
  const invalidate = () => { epoch.current++; setFeedback(null); setError(null); setUndo(null); };
  const update = (changes: Partial<PatientInfo>) => {
    if (readOnly || busy) return;
    invalidate(); onChange({ ...changes, radiologyReviewedBasis: '' });
  };
  const applyDraft = (body: string, targetLanguage: AppLanguage) => {
    const previous = Object.fromEntries(reportFields.map(field => [field, info[field] ?? ''])) as Partial<PatientInfo>;
    // Undo of a legacy visit restores the visible combined source, not an empty editor.
    previous.radiologyReport = draft;
    previous.radiologyReportLanguage = language;
    setUndo({ previous, applied: body, source });
    onChange({ radiologyReport: body, radiologyReportLanguage: targetLanguage, radiologyReportBasis: source,
      radiologyReviewedBasis: '', radiologyReportGeneratedAt: new Date().toISOString() });
  };
  const generate = async (targetLanguage: AppLanguage = outputLanguage) => {
    if (locked.current || readOnly || !aiEnabled || !hasRadiologySource(snapshot)) return;
    locked.current = true; setBusy(true); setError(null); setFeedback(null);
    const request = guard();
    try {
      if (!(await ensureAiConsent()) || !active(request) || !current.current.aiEnabled) return;
      const requestSnapshot = { ...snapshot, patientInfo: { ...info, radiologyReport: draft } };
      const body = reportKind === 'ct' ? await draftRadiologyReport(requestSnapshot, targetLanguage, 'ct') : await draftRadiologyReport(requestSnapshot, targetLanguage);
      if (!active(request) || !current.current.aiEnabled) return;
      if (!body.trim() || body.length > 60000) throw { code: 'empty' };
      applyDraft(body, targetLanguage);
    } catch (cause) {
      if (active(request)) setError(friendlyError(cause, t('radiologyReport.refineFailed')));
    } finally {
      if (mounted.current && request.epoch === epoch.current) { locked.current = false; setBusy(false); }
    }
  };
  const generateRef = React.useRef(generate);
  generateRef.current = generate;
  React.useEffect(() => {
    if (!requestedRefinement || handledRequest.current === requestedRefinement.id) return;
    handledRequest.current = requestedRefinement.id;
    void generateRef.current(preferredLanguage ?? requestedRefinement.language);
  }, [requestedRefinement, preferredLanguage]);
  const transfer = async (format: 'copy' | 'pdf') => {
    if (locked.current || !reviewed) return;
    const request = guard(); locked.current = true; setBusy(true); setError(null); setFeedback(null);
    const stillReviewed = () => active(request, false) && isRadiologyReportReviewed(current.current.snapshot, storedLanguage);
    try {
      if (!stillReviewed()) return;
      const text = radiologyReportText(snapshot, storedLanguage, reportKind);
      if (format === 'copy') {
        const result = await copyRichText(`<pre>${escapeHtml(text)}</pre>`, text, t(reportKey('copyPrompt')));
        if (stillReviewed()) setFeedback(result === 'prompt' ? 'copyPromptShown' : 'copied');
      } else {
        const bytes = await renderClinicalTextPdf(text, i18n.getFixedT(storedLanguage, 'app')(reportKey('title')));
        if (!stillReviewed()) return;
        const result = await savePdf(new Blob([bytes], { type: 'application/pdf' }), t(reportKey('filename')));
        if (!stillReviewed()) return;
        if (result === 'unsupported') throw { code: 'unsupported' };
        if (result !== 'cancelled') setFeedback(result === 'shared' ? 'shared' : 'downloaded');
      }
    } catch (cause) {
      if (active(request, false)) {
        const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : '';
        setError(friendlyError(cause, t(code === 'font' ? 'radiologyReport.pdfFont' : code === 'limit' ? 'radiologyReport.pdfLimit' : code === 'unsupported' ? 'radiologyReport.pdfUnsupported' : 'radiologyReport.exportFailed')));
      }
    } finally {
      if (mounted.current && request.epoch === epoch.current) { locked.current = false; setBusy(false); }
    }
  };
  const chartReport = reportKind === 'ct' ? 'ct' : 'radiographic';
  const title = chartEditor ? t(`${chartReport}.title`) : t(reportKey('title'));
  const help = chartEditor ? t(`${chartReport}.hint`) : t(reportKey('editorHelp'));
  const placeholder = chartEditor ? t(`${chartReport}.placeholder`) : t(reportKey('editorPlaceholder'));
  return <section className="radiology-report patient-form" aria-labelledby={`${fieldId}-title`} aria-busy={busy}>
    <header className="radiology-report__header">
      <h2 className="patient-form__section-title" id={`${fieldId}-title`}>{title}</h2>
      <div className="radiology-report__actions radiology-report__toolbar">
        {reportKind === 'ct' && onDictationApply && aiEnabled && <ClinicalDictationButton kind="ct" snapshot={originalSnapshot}
          chartId={chartId} chartSession={chartSession} readOnly={readOnly} aiEnabled={aiEnabled}
          disabled={dictationDisabled} openRequest={dictationOpenRequest} onOpenChange={onDictationOpenChange}
          onApply={(changes, source) => {
            onDictationApply(changes, source);
            setLocalRefineRequest({ id: ++localRefineSerial.current, language: source.language });
          }} />}
        {!chartEditor && <button type="button" className={!reviewed ? 'entry-grid__button entry-grid__button--topbar radiology-report__primary' : 'diagram-view__action'}
              disabled={readOnly || busy || !aiEnabled || !hasRadiologySource(snapshot)} onClick={() => void generate()}>
              {t(busy && !reviewed ? 'radiologyReport.refining' : 'radiologyReport.refine')}
            </button>}
        {undo && undo.source === source && undo.applied === report && <button type="button" className="diagram-view__action" disabled={readOnly || busy} onClick={() => { onChange(undo.previous); setUndo(null); setFeedback(null); }}>{t('radiologyReport.undoRefine')}</button>}
      </div>
    </header>
    <div className="radiology-report__body">
      <div className="radiographic-findings radiology-report__field refine-field">
        {chartEditor ? <CodeField multiline className="patient-form__textarea radiographic-findings__text radiology-report__editor"
          aria-label={title} aria-describedby={`${fieldId}-help`} placeholder={placeholder}
          value={draft} readOnly={readOnly} onChange={text => {
            if (readOnly) return;
            invalidate();
            onChange({ radiologyReport: text, radiologyReviewedBasis: '' });
          }} />
          : <>
            <label className="visually-hidden" htmlFor={`${fieldId}-report`}>{t('radiologyReport.body')}</label>
            <textarea id={`${fieldId}-report`} className="patient-form__textarea surgery-report__textarea radiographic-findings__text radiology-report__editor"
              aria-describedby={`${fieldId}-help`} placeholder={placeholder} rows={8} maxLength={60000}
              value={draft} disabled={readOnly || busy} onChange={event => update({ radiologyReport: event.target.value,
                radiologyReportBasis: source, radiologyReportLanguage: storedLanguage })} />
          </>}
        {chartEditor && <RefineTextAction value={draft} enabled={aiEnabled} readOnly={readOnly} disabled={busy}
              language={outputLanguage} scopeKey={source} onApply={text => applyDraft(text, outputLanguage)} />}
      </div>
      <div className="radiology-report__hints" id={`${fieldId}-help`}>
        <p className="patient-form__hint">{help}</p>
        {outputLanguage !== 'en' && onCustomizeLanguage && (
          <button type="button" className="radiology-report__language-link" onClick={onCustomizeLanguage}>
            {t('radiologyReport.languageTip', { language: LANGUAGE_NAMES[outputLanguage] })}
          </button>
        )}
      </div>
    {!aiEnabled && showAiNotice && <p className="patient-form__hint">{t('radiologyReport.refineUnavailable')}</p>}
    {!!draft.trim() && <>
    {stale && <p role="status" className="patient-form__hint">{t('radiologyReport.stale')}</p>}
    <div className="radiology-report__review">
    <label className="radiology-report__check"><input type="checkbox" disabled={readOnly || busy || !draft.trim()} checked={reviewed} onChange={event => {
      if (readOnly || busy) return;
      invalidate(); onChange({ radiologyReport: draft, radiologyReportBasis: source, radiologyReportLanguage: storedLanguage,
        radiologyReviewedBasis: event.target.checked ? radiologyReviewBasis({ ...snapshot, patientInfo: { ...info, radiologyReport: draft } }, storedLanguage) : '' });
    }} />{t('radiologyReport.checked')}</label>
    <div className="radiology-report__actions">
      <button type="button" className={reviewed ? 'entry-grid__button entry-grid__button--topbar radiology-report__primary' : 'diagram-view__action'} disabled={!reviewed || busy} onClick={() => void transfer('copy')}>{t('radiologyReport.copy')}</button>
      <button type="button" className="diagram-view__action" disabled={!reviewed || busy} onClick={() => void transfer('pdf')}>{t('radiologyReport.pdf')}</button>
    </div>
    </div>
    </>}
    {chartEditor && busy && !reviewed && <p role="status" className="patient-form__hint">{t('radiologyReport.refining')}</p>}
    {error && <p role="alert" className="radiology-report__error">{error}</p>}
    {feedback && <p role="status">{t(`radiologyReport.${feedback}`)}</p>}
    </div>
  </section>;
}
