import React from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../utils/supabaseClient';
import { pimsRolloutEnabled } from '../../utils/pims/rollout';
import { createUploadReviewBackend, uploadReviewError } from '../../utils/pims/uploadReview';
import type { UploadObservationKind, UploadReviewBackend, UploadReviewError, UploadReviewItem, UploadReviewPage } from '../../utils/pims/uploadReview';
import './PimsDrafts.css';

const defaultBackend = supabase ? createUploadReviewBackend(supabase) : null;
const defaultImageBackend = supabase ? createUploadReviewBackend(supabase, 'image') : null;
const observations: UploadObservationKind[] = ['present', 'not_found', 'uncertain'];
type Props = { chartId: string | null; disabled?: boolean; backend?: UploadReviewBackend | null; kind?: 'pdf' | 'image' };

export function PimsUploadReview(props: Props): React.ReactElement | null {
  return pimsRolloutEnabled() ? <EnabledUploadReview key={JSON.stringify([props.chartId, props.kind ?? 'pdf'])} {...props} /> : null;
}

function EnabledUploadReview({ chartId, disabled = false, kind = 'pdf', backend = kind === 'image' ? defaultImageBackend : defaultBackend }: Props): React.ReactElement {
  const { t, i18n } = useTranslation('pims');
  const heading = React.useId();
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState<UploadReviewPage | null>(null);
  const [cursor, setCursor] = React.useState<string | undefined>();
  const [selected, setSelected] = React.useState<UploadReviewItem | null>(null);
  const [observation, setObservation] = React.useState<UploadObservationKind>('uncertain');
  const [note, setNote] = React.useState('');
  const [checked, setChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [reloadRequired, setReloadRequired] = React.useState(false);
  const [error, setError] = React.useState<UploadReviewError | null>(null);
  const [saved, setSaved] = React.useState(false);
  const epoch = React.useRef(0), locked = React.useRef(false);
  const current = React.useRef({ chartId, backend, disabled });
  current.current = { chartId, backend, disabled };
  const reset = React.useCallback(() => {
    epoch.current++; locked.current = false;
    setOpen(false); setPage(null); setCursor(undefined); setSelected(null); setNote(''); setChecked(false);
    setObservation('uncertain'); setBusy(false); setReloadRequired(false); setError(null); setSaved(false);
  }, []);
  React.useEffect(() => { reset(); return () => { epoch.current++; }; }, [backend, reset]);
  React.useEffect(() => { if (disabled) reset(); }, [disabled, reset]);
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') reset();
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [reset]);
  const choose = (item: UploadReviewItem | null) => {
    setSelected(item); setNote(''); setChecked(false); setObservation('uncertain'); setSaved(false);
  };
  const run = async (operation: (active: () => boolean) => Promise<void>) => {
    if (locked.current || disabled) return;
    const token = ++epoch.current;
    const active = () => epoch.current === token && current.current.chartId === chartId && current.current.backend === backend && !current.current.disabled;
    locked.current = true; setBusy(true); setError(null); setSaved(false);
    try { await operation(active); }
    catch (cause) {
      if (active()) {
        const code = uploadReviewError(cause);
        setError(code); setReloadRequired(true); setChecked(false);
        if (code === 'forbidden') { setPage(null); choose(null); }
      }
    } finally {
      if (epoch.current === token) { locked.current = false; setBusy(false); }
    }
  };
  const load = (nextCursor?: string) => run(async active => {
    setOpen(true);
    if (!chartId) return;
    if (!backend) throw { code: 'schema' };
    const next = await backend.page({ chart_id: chartId, ...(nextCursor ? { cursor: nextCursor } : {}) });
    if (!active()) return;
    setPage(next); setCursor(nextCursor); choose(next.rows[0] ?? null); setReloadRequired(false);
  });
  const validNote = note.trim().length > 0 && note.trim().length <= 200 && !/[\u0000-\u001f\u007f]/.test(note);
  const save = () => run(async active => {
    if (!chartId || !backend || !selected || reloadRequired || !checked || !validNote) return;
    await backend.observe({ chart_id: chartId, attempt_id: selected.id, expected_version: selected.review_version,
      request_id: crypto.randomUUID(), observation, note: note.trim() });
    if (!active()) return;
    const next = await backend.page({ chart_id: chartId, ...(cursor ? { cursor } : {}) });
    if (!active()) return;
    setPage(next); choose(next.rows.find(item => item.id === selected.id) ?? next.rows[0] ?? null); setSaved(true);
  });
  const date = (value: string) => new Date(value).toLocaleString(i18n.resolvedLanguage);
  const blocked = disabled || busy || reloadRequired;
  return <section className="pims-drafts" aria-labelledby={heading}>
    <div className="pims-drafts__heading">
      <h3 id={heading}>{t(kind === 'image' ? 'uploadReview.imageTitle' : 'uploadReview.title')}</h3>
      <button type="button" disabled={disabled || busy} onClick={() => open ? reset() : void load()}>{t(open ? 'uploadReview.close' : 'uploadReview.open')}</button>
    </div>
    {open && <>
      <p>{t('uploadReview.warning')}</p>
      {!chartId && <p>{t('uploadReview.saveFirst')}</p>}
      {error && <p className="pims-drafts__error" role="alert">{t(`uploadReview.errors.${error}`)}</p>}
      {saved && <p role="status">{t('uploadReview.recorded')}</p>}
      {chartId && <div className="pims-drafts__actions">
        <button type="button" disabled={disabled || busy} onClick={() => void load()}>{t('uploadReview.reload')}</button>
        {page?.next_cursor && <button type="button" disabled={blocked} onClick={() => void load(page.next_cursor!)}>{t('uploadReview.next')}</button>}
      </div>}
      {page && !page.rows.length && <p>{t('uploadReview.empty')}</p>}
      {selected && <fieldset disabled={blocked}>
        <label>{t('uploadReview.target')}
          <select value={selected.id} onChange={event => choose(page?.rows.find(item => item.id === event.target.value) ?? null)}>
            {page?.rows.map(item => <option key={item.id} value={item.id}>{t('uploadReview.option', { patient: item.patient_id, date: date(item.dispatched_at) })}</option>)}
          </select>
        </label>
        <p>{selected.kind === 'image'
          ? t('uploadReview.imageDestination', { origin: selected.identity.origin, tenant: selected.identity.tenant_id, encounter: selected.encounter_id, destination: selected.destination })
          : t('uploadReview.destination', { origin: selected.identity.origin, tenant: selected.identity.tenant_id, location: selected.location_id })}</p>
        <p>{t('uploadReview.patient', { patient: selected.patient_id })}</p>
        <p>{selected.kind === 'image' ? t('uploadReview.imageSource', { image: selected.image_id })
          : t('uploadReview.source', { draft: selected.draft_id, version: selected.draft_version })}</p>
        <p>{t('uploadReview.attempt', { attempt: selected.id })}</p>
        <p>{t('uploadReview.fingerprint', { hash: selected.content_hash })}</p>
        {selected.observation && <>
          <p>{t('uploadReview.previous', { observation: t(`uploadReview.observations.${selected.observation.observation}`), actor: selected.observation.actor_id, date: date(selected.observation.created_at) })}</p>
          <p>{selected.observation.note}</p>
        </>}
        <label>{t('uploadReview.observation')}
          <select value={observation} onChange={event => { setObservation(event.target.value as UploadObservationKind); setChecked(false); setSaved(false); }}>
            {observations.map(value => <option key={value} value={value}>{t(`uploadReview.observations.${value}`)}</option>)}
          </select>
        </label>
        <label>{t('uploadReview.note')}
          <textarea rows={2} maxLength={200} value={note} onChange={event => { setNote(event.target.value); setChecked(false); setSaved(false); }} />
        </label>
        <label className="pims-drafts__check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />{t('uploadReview.acknowledge')}</label>
        <button type="button" className="pims-drafts__primary" disabled={blocked || !checked || !validNote} onClick={() => void save()}>{t('uploadReview.save')}</button>
      </fieldset>}
    </>}
  </section>;
}
