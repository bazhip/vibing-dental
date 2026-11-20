import { friendlyError } from '../ui/dialogs';
import { draftRadiologyReport } from '../../utils/radiologyReportAi';
import { ensureAiConsent } from '../../native/aiConsent';
import type { ChartSnapshot } from '../../types';
import React from 'react';
import { isRadiologyResponse, type RadiologyResponse } from '../../extension/radiologyProtocol';
import type { PimsTransport } from '../../utils/pims/extensionBridge';
import { isInstinctSubmissionResult, type InstinctSubmissionResult } from '../../extension/pims/instinctSubmission';
import { useTranslation } from 'react-i18next';
import { APP_LANGUAGES, LANGUAGE_NAMES, isAppLanguage, type AppLanguage } from '../../i18n/config';
import { supabase } from '../../utils/supabaseClient';
import { savePdf } from '../../utils/savePdf';
import { composeDraft, createDraftBackend, draftError, draftText, renderDraftPdf } from '../../utils/pims/drafts';
import type { ClinicalDraft, DraftBackend, DraftContext, DraftError, DraftKind, DraftWrite } from '../../utils/pims/drafts';
import './PimsDrafts.css';
import { pimsRolloutEnabled } from '../../utils/pims/rollout';

const defaultBackend = supabase ? createDraftBackend(supabase) : null;
const draftKinds = ['history', 'radiology'] as const;

type PimsDraftsProps = {
  chartId: string | null; disabled?: boolean; backend?: DraftBackend | null;
  instinctUpload?: { tabId: number; transport: PimsTransport };
  radiologyTransport?: PimsTransport;
  aiEnabled?: boolean;
};

export function PimsDrafts(props: PimsDraftsProps): React.ReactElement | null {
  return pimsRolloutEnabled() ? <EnabledPimsDrafts {...props} /> : null;
}

