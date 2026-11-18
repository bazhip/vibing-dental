import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartSnapshot, PatientInfo } from '../types';
import { APP_LANGUAGES, LANGUAGE_NAMES, isAppLanguage, type AppLanguage } from '../i18n/config';
import { ensureAiConsent } from '../native/aiConsent';
import { draftRadiologyReport } from '../utils/radiologyReportAi';
import { hasRadiologySource, isRadiologyReportReviewed, radiologyReportText, radiologyReviewBasis, radiologySourceBasis } from '../utils/radiologyReportState';
import { renderClinicalTextPdf } from '../utils/textPdf';
import { copyRichText } from '../utils/clipboard';
import { savePdf } from '../utils/savePdf';
import { supabase } from '../utils/supabaseClient';
import { friendlyError } from './ui/dialogs';
import { CodeField } from './CodeField';
import './RadiologyReportSection.css';

interface Props {
  snapshot: ChartSnapshot;
  chartId?: string | null;
  chartSession?: number;
  readOnly?: boolean;
  aiEnabled?: boolean;
  onChange: (changes: Partial<PatientInfo>) => void;
}
type Guard = { epoch: number; source: string; report: string; reviewed: string; storedLanguage: string; chartId: string | null; session: number; language: AppLanguage };
type Proposal = { body: string; guard: Guard };
const contextFields = ['radiologyHistory', 'radiologyTechnique', 'radiologyQuestion'] as const;
const reportFields = ['radiologyReport', 'radiologyReportLanguage', 'radiologyReportBasis', 'radiologyReviewedBasis', 'radiologyReportGeneratedAt'] as const;
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function RadiologyReportSection({ snapshot, chartId = null, chartSession = 0, readOnly = false, aiEnabled = false, onChange }: Props): React.ReactElement {
  const { t, i18n } = useTranslation('app');
  const info = snapshot.patientInfo;
  const source = radiologySourceBasis(snapshot), report = info.radiologyReport ?? '';
  const [language, setLanguage] = React.useState<AppLanguage>(isAppLanguage(info.radiologyReportLanguage) ? info.radiologyReportLanguage : isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en');
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<'copied' | 'downloaded' | 'shared' | 'copyPromptShown' | null>(null);
  const [undo, setUndo] = React.useState<{ previous: Partial<PatientInfo>; applied: string; source: string } | null>(null);
  const mounted = React.useRef(true), epoch = React.useRef(0), locked = React.useRef(false);
  const inputKey = [source, report, info.radiologyReviewedBasis, info.radiologyReportBasis, info.radiologyReportLanguage, readOnly, aiEnabled] as const;
  const observedInput = React.useRef(inputKey);
  if (inputKey.some((value, index) => value !== observedInput.current[index])) {
    epoch.current++; observedInput.current = inputKey;
  }
  React.useEffect(() => {
    locked.current = false; setBusy(false); setProposal(null); setError(null); setFeedback(null);
  }, [source, report, info.radiologyReviewedBasis, info.radiologyReportBasis, info.radiologyReportLanguage, readOnly, aiEnabled]);
  const current = React.useRef({ snapshot, chartId, chartSession, readOnly, aiEnabled, language });
  current.current = { snapshot, chartId, chartSession, readOnly, aiEnabled, language };
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; epoch.current++; }; }, []);
  React.useEffect(() => {
    epoch.current++; locked.current = false; setBusy(false); setProposal(null); setError(null); setFeedback(null); setUndo(null); setManualOpen(false);
    const next = current.current.snapshot.patientInfo.radiologyReportLanguage;
    setLanguage(isAppLanguage(next) ? next : isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en');
  }, [chartId, chartSession]);
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange(event => {
      if (['SIGNED_OUT', 'SIGNED_IN', 'USER_UPDATED'].includes(event)) {
        epoch.current++; locked.current = false; setBusy(false); setProposal(null); setError(null); setFeedback(null); setUndo(null);
      }
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  const storedLanguage = isAppLanguage(info.radiologyReportLanguage) ? info.radiologyReportLanguage : language;
  const reviewed = isRadiologyReportReviewed(snapshot, storedLanguage);
  const stale = !!report.trim() && info.radiologyReportBasis !== source;
  const guard = (): Guard => ({ epoch: epoch.current, source, report, reviewed: info.radiologyReviewedBasis ?? '', storedLanguage: info.radiologyReportLanguage ?? '', chartId, session: chartSession, language });
  const active = (value: Guard, editing = true) => {
    const live = current.current, data = live.snapshot.patientInfo;
    return mounted.current && value.epoch === epoch.current && (!editing || !live.readOnly)
      && live.chartId === value.chartId && live.chartSession === value.session && live.language === value.language
      && radiologySourceBasis(live.snapshot) === value.source && (data.radiologyReport ?? '') === value.report
      && (data.radiologyReviewedBasis ?? '') === value.reviewed && (data.radiologyReportLanguage ?? '') === value.storedLanguage;
  };
  const invalidate = () => { epoch.current++; setProposal(null); setFeedback(null); setError(null); setUndo(null); };
  const update = (changes: Partial<PatientInfo>) => {
    if (readOnly || busy) return;
    invalidate(); onChange({ ...changes, radiologyReviewedBasis: '' });
  };
  const generate = async () => {
    if (locked.current || readOnly || !aiEnabled || !hasRadiologySource(snapshot)) return;
    locked.current = true; setBusy(true); setError(null); setFeedback(null); setProposal(null);
    const request = guard();
    try {
      if (!(await ensureAiConsent()) || !active(request) || !current.current.aiEnabled) return;
      const body = await draftRadiologyReport(snapshot, language);
      if (!active(request) || !current.current.aiEnabled) return;
      if (!body.trim() || body.length > 60000) throw { code: 'empty' };
      setProposal({ body, guard: request });
    } catch (cause) {
      if (active(request)) setError(friendlyError(cause, t('radiologyReport.generateFailed')));
    } finally {
      if (mounted.current && request.epoch === epoch.current) { locked.current = false; setBusy(false); }
    }
  };
  const useDraft = () => {
    if (!proposal || busy || !active(proposal.guard)) return;
    const previous = Object.fromEntries(reportFields.map(field => [field, info[field] ?? ''])) as Partial<PatientInfo>;
    setUndo({ previous, applied: proposal.body, source });
    onChange({ radiologyReport: proposal.body, radiologyReportLanguage: proposal.guard.language,
      radiologyReportBasis: source, radiologyReviewedBasis: '', radiologyReportGeneratedAt: new Date().toISOString() });
    setProposal(null); setFeedback(null);
  };
  const transfer = async (format: 'copy' | 'pdf') => {
    if (locked.current || !reviewed) return;
    const request = guard(); locked.current = true; setBusy(true); setError(null); setFeedback(null);
    const stillReviewed = () => active(request, false) && isRadiologyReportReviewed(current.current.snapshot, storedLanguage);
    try {
      if (!stillReviewed()) return;
      const text = radiologyReportText(snapshot, storedLanguage);
      if (format === 'copy') {
        const result = await copyRichText(`<pre>${escapeHtml(text)}</pre>`, text, t('radiologyReport.copyPrompt'));
        if (stillReviewed()) setFeedback(result === 'prompt' ? 'copyPromptShown' : 'copied');
      } else {
        const bytes = await renderClinicalTextPdf(text, i18n.getFixedT(storedLanguage, 'app')('radiologyReport.title'));
        if (!stillReviewed()) return;
        const result = await savePdf(new Blob([bytes], { type: 'application/pdf' }), t('radiologyReport.filename'));
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
  const candidateCurrent = !!proposal && active(proposal.guard);
  return <section className="radiology-report patient-form" aria-label={t('radiologyReport.title')} aria-busy={busy}>
    <h3 className="patient-form__section-title">{t('radiologyReport.title')}</h3>
    <p className="patient-form__hint">{t('radiologyReport.description')}</p>
    <div className="radiographic-findings"><label className="patient-form__label">
      <span className="radiographic-findings__title">{t('radiographic.title')}</span>
      <CodeField multiline className="patient-form__textarea radiographic-findings__text" disabled={readOnly || busy}
        placeholder={t('radiologyReport.findingsPlaceholder')} value={info.radiographicFindings ?? ''}
        onChange={value => update({ radiographicFindings: value })} />
    </label></div>
    <details><summary>{t('radiologyReport.context')}</summary><fieldset className="radiology-report__context" disabled={readOnly || busy}>
      {contextFields.map(field => <label className="patient-form__label" key={field}>
        {t(`radiologyReport.${field}`)}<textarea rows={2} maxLength={10000} value={info[field] ?? ''} onChange={event => update({ [field]: event.target.value })} />
      </label>)}
    </fieldset></details>
    <div className="radiology-report__actions">
      <label className="patient-form__label">{t('radiologyReport.language')}<select disabled={readOnly || busy} value={language} onChange={event => {
        if (readOnly || busy) return;
        const next = event.target.value as AppLanguage; invalidate(); setLanguage(next);
        onChange({ radiologyReportLanguage: next, radiologyReviewedBasis: '' });
      }}>
        {APP_LANGUAGES.map(value => <option key={value} value={value}>{LANGUAGE_NAMES[value]}</option>)}
      </select></label>
      <button type="button" className={!reviewed && !proposal ? 'radiology-report__primary' : undefined} disabled={readOnly || busy || !aiEnabled || !hasRadiologySource(snapshot)} onClick={() => void generate()}>
        {t(busy && !reviewed ? 'radiologyReport.generating' : 'radiologyReport.generate')}
      </button>
    </div>
    {!aiEnabled && <p className="patient-form__hint">{t('radiologyReport.aiUnavailable')}</p>}
    {!hasRadiologySource(snapshot) && <p className="patient-form__hint">{t('radiologyReport.sourceRequired')}</p>}
    {proposal && <fieldset className="radiology-report__preview" disabled={readOnly || busy}>
      <label className="patient-form__label">{t('radiologyReport.preview')}<textarea rows={10} maxLength={60000} value={proposal.body} onChange={event => setProposal({ ...proposal, body: event.target.value })} /></label>
      {!candidateCurrent && <p role="status">{t('radiologyReport.previewStale')}</p>}
      <div className="radiology-report__actions"><button type="button" className="radiology-report__primary" disabled={!candidateCurrent || !proposal.body.trim()} onClick={useDraft}>{t('radiologyReport.use')}</button>
        <button type="button" onClick={() => setProposal(null)}>{t('radiologyReport.discard')}</button></div>
    </fieldset>}
    <details open={!!report || manualOpen} onToggle={event => setManualOpen(event.currentTarget.open)}>
      <summary hidden={!!report}>{t('radiologyReport.manual')}</summary>
      <label className="patient-form__label">{t('radiologyReport.body')}<textarea rows={10} maxLength={60000} value={report} disabled={readOnly || busy} onChange={event => { setManualOpen(true); update({ radiologyReport: event.target.value, radiologyReportBasis: source, radiologyReportLanguage: storedLanguage }); }} /></label>
    </details>
    {!!report.trim() && <>
    <p role="status" className="patient-form__hint">{t(reviewed ? 'radiologyReport.reviewed' : stale ? 'radiologyReport.stale' : 'radiologyReport.unreviewed')}</p>
    <label className="radiology-report__check"><input type="checkbox" disabled={readOnly || busy || !report.trim()} checked={reviewed} onChange={event => {
      if (readOnly || busy) return;
      invalidate(); onChange({ radiologyReportBasis: source, radiologyReportLanguage: storedLanguage,
        radiologyReviewedBasis: event.target.checked ? radiologyReviewBasis(snapshot, storedLanguage) : '' });
    }} />{t('radiologyReport.checked')}</label>
    <div className="radiology-report__actions">
      <button type="button" className={reviewed && !proposal ? 'radiology-report__primary' : undefined} disabled={!reviewed || busy} onClick={() => void transfer('copy')}>{t('radiologyReport.copy')}</button>
      <button type="button" disabled={!reviewed || busy} onClick={() => void transfer('pdf')}>{t('radiologyReport.pdf')}</button>
      {undo && undo.source === source && undo.applied === report && <button type="button" disabled={readOnly || busy} onClick={() => { onChange(undo.previous); setUndo(null); setFeedback(null); }}>{t('radiologyReport.undo')}</button>}
    </div>
    </>}
    {error && <p role="alert" className="radiology-report__error">{error}</p>}
    {feedback && <p role="status">{t(`radiologyReport.${feedback}`)}</p>}
  </section>;
}
