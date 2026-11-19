import React from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../utils/supabaseClient';
import { formatDateTime } from '../../i18n/format';
import { canAcceptSchedule, createReviewBackend, reviewError } from '../../utils/pims/review';
import type { ReviewBackend, ReviewCollection, ReviewConnection, ReviewIssue, ReviewPage, ReviewVisit } from '../../utils/pims/review';
import './PimsReview.css';
import { pimsRolloutEnabled } from '../../utils/pims/rollout';

const defaultBackend = supabase ? createReviewBackend(supabase) : null;
const reasons = ['status_requires_review','patient_unlinked','clinician_unlinked','link_version','visit_version','identity_changed','archived_requires_review','status_unknown'] as const;
const identityFields = ['patient_id', 'clinician_id', 'encounter_id'] as const;
const collections = ['active', 'archived', 'issues'] as const;

type PimsReviewProps = { practiceId?: string; backend?: ReviewBackend | null };

export function PimsReview(props: PimsReviewProps): React.ReactElement | null {
  return pimsRolloutEnabled() ? <EnabledPimsReview {...props} /> : null;
}

function EnabledPimsReview({ practiceId, backend = defaultBackend }: PimsReviewProps): React.ReactElement {
  const { t } = useTranslation('pims');
  const [open, setOpen] = React.useState(false);
  const [connections, setConnections] = React.useState<ReviewConnection[]>([]);
  const [connection, setConnection] = React.useState('');
  const [collection, setCollection] = React.useState<ReviewCollection>('active');
  const [page, setPage] = React.useState<ReviewPage>({ rows: [], next_cursor: null });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<ReturnType<typeof reviewError> | null>(null);
  const [selection, setSelection] = React.useState<{ visit: ReviewVisit; action: 'archive' | 'restore' } | null>(null);
  const [reason, setReason] = React.useState('');
  const [scope, setScope] = React.useState(practiceId);
  const sequence = React.useRef(0), locked = React.useRef(false), reasonInput = React.useRef<HTMLInputElement>(null);
  const cursors = React.useRef(new Set<string>());
  const scopeRef = React.useRef(practiceId);
  scopeRef.current = practiceId;
  const sectionId = React.useId();

  React.useEffect(() => () => { sequence.current++; }, []);
  React.useEffect(() => {
    sequence.current++;
    locked.current = false;
    setBusy(false); setOpen(false); setConnections([]); setConnection(''); setPage({ rows: [], next_cursor: null }); setSelection(null); setError(null); setScope(practiceId);
  }, [practiceId, backend]);
  React.useEffect(() => { if (selection) reasonInput.current?.focus(); }, [selection]);

  const load = async (selectedConnection: string, selectedCollection: ReviewCollection, append = false) => {
    if (!backend || locked.current) return;
    const request = ++sequence.current, requestedScope = practiceId;
    locked.current = true; setBusy(true); setError(null); setSelection(null);
    const cursor = append ? page.next_cursor : null;
    if (!append) { cursors.current.clear(); setPage({ rows: [], next_cursor: null }); }
    try {
      const result = await backend.page({ connection_id: selectedConnection, collection: selectedCollection, ...(cursor ? { cursor } : {}) });
      if (request !== sequence.current || scopeRef.current !== requestedScope) return;
      if (result.next_cursor && (result.next_cursor === cursor || cursors.current.has(result.next_cursor))) throw { code: 'unknown' };
      if (result.next_cursor) cursors.current.add(result.next_cursor);
      setPage((previous) => ({ ...result, rows: append ? [...previous.rows, ...result.rows.filter((row) => !previous.rows.some((existing) => existing.id === row.id))] : result.rows }));
    } catch (cause) {
      if (request === sequence.current && scopeRef.current === requestedScope) { setError(reviewError(cause)); setPage({ rows: [], next_cursor: null }); }
    } finally {
      if (request === sequence.current) { locked.current = false; setBusy(false); }
    }
  };
  const start = async () => {
    if (locked.current) return;
    setOpen(true); setError(null);
    if (!backend) { setError('schema'); return; }
    const request = ++sequence.current, requestedScope = practiceId;
    locked.current = true; setBusy(true);
    try {
      const available = await backend.connections(practiceId);
      if (request !== sequence.current || scopeRef.current !== requestedScope) return;
      setConnections(available); setScope(practiceId); setCollection('active'); setConnection(available[0]?.id ?? '');
      locked.current = false; setBusy(false);
      if (available[0]) await load(available[0].id, 'active');
    } catch (cause) {
      if (request === sequence.current && scopeRef.current === requestedScope) setError(reviewError(cause));
    } finally {
      if (request === sequence.current) { locked.current = false; setBusy(false); }
    }
  };
  const mutate = async (operation: () => Promise<unknown>) => {
    if (locked.current) return;
    const request = ++sequence.current, requestedScope = practiceId;
    locked.current = true; setBusy(true); setError(null);
    try {
      await operation();
      if (request !== sequence.current || scopeRef.current !== requestedScope) return;
      locked.current = false; setBusy(false); setSelection(null);
      await load(connection, collection);
    } catch (cause) {
      if (request === sequence.current && scopeRef.current === requestedScope) { setError(reviewError(cause)); setPage({ rows: [], next_cursor: null }); setSelection(null); }
    } finally {
      if (request === sequence.current) { locked.current = false; setBusy(false); }
    }
  };
  const summary = (value: Record<string, unknown>) => <dl className="pims-review__facts">
    {identityFields.map((field) => <React.Fragment key={field}><dt>{t(`review.fields.${field}`)}</dt><dd>{typeof value[field] === 'string' ? value[field] : t('review.notAvailable')}</dd></React.Fragment>)}
    <dt>{t('review.fields.schedule')}</dt><dd>{typeof value.starts_at === 'string' && Number.isFinite(Date.parse(value.starts_at)) ? formatDateTime(value.starts_at) : t('review.notAvailable')}
      {typeof value.ends_at === 'string' && Number.isFinite(Date.parse(value.ends_at)) ? ` – ${formatDateTime(value.ends_at)}` : null}</dd>
  </dl>;
  const visible = open && scope === practiceId;
  return <section className="pims-review" aria-labelledby={sectionId}>
    <h3 id={sectionId}>{t('review.title')}</h3>
    <p>{t('review.description')}</p>
    {!visible ? <button type="button" onClick={() => void start()}>{t('review.open')}</button> : <>
      <div className="pims-review__actions"><button type="button" disabled={busy} onClick={() => void (connection ? load(connection, collection) : start())}>{t('review.refresh')}</button>
        <button type="button" disabled={busy} onClick={() => { sequence.current++; setOpen(false); setPage({ rows: [], next_cursor: null }); setSelection(null); }}>{t('review.close')}</button></div>
      {error && <p role="alert">{t(`review.errors.${error}`)}</p>}
      {busy && <p role="status">{t('review.loading')}</p>}
      {!busy && !error && !connections.length && <p>{t('review.noConnections')}</p>}
      {connections.length > 0 && <>
        <label>{t('review.connection')}<select disabled={busy} value={connection} onChange={(event) => { setConnection(event.target.value); void load(event.target.value, collection); }}>
          {connections.map((entry) => <option key={entry.id} value={entry.id}>{entry.practice_name} · {entry.provider} · {entry.tenant_id}</option>)}</select></label>
        <p className="pims-review__hint">{t('review.captureUnavailable')}</p>
        <div className="pims-review__actions" role="group" aria-label={t('review.filters')}>
          {collections.map((value) => <button type="button" key={value} aria-pressed={value === collection} disabled={busy} onClick={() => { setCollection(value); void load(connection, value); }}>{t(`review.${value}`)}</button>)}
        </div>
        {!busy && !error && !page.rows.length && <p>{t('review.empty')}</p>}
        <ul className="pims-review__rows">{page.rows.map((row) => <li key={row.id}>
          <h4>{row.appointment_id}</h4>
          {'proposed' in row ? <>
            <p>{t(`review.reasons.${reasons.find((known) => known === row.reason) ?? 'other'}`)}</p>
            <div className="pims-review__comparison"><div><h5>{t('review.current')}</h5>{row.current ? summary({ ...row.current }) : <p>{t('review.notAvailable')}</p>}</div><div><h5>{t('review.proposed')}</h5>{summary(row.proposed)}</div></div>
            <p className="pims-review__hint">{t('review.identityWarning')}</p>
            <div className="pims-review__actions"><button type="button" disabled={busy} onClick={() => void mutate(() => backend!.resolve({ connection_id: connection, issue_id: row.id, request_id: crypto.randomUUID(), expected_version: row.current?.version ?? 0, action: 'retain' }))}>{t('review.retain')}</button>
              {canAcceptSchedule(row as ReviewIssue) && <button type="button" disabled={busy} onClick={() => void mutate(() => backend!.resolve({ connection_id: connection, issue_id: row.id, request_id: crypto.randomUUID(), expected_version: row.current!.version, action: 'accept_schedule' }))}>{t('review.accept')}</button>}</div>
          </> : <>
            {summary({ ...row })}
            {row.archived_at && <p>{t('review.archivedOn', { date: formatDateTime(row.archived_at) })} {row.archive_kind === 'source' ? t('review.sourceArchive') : row.archive_reason}</p>}
            {selection?.visit.id === row.id ? <form onSubmit={(event) => { event.preventDefault(); if (reason.trim()) void mutate(() => backend!.visit({ connection_id: connection, visit_id: row.id, expected_version: row.version, request_id: crypto.randomUUID(), action: selection.action, reason: reason.trim() })); }}>
              <label>{t('review.reason')}<input ref={reasonInput} value={reason} maxLength={200} required disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
              <div className="pims-review__actions"><button type="submit" disabled={busy || !reason.trim()}>{t(selection.action === 'archive' ? 'review.confirmArchive' : 'review.confirmRestore')}</button><button type="button" disabled={busy} onClick={() => setSelection(null)}>{t('review.cancel')}</button></div>
            </form> : <button type="button" disabled={busy} onClick={() => { setReason(''); setSelection({ visit: row, action: row.archived_at ? 'restore' : 'archive' }); }}>{t(row.archived_at ? 'review.restore' : 'review.archive')}</button>}
          </>}
        </li>)}</ul>
        {page.next_cursor && <button type="button" disabled={busy} onClick={() => void load(connection, collection, true)}>{t('review.more')}</button>}
      </>}
    </>}
  </section>;
}