function EnabledPimsDrafts({ chartId, disabled = false, backend = defaultBackend, instinctUpload, radiologyTransport, aiEnabled = false }: PimsDraftsProps): React.ReactElement {
  const { t, i18n } = useTranslation('pims');
  const [open, setOpen] = React.useState(false);
  const [context, setContext] = React.useState<DraftContext | null>(null);
  const [selected, setSelected] = React.useState<ClinicalDraft | null>(null);
  const [kind, setKind] = React.useState<DraftKind>('history');
  const [language, setLanguage] = React.useState<AppLanguage>(isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en');
  const [body, setBody] = React.useState('');
  const [generationError, setGenerationError] = React.useState<string | null>(null);
  const [generated, setGenerated] = React.useState<{body:string;language:AppLanguage} | null>(null);
  const [checked, setChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reloadRequired, setReloadRequired] = React.useState(false);
  const [error, setError] = React.useState<DraftError | null>(null);
  const [feedback, setFeedback] = React.useState<'copied' | 'downloaded' | null>(null);
  const [destination, setDestination] = React.useState<Extract<InstinctSubmissionResult, { state: 'prepared' }> | null>(null);
  const [destinationChecked, setDestinationChecked] = React.useState(false);
  const [submission, setSubmission] = React.useState<'blocked' | 'submitted' | 'unknown' | null>(null);
  const [radiologyTargets, setRadiologyTargets] = React.useState<Extract<RadiologyResponse, { state: 'targets' }>['targets'] | null>(null);
  const [radiologyTab, setRadiologyTab] = React.useState<number | null>(null);
  const [radiologyDestination, setRadiologyDestination] = React.useState<Extract<RadiologyResponse, { state: 'prepared' }> | null>(null);
  const [radiologyChecked, setRadiologyChecked] = React.useState(false);
  const [radiologyOutcome, setRadiologyOutcome] = React.useState<'filled' | 'blocked' | 'unknown' | null>(null);
  const radiologyCurrent = React.useRef({ transport: radiologyTransport, tabId: radiologyTab });
  radiologyCurrent.current = { transport: radiologyTransport, tabId: radiologyTab };
  const epoch = React.useRef(0), locked = React.useRef(false), pendingId = React.useRef<string | null>(null);
  const current = React.useRef({ chartId, backend, disabled, aiEnabled });
  current.current = { chartId, backend, disabled, aiEnabled };
  const heading = React.useId();
  const reset = React.useCallback(() => {
    epoch.current++; locked.current = false; pendingId.current = null;
    setGenerationError(null); setGenerated(null); setOpen(false); setContext(null); setSelected(null); setBody(''); setChecked(false);
    setBusy(false); setReloadRequired(false); setError(null); setFeedback(null);
    setGenerationError(null); setGenerated(null); setDestination(null); setDestinationChecked(false); setSubmission(null);
    setRadiologyTargets(null); setRadiologyTab(null); setRadiologyDestination(null); setRadiologyChecked(false); setRadiologyOutcome(null);
  }, []);
  React.useEffect(() => { reset(); return () => { epoch.current++; }; }, [chartId, backend, reset]);
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') reset();
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [reset]);

  const dirty = selected ? selected.body !== body || selected.language !== language : body.trim().length > 0;
  const stale = !!selected && selected.source_hash !== context?.source.hash;
  const approved = !!selected && selected.reviewed_version === selected.version && !dirty && !stale && !reloadRequired;
  const target = React.useRef(instinctUpload);
  target.current = instinctUpload;
  React.useEffect(() => {
    setGenerationError(null); setGenerated(null); setDestination(null); setDestinationChecked(false); setSubmission(null);
    setRadiologyTargets(null); setRadiologyTab(null); setRadiologyDestination(null); setRadiologyChecked(false); setRadiologyOutcome(null);
    epoch.current++; locked.current = false; setBusy(false);
  }, [body, language, selected?.id, selected?.version, instinctUpload?.tabId, instinctUpload?.transport, radiologyTransport, disabled]);
  const blocked = disabled || busy || reloadRequired;

  const run = async (operation: (active: () => boolean) => Promise<void>) => {
    if (locked.current || disabled) return;
    const token = ++epoch.current;
    const active = () => token === epoch.current && current.current.chartId === chartId
      && current.current.backend === backend && !current.current.disabled;
    locked.current = true; setBusy(true); setError(null); setFeedback(null);
    try { await operation(active); }
    catch (cause) {
      if (active()) {
        const code = draftError(cause);
        setError(code); setChecked(false);
        if (code === 'forbidden') { setContext(null); setSelected(null); setBody(''); pendingId.current = null; }
        if (!['font', 'source', 'limit'].includes(code)) setReloadRequired(true);
      }
    } finally {
      if (token === epoch.current) { locked.current = false; setBusy(false); }
    }
  };
  const choose = (draft: ClinicalDraft | null) => {
    setSelected(draft); setBody(draft?.body ?? ''); setChecked(false); setFeedback(null); setError(null);
    pendingId.current = draft?.id ?? null;
    if (draft) { setKind(draft.kind); setLanguage(draft.language); }
  };
  const load = (preserve = false) => run(async (active) => {
    setOpen(true);
    if (!chartId) return;
    if (!backend) throw { code: 'schema' };
    const next = await backend.context(chartId);
    if (!active()) return;
    setContext(next); setReloadRequired(false); setChecked(false);
    if (preserve) setSelected(next.drafts.find((item) => item.id === (selected?.id ?? pendingId.current)) ?? null);
    else choose(next.drafts[0] ?? null);
  });
  const write = (action: 'save' | 'review') => run(async (active) => {
    if (!backend || !context || !chartId || reloadRequired) return;
    const identifier = selected?.id ?? pendingId.current ?? crypto.randomUUID();
    pendingId.current = identifier;
    const base = { chart_id: chartId, draft_id: identifier, expected_version: selected?.version ?? 0, request_id: crypto.randomUUID() };
    const payload: DraftWrite = action === 'save' ? { ...base, action, kind, language, body, source_hash: context.source.hash }
      : { ...base, action };
    const saved = await backend.write(payload);
    if (!active()) return;
    choose(saved);
    setContext({ ...context, drafts: [...context.drafts.filter((item) => item.id !== saved.id), saved] });
  });
  const transfer = (format: 'copy' | 'pdf') => run(async (active) => {
    if (!approved || !selected || !backend || !chartId) return;
    const reference = { chart_id: chartId, draft_id: selected.id, expected_version: selected.version };
    const reviewed = await backend.export(reference);
    if (!active()) return;
    if (format === 'copy') {
      await navigator.clipboard.writeText(draftText(reviewed));
      if (active()) setFeedback('copied');
    } else {
      const bytes = await renderDraftPdf(reviewed);
      if (!active()) return;
      const rechecked = await backend.export(reference);
      if (!active()) return;
      if (draftText(rechecked) !== draftText(reviewed)) throw { code: 'stale' };
      const result = await savePdf(new Blob([bytes], { type: 'application/pdf' }), `ToothOps-${reviewed.kind}-${reviewed.id}.pdf`);
      if (!active()) return;
      if (result === 'unsupported') throw { code: 'unknown' };
      if (result !== 'cancelled') setFeedback('downloaded');
    }
  });

  const generateRadiology = () => run(async (active) => {
    if (!aiEnabled || kind !== 'radiology' || !backend || !chartId || !context) return;
    setGenerationError(null); setGenerated(null);
    if (!(await ensureAiConsent()) || !active() || !current.current.aiEnabled) return;
    const latest = await backend.context(chartId);
    if (!active() || !current.current.aiEnabled) return;
    if (latest.source.hash !== context.source.hash) throw { code: 'stale' };
    // Reuse the existing chart/source identity validation before sharing documented text.
    composeDraft(latest.source, 'radiology', language);
    let result: string;
    try { result = await draftRadiologyReport(latest.source.data as ChartSnapshot, language); }
    catch (cause) { if (active() && current.current.aiEnabled) setGenerationError(friendlyError(cause, t('drafts.aiRadiology.failed'))); return; }
    if (!active() || !current.current.aiEnabled) return;
    const rechecked = await backend.context(chartId);
    if (!active() || !current.current.aiEnabled) return;
    if (rechecked.source.hash !== latest.source.hash) throw { code: 'stale' };
    if (!result.trim() || result.length > 60000) throw { code: 'source' };
    setGenerated({ body: result, language });
  });

  const prepareInstinct = () => run(async (active) => {
    if (!approved || !instinctUpload?.transport.instinctSubmission) return;
    const destinationTarget = instinctUpload;
    const execute = destinationTarget.transport.instinctSubmission!;
    const result = await execute(destinationTarget.tabId, { operation: 'prepare' });
    if (!active() || target.current?.tabId !== destinationTarget.tabId || target.current?.transport !== destinationTarget.transport) return;
    setDestinationChecked(false); setSubmission(null);
    if (isInstinctSubmissionResult(result) && result.state === 'prepared' && Date.parse(result.expires_at) > Date.now()) setDestination(result);
    else { setDestination(null); setSubmission('blocked'); }
  });
  const submitInstinct = () => run(async (active) => {
    if (!approved || !selected || !backend || !chartId || !destination || !destinationChecked || submission
      || !instinctUpload?.transport.instinctSubmission || Date.parse(destination.expires_at) <= Date.now()) return;
    const destinationTarget = instinctUpload;
    const execute = destinationTarget.transport.instinctSubmission!;
    const stillActive = () => active() && target.current?.tabId === destinationTarget.tabId && target.current?.transport === destinationTarget.transport;
    const reference = { chart_id: chartId, draft_id: selected.id, expected_version: selected.version };
    const reviewed = await backend.export(reference);
    if (!stillActive()) return;
    const bytes = await renderDraftPdf(reviewed);
    if (!stillActive()) return;
    const rechecked = await backend.export(reference);
    if (!stillActive()) return;
    if (draftText(rechecked) !== draftText(reviewed)) throw { code: 'stale' };
    if (Date.parse(destination.expires_at) <= Date.now()) { setDestination(null); setSubmission('blocked'); return; }
    const id = crypto.randomUUID();
    // Once dispatch is requested, a missing receipt is an unknown outcome, never a retry invitation.
    setSubmission('unknown');
    try {
      const result = await execute(destinationTarget.tabId, {
        operation: 'submit', ticket: destination.ticket, id, expires_at: destination.expires_at,
        bytes: Array.from(bytes), label: t(`drafts.${reviewed.kind}`), recorded_at: new Date().toISOString(),
        location_id: destination.location_id, is_shared: false,
        source: { chartId, draftId: selected.id, version: selected.version },
      });
      if (!stillActive()) return;
      setSubmission(isInstinctSubmissionResult(result) && result.state === 'blocked' ? 'blocked'
        : isInstinctSubmissionResult(result) && result.state === 'submitted' && result.id === id ? 'submitted' : 'unknown');
    } catch { if (stillActive()) setSubmission('unknown'); }
  });

  const listRadiology = () => run(async (active) => {
    if (!approved || selected?.kind !== 'radiology' || !radiologyTransport?.radiologyAutofill) return;
    const transport = radiologyTransport;
    setRadiologyTargets(null); setRadiologyTab(null); setRadiologyDestination(null); setRadiologyChecked(false); setRadiologyOutcome(null);
    try {
      const result = await transport.radiologyAutofill!({ operation: 'list' });
      if (!active() || radiologyCurrent.current.transport !== transport) return;
      if (isRadiologyResponse(result) && result.state === 'targets') setRadiologyTargets(result.targets);
      else setRadiologyOutcome('blocked');
    } catch { if (active()) setRadiologyOutcome('blocked'); }
  });
  const prepareRadiology = (value: string) => {
    const tabId = value === '' ? null : Number(value);
    setRadiologyTab(tabId); setRadiologyDestination(null); setRadiologyChecked(false); setRadiologyOutcome(null);
    if (tabId === null) return;
    void run(async (active) => {
      const candidate = radiologyTargets?.find(item => item.tabId === tabId);
      if (!approved || selected?.kind !== 'radiology' || !candidate || !radiologyTransport?.radiologyAutofill) return;
      const transport = radiologyTransport;
      try {
        const result = await transport.radiologyAutofill!({ operation: 'prepare', tabId });
        if (!active() || radiologyCurrent.current.transport !== transport || radiologyCurrent.current.tabId !== tabId) return;
        if (isRadiologyResponse(result) && result.state === 'prepared' && result.provider === candidate.provider
          && result.origin === candidate.origin && Date.parse(result.expires_at) > Date.now()) setRadiologyDestination(result);
        else setRadiologyOutcome('blocked');
      } catch { if (active()) setRadiologyOutcome('blocked'); }
    });
  };
  const fillRadiology = () => run(async (active) => {
    if (!approved || selected?.kind !== 'radiology' || !backend || !chartId || radiologyTab === null
      || !radiologyDestination || !radiologyChecked || radiologyOutcome || !radiologyTransport?.radiologyAutofill) return;
    const transport = radiologyTransport, tabId = radiologyTab, destination = radiologyDestination;
    const stillActive = () => active() && radiologyCurrent.current.transport === transport && radiologyCurrent.current.tabId === tabId;
    if (Date.parse(destination.expires_at) <= Date.now()) { setRadiologyOutcome('blocked'); return; }
    const reference = { chart_id: chartId, draft_id: selected.id, expected_version: selected.version };
    const reviewed = await backend.export(reference);
    if (!stillActive()) return;
    const text = draftText(reviewed);
    const rechecked = await backend.export(reference);
    if (!stillActive()) return;
    if (reviewed.kind !== 'radiology' || rechecked.kind !== 'radiology' || text !== draftText(rechecked)) throw { code: 'stale' };
    if (Date.parse(destination.expires_at) <= Date.now()) { setRadiologyOutcome('blocked'); return; }
    setRadiologyOutcome('unknown');
    try {
      const result = await transport.radiologyAutofill!({ operation: 'fill', tabId, ticket: destination.ticket, text });
      if (!stillActive()) return;
      setRadiologyOutcome(isRadiologyResponse(result) && (result.state === 'filled' || result.state === 'blocked') ? result.state : 'unknown');
    } catch { if (stillActive()) setRadiologyOutcome('unknown'); }
  });

  if (!open) return <div className="pims-drafts"><button type="button" disabled={disabled} onClick={() => void load()}>{t('drafts.open')}</button></div>;
  return <section className="pims-drafts" aria-labelledby={heading} aria-busy={busy}>
    <div className="pims-drafts__heading"><h3 id={heading}>{t('drafts.title')}</h3>
      <button type="button" disabled={busy} onClick={reset}>{t('drafts.close')}</button></div>
    <p>{t('drafts.description')}</p>
    {!chartId && <p role="status">{t('drafts.unsaved')}</p>}
    {busy && !context && <p role="status">{t('drafts.loading')}</p>}
    {error && <p className="pims-drafts__error" role="alert">{t(`drafts.errors.${error}`)}</p>}
    {feedback && <p role="status">{t(`drafts.${feedback}`)}</p>}
    {context && <>
      <p className="pims-drafts__source">{t('drafts.attribution', { patient: context.source.patient_name, number: context.source.patient_number,
        date: context.source.chart_date, chart: context.source.chart_id, revision: context.source.updated_at })}</p>
      <fieldset disabled={blocked}>
        <label>{t('drafts.saved')}<select value={selected?.id ?? ''} disabled={dirty} onChange={(event) => choose(context.drafts.find((item) => item.id === event.target.value) ?? null)}>
          <option value="">{t('drafts.new')}</option>
          {context.drafts.map((item, index) => <option key={item.id} value={item.id}>{t(`drafts.${item.kind}`)} · {LANGUAGE_NAMES[item.language]} · {index + 1}</option>)}
        </select></label>
        <div className="pims-drafts__fields">
          <label>{t('drafts.kind')}<select value={kind} disabled={!!selected} onChange={(event) => { setKind(event.target.value as DraftKind); setChecked(false); }}>
            {draftKinds.map((value) => <option key={value} value={value}>{t(`drafts.${value}`)}</option>)}
          </select></label>
          <label>{t('drafts.language')}<select value={language} onChange={(event) => { setLanguage(event.target.value as AppLanguage); setChecked(false); }}>
            {APP_LANGUAGES.map((value) => <option key={value} value={value}>{LANGUAGE_NAMES[value]}</option>)}
          </select></label>
        </div>
        <button type="button" disabled={!!body.trim()} onClick={() => {
          try { setBody(composeDraft(context.source, kind, language)); setChecked(false); }
          catch (cause) { setError(draftError(cause)); }
        }}>{t('drafts.compose')}</button>
        <label>{t('drafts.body')}<textarea rows={9} maxLength={60000} value={body} onChange={(event) => { setBody(event.target.value); setChecked(false); setFeedback(null); }} /></label>
        <p role="status">{t(stale ? 'drafts.stale' : approved ? 'drafts.reviewed' : 'drafts.unreviewed')}</p>
        <label className="choice-row">
          <input type="checkbox" checked={approved || checked} disabled={!selected || dirty || stale || approved}
            onChange={(event) => setChecked(event.target.checked)} />
          <span>{t('drafts.checked')}</span>
        </label>
        <div className="pims-drafts__actions">
          <button type="button" className={!generated && (!selected || dirty || stale) ? 'pims-drafts__primary' : undefined} disabled={!body.trim() || (!!selected && !dirty && !stale)} onClick={() => void write('save')}>{t('drafts.save')}</button>
          <button type="button" className={!generated && selected && !dirty && !stale && !approved ? 'pims-drafts__primary' : undefined} disabled={!selected || !checked || dirty || stale || approved} onClick={() => void write('review')}>{t('drafts.review')}</button>
        </div>
      </fieldset>
      {aiEnabled && kind === 'radiology' && <>
        <button type="button" disabled={blocked} onClick={() => void generateRadiology()}>{t('drafts.aiRadiology.generate')}</button>
        {generationError && <p className="pims-drafts__error" role="alert">{generationError}</p>}
        {generated && <fieldset disabled={blocked}>
          <label>{t('drafts.aiRadiology.preview')}<textarea rows={8} maxLength={60000} value={generated.body} onChange={event => setGenerated({ ...generated, body: event.target.value })} /></label>
          <p>{t('drafts.aiRadiology.hint')}</p>
          <div className="pims-drafts__actions"><button type="button" className="pims-drafts__primary" disabled={!generated.body.trim()} onClick={() => {
            setBody(generated.body); setLanguage(generated.language); setChecked(false); setFeedback(null); setGenerated(null);
          }}>{t('drafts.aiRadiology.use')}</button><button type="button" onClick={() => setGenerated(null)}>{t('drafts.aiRadiology.discard')}</button></div>
        </fieldset>}
      </>}
      <div className="pims-drafts__actions">
        <button type="button" className={approved && !destination && radiologyTargets === null && !generated ? 'pims-drafts__primary' : undefined} disabled={blocked || !approved} onClick={() => void transfer('copy')}>{t('drafts.copy')}</button>
        <button type="button" disabled={blocked || !approved} onClick={() => void transfer('pdf')}>{t('drafts.pdf')}</button>
      </div>
      <p>{t('drafts.manual')}</p>
      {approved && !destination && selected?.kind === 'radiology' && radiologyTransport?.radiologyAutofill && <>
        {(!radiologyDestination || radiologyOutcome === 'blocked') && radiologyOutcome !== 'unknown' && radiologyOutcome !== 'filled'
          && <button type="button" disabled={blocked} onClick={() => void listRadiology()}>{t('drafts.radiologyAutofill.review')}</button>}
        {radiologyTargets && radiologyTargets.length === 0 && <p role="status">{t('drafts.radiologyAutofill.empty')}</p>}
        {!!radiologyTargets?.length && <label>{t('drafts.radiologyAutofill.destination')}<select value={radiologyTab ?? ''}
          disabled={blocked || radiologyOutcome === 'unknown' || radiologyOutcome === 'filled'} onChange={event => prepareRadiology(event.target.value)}>
          <option value="">{t('drafts.radiologyAutofill.choose')}</option>
          {radiologyTargets.map(item => <option key={item.tabId} value={item.tabId}>{t('drafts.radiologyAutofill.option', {
            provider: t(`drafts.radiologyAutofill.providers.${item.provider}`), title: item.title || item.origin,
          })}</option>)}
        </select></label>}
        {radiologyDestination && <fieldset disabled={blocked || !!radiologyOutcome}>
          <p>{t('drafts.radiologyAutofill.summary', { origin: radiologyDestination.origin, title: radiologyDestination.title })}</p>
          <p>{t('drafts.radiologyAutofill.append', { length: radiologyDestination.existing_characters })}</p>
          {!radiologyOutcome && <>
            <label className="choice-row">
              <input type="checkbox" checked={radiologyChecked} onChange={event => setRadiologyChecked(event.target.checked)} />
              <span>{t('drafts.radiologyAutofill.checked')}</span>
            </label>
            <button type="button" className="pims-drafts__primary" disabled={!radiologyChecked} onClick={() => void fillRadiology()}>{t('drafts.radiologyAutofill.fill')}</button>
          </>}
        </fieldset>}
        {radiologyOutcome && <p role="status">{t(`drafts.radiologyAutofill.${radiologyOutcome}`)}</p>}
      </>}
      {approved && radiologyTargets === null && radiologyOutcome === null && instinctUpload?.transport.instinctSubmission && <>
        {!destination && <button type="button" disabled={blocked} onClick={() => void prepareInstinct()}>{t('drafts.instinct.prepare')}</button>}
        {destination && <fieldset disabled={blocked || submission === 'submitted' || submission === 'unknown'}>
          <p>{t('drafts.instinct.destination', { origin: destination.origin, patient: destination.patient_id, location: destination.location_id })}</p>
          <p>{t('drafts.instinct.compatibility')}</p>
          {!submission && <>
            <label className="choice-row">
              <input type="checkbox" checked={destinationChecked} onChange={(event) => setDestinationChecked(event.target.checked)} />
              <span>{t('drafts.instinct.checked')}</span>
            </label>
            <button type="button" className="pims-drafts__primary" disabled={!destinationChecked} onClick={() => void submitInstinct()}>{t('drafts.instinct.submit')}</button>
          </>}
        </fieldset>}
        {submission && <p role="status">{t(`drafts.instinct.${submission}`)}</p>}
      </>}
    </>}
    {chartId && <button type="button" disabled={busy || disabled} onClick={() => void load(true)}>{t('drafts.refresh')}</button>}
  </section>;
}
