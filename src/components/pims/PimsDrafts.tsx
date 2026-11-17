import React from 'react';
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
};

export function PimsDrafts(props: PimsDraftsProps): React.ReactElement | null {
  return pimsRolloutEnabled() ? <EnabledPimsDrafts {...props} /> : null;
}

function EnabledPimsDrafts({ chartId, disabled = false, backend = defaultBackend }: PimsDraftsProps): React.ReactElement {
  const { t, i18n } = useTranslation('pims');
  const [open, setOpen] = React.useState(false);
  const [context, setContext] = React.useState<DraftContext | null>(null);
  const [selected, setSelected] = React.useState<ClinicalDraft | null>(null);
  const [kind, setKind] = React.useState<DraftKind>('history');
  const [language, setLanguage] = React.useState<AppLanguage>(isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en');
  const [body, setBody] = React.useState('');
  const [checked, setChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reloadRequired, setReloadRequired] = React.useState(false);
  const [error, setError] = React.useState<DraftError | null>(null);
  const [feedback, setFeedback] = React.useState<'copied' | 'downloaded' | null>(null);
  const epoch = React.useRef(0), locked = React.useRef(false), pendingId = React.useRef<string | null>(null);
  const current = React.useRef({ chartId, backend, disabled });
  current.current = { chartId, backend, disabled };
  const heading = React.useId();
  const reset = React.useCallback(() => {
    epoch.current++; locked.current = false; pendingId.current = null;
    setOpen(false); setContext(null); setSelected(null); setBody(''); setChecked(false);
    setBusy(false); setReloadRequired(false); setError(null); setFeedback(null);
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
        <label className="pims-drafts__check"><input type="checkbox" checked={approved || checked} disabled={!selected || dirty || stale || approved}
          onChange={(event) => setChecked(event.target.checked)} />{t('drafts.checked')}</label>
        <div className="pims-drafts__actions">
          <button type="button" className={!selected || dirty || stale ? 'pims-drafts__primary' : undefined} disabled={!body.trim() || (!!selected && !dirty && !stale)} onClick={() => void write('save')}>{t('drafts.save')}</button>
          <button type="button" className={selected && !dirty && !stale && !approved ? 'pims-drafts__primary' : undefined} disabled={!selected || !checked || dirty || stale || approved} onClick={() => void write('review')}>{t('drafts.review')}</button>
        </div>
      </fieldset>
      <div className="pims-drafts__actions">
        <button type="button" className={approved ? 'pims-drafts__primary' : undefined} disabled={blocked || !approved} onClick={() => void transfer('copy')}>{t('drafts.copy')}</button>
        <button type="button" disabled={blocked || !approved} onClick={() => void transfer('pdf')}>{t('drafts.pdf')}</button>
      </div>
      <p>{t('drafts.manual')}</p>
    </>}
    {chartId && <button type="button" disabled={busy || disabled} onClick={() => void load(true)}>{t('drafts.refresh')}</button>}
  </section>;
}
