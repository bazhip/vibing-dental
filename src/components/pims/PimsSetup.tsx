import React from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../utils/supabaseClient';
import { pimsRolloutEnabled } from '../../utils/pims/rollout';
import { createSetupBackend, CONFIGURED_SYNC_PROVIDERS, SETUP_PROVIDERS, setupError, setupRowKey } from '../../utils/pims/setup';
import type { SetupBackend, SetupChart, SetupCollection, SetupContext, SetupError, SetupPage } from '../../utils/pims/setup';
import type { PimsId } from '../../extension/pims/types';
import { dayBounds } from '../../extension/pims/shared';
import { externalTransport } from '../../utils/pims/extensionBridge';
import { runBrowserSync } from '../../utils/pims/browserSync';
import './PimsReview.css';

const defaultBackend = supabase ? createSetupBackend(supabase) : null;
type Props = { practiceId: string; owner: boolean; members?: { userId: string; label: string }[]; backend?: SetupBackend | null };
type Pending = { description: string; apply: () => Promise<unknown> };
const collections: SetupCollection[] = ['patients', 'clinicians', 'charts'];

export function PimsSetup(props: Props): React.ReactElement | null {
  return pimsRolloutEnabled() && props.owner ? <EnabledPimsSetup key={props.practiceId} {...props} /> : null;
}

function EnabledPimsSetup({ practiceId, members = [], backend = defaultBackend }: Props): React.ReactElement {
  const { t } = useTranslation('pims');
  const [open, setOpen] = React.useState(false);
  const [context, setContext] = React.useState<SetupContext | null>(null);
  const [connection, setConnection] = React.useState('');
  const [collection, setCollection] = React.useState<SetupCollection>('patients');
  const [page, setPage] = React.useState<SetupPage>({ rows: [], next_cursor: null });
  const [busy, setBusy] = React.useState(false), [blocked, setBlocked] = React.useState(false);
  const [error, setError] = React.useState<SetupError | null>(null);
  const [userConfirmed, setUserConfirmed] = React.useState(false);
  const [reviewedTab, setReviewedTab] = React.useState<{ id: number; title: string } | null>(null);
  const [syncDate, setSyncDate] = React.useState(''), [syncNotice, setSyncNotice] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false), [provider, setProvider] = React.useState<PimsId>('ezyvet');
  const [origin, setOrigin] = React.useState(''), [tenant, setTenant] = React.useState('');
  const [externalId, setExternalId] = React.useState(''), [memberId, setMemberId] = React.useState(''), [reason, setReason] = React.useState('');
  const [chart, setChart] = React.useState<SetupChart | null>(null), [pending, setPending] = React.useState<Pending | null>(null);
  const sequence = React.useRef(0), locked = React.useRef(false), cursors = React.useRef(new Set<string>());
  const confirmation = React.useRef<HTMLButtonElement>(null);
  const sectionId = React.useId();
  React.useEffect(() => { confirmation.current?.focus(); }, [pending]);
  const reset = React.useCallback(() => {
    sequence.current++;
    setOpen(false); setContext(null); setPending(null); setPage({ rows: [], next_cursor: null });
    setConnection(''); setChart(null); setBusy(false); locked.current = false;
    setBlocked(false); setError(null); setCreating(false); setProvider('ezyvet'); setOrigin(''); setTenant('');
    setExternalId(''); setMemberId(''); setReason(''); setCollection('patients'); cursors.current.clear();
    setSyncDate(''); setSyncNotice(null); setUserConfirmed(false); setReviewedTab(null);
  }, []);
  React.useEffect(() => {
    reset();
    return () => { sequence.current++; };
  }, [backend, reset]);
  React.useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') reset();
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [reset]);

  const load = async (selected = connection, view = collection, append = false) => {
    if (locked.current) return;
    setOpen(true); setError(null); setPending(null); setChart(null); setUserConfirmed(false); setReviewedTab(null);
    if (!backend) { setError('schema'); return; }
    const request = ++sequence.current;
    locked.current = true; setBusy(true);
    const cursor = append ? page.next_cursor : null;
    if (!append) { setPage({ rows: [], next_cursor: null }); cursors.current.clear(); }
    try {
      const saved = await backend.context(practiceId);
      if (request !== sequence.current) return;
      const current = saved.connections.find((entry) => entry.id === selected) ?? saved.connections[0];
      if (current?.id !== connection) setSyncNotice(null);
      setContext(saved); setConnection(current?.id ?? ''); setCollection(view);
      const result = current ? await backend.page({ connection_id: current.id, collection: view, ...(cursor ? { cursor } : {}) }) : { rows: [], next_cursor: null };
      if (request !== sequence.current) return;
      if (result.next_cursor && (cursors.current.has(result.next_cursor) || result.next_cursor === cursor)) throw { code: 'unknown' };
      if (result.next_cursor) cursors.current.add(result.next_cursor);
      setPage((previous) => ({ ...result, rows: append ? [...previous.rows, ...result.rows.filter((row) => !previous.rows.some((prior) => setupRowKey(prior) === setupRowKey(row)))] : result.rows }));
      setBlocked(false);
    } catch (cause) {
      if (request === sequence.current) { setError(setupError(cause)); setBlocked(true); setPage({ rows: [], next_cursor: null }); }
    } finally {
      if (request === sequence.current) { locked.current = false; setBusy(false); }
    }
  };
  const apply = async () => {
    if (!pending || locked.current || blocked) return;
    const request = ++sequence.current, operation = pending.apply;
    locked.current = true; setBusy(true); setError(null); setPending(null);
    try {
      await operation();
      if (request !== sequence.current) return;
      setCreating(false); setExternalId(''); setMemberId(''); setReason('');
      locked.current = false; setBusy(false);
      await load();
    } catch (cause) {
      if (request === sequence.current) { setError(setupError(cause)); setBlocked(true); }
    } finally {
      if (request === sequence.current) { locked.current = false; setBusy(false); }
    }
  };
  const reviewLink = (event: React.FormEvent) => {
    event.preventDefault();
    if (!backend || !connection || !externalId.trim() || locked.current || blocked) return;
    const identifier = externalId.trim();
    if (collection === 'patients') {
      const input = { connection_id: connection, patient_id: identifier, patient_key: crypto.randomUUID() };
      setPending({ description: identifier, apply: () => backend.patient(input) });
    } else if (collection === 'clinicians' && context?.members.some((member) => member.user_id === memberId)) {
      const input = { connection_id: connection, clinician_id: identifier, user_id: memberId };
      setPending({ description: `${identifier} → ${members.find((member) => member.userId === memberId)?.label ?? memberId}`, apply: () => backend.clinician(input) });
    } else if (collection === 'charts' && chart && reason.trim()) {
      const input = { connection_id: connection, patient_id: identifier, chart_id: chart.chart_id, expected_version: chart.version,
        source_hash: chart.source_hash, request_id: crypto.randomUUID(), reason: reason.trim() };
      setPending({ description: `${chart.patient_name} · ${chart.patient_number} · ${chart.chart_id}: ${chart.patient_id ?? t('setup.unlinked')} → ${identifier}`, apply: () => backend.linkChart(input) });
    }
  };
  const disabled = busy || blocked || !!pending;
  const current = context?.connections.find((entry) => entry.id === connection);
  const configured = !!current && CONFIGURED_SYNC_PROVIDERS.includes(current.provider);
  const configuredActive = configured && current?.state === 'active' && current.binding_mode === 'user_confirmed';
  const reviewPimsTab = async () => {
    if (!current || !configured || current.state === 'disabled' || locked.current || disabled) return;
    const request = ++sequence.current;
    locked.current = true; setBusy(true); setError(null); setSyncNotice(null); setUserConfirmed(false); setReviewedTab(null);
    try {
      const result = await externalTransport.inspect();
      if (request !== sequence.current) return;
      if (!result?.tab || !Number.isSafeInteger(result.tab.id) || result.tab.id < 0 || typeof result.tab.title !== 'string'
        || !result.tab.title.trim() || result.tab.title.length > 2000 || result.status?.provider !== current.provider) throw { code: 'invalid' };
      setReviewedTab({ id: result.tab.id, title: result.tab.title });
    } catch (cause) {
      if (request === sequence.current) { setError(setupError(cause)); setReviewedTab(null); setUserConfirmed(false); }
    } finally {
      if (request === sequence.current) { locked.current = false; setBusy(false); }
    }
  };
  const browserSync = async (verify: boolean) => {
    if (!current || !supabase || locked.current || disabled || current.state === 'disabled' || configured && (!userConfirmed || !reviewedTab)) return;
    const bounds = dayBounds(syncDate);
    if (!verify && !bounds) { setError('invalid'); return; }
    const request = ++sequence.current;
    locked.current = true; setBusy(true); setError(null); setSyncNotice(null);
    try {
      const result = await runBrowserSync({ connection: current, client: supabase, transport: externalTransport,
        alive: () => sequence.current === request,
        ...(configured ? { userConfirmed: true, reviewedTabId: reviewedTab!.id } : {}),
        ...(!verify && bounds ? { scope: { requested_date: syncDate, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, window_start: bounds.start, window_end: bounds.end } } : {}) });
      if (request !== sequence.current) return;
      if (result?.state === 'blocked') throw { code: 'invalid' };
      setSyncNotice(result ? t('setup.syncResult', { saved: result.outcomes.filter((row) => row.outcome === 'applied').length,
        review: result.outcomes.filter((row) => row.outcome === 'skipped' || row.outcome === 'conflict').length, failed: result.failures.length }) : t(configured ? 'setup.configuredConfirmed' : 'setup.verified'));
      if (result?.state === 'interrupted') throw { code: 'conflict' };
      locked.current = false; setBusy(false);
      await load();
    } catch (cause) {
      if (request === sequence.current) { setError(setupError(cause)); setBlocked(true); }
    } finally {
      if (request === sequence.current) { locked.current = false; setBusy(false); setUserConfirmed(false); setReviewedTab(null); }
    }
  };
  return <section className="pims-review pims-setup">
    <button type="button" aria-expanded={open} aria-controls={sectionId} disabled={busy} onClick={() => void load()}>{t('setup.open')}</button>
    {open && <div id={sectionId} className="pims-review__rows">
      <p>{t('setup.description')}</p>
      {error && <p role="alert">{t(`setup.errors.${error}`)}</p>}
      {busy && <p role="status">{t('setup.loading')}</p>}
      <div className="pims-review__actions">
        <button type="button" disabled={busy} onClick={() => void load()}>{t('setup.refresh')}</button>
        {context && <button type="button" disabled={disabled} onClick={() => { setCreating(!creating); setPending(null); }}>{t('setup.add')}</button>}
      </div>
      {context && <>
        {creating && <form onSubmit={(event) => {
          event.preventDefault();
          if (!backend || disabled) return;
          const input = { practice_id: practiceId, provider, origin: origin.trim(), tenant_id: tenant.trim() };
          setPending({ description: `${input.origin} · ${input.tenant_id}`, apply: () => backend.configure(input) });
        }}>
          <fieldset disabled={disabled} className="pims-setup__form">
            <label>{t('setup.provider')}<select value={provider} onChange={(event) => setProvider(event.target.value as PimsId)}>{SETUP_PROVIDERS.map((value) => <option key={value} value={value}>{t(`setup.providers.${value}`)}</option>)}</select></label>
            <label>{t('setup.origin')}<input required maxLength={200} type="url" value={origin} onChange={(event) => setOrigin(event.target.value)} /></label>
            <label>{t(CONFIGURED_SYNC_PROVIDERS.includes(provider) ? 'setup.configuredTenant' : 'setup.tenant')}<input required maxLength={200} value={tenant} onChange={(event) => setTenant(event.target.value)} /></label>
            <button type="submit">{t('setup.reviewConnection')}</button>
          </fieldset>
        </form>}
        {!context.connections.length && <p>{t('setup.emptyConnections')}</p>}
        {!!context.connections.length && <>
          <label>{t('setup.connection')}<select disabled={disabled} value={connection} onChange={(event) => { setExternalId(''); setMemberId(''); void load(event.target.value); }}>
            {context.connections.map((entry) => <option key={entry.id} value={entry.id}>{t('setup.connectionLabel', { provider: t(`setup.providers.${entry.provider}`), origin: entry.origin, tenant: entry.tenant_id })}</option>)}
          </select></label>
          {current && <p>{t(configured && current.state !== 'disabled' ? configuredActive ? 'setup.configuredActive' : 'setup.configuredUnverified' : `setup.states.${current.state}`)}</p>}
          {current && (configured || ['rhapsody', 'vetspire'].includes(current.provider)) && <div className="pims-setup__form">
            <p>{t(configured ? 'setup.configuredHint' : 'setup.syncHint')}</p>
            {configured && <button type="button" disabled={disabled || current.state === 'disabled'} onClick={() => void reviewPimsTab()}>{t('setup.reviewTab')}</button>}
            {configured && reviewedTab && <p>{t('setup.reviewedTab', { title: reviewedTab.title })}</p>}
            {configured && <label className="choice-row">
              <input type="checkbox" checked={userConfirmed} disabled={disabled || current.state === 'disabled' || !reviewedTab}
                onChange={(event) => setUserConfirmed(event.target.checked)} />
              <span>{t('setup.configuredChecked')}</span>
            </label>}
            {configured ? !configuredActive && <button type="button" className="pims-setup__primary" disabled={disabled || !supabase || !userConfirmed || !reviewedTab || current.state === 'disabled'} onClick={() => void browserSync(true)}>{t('setup.confirmConfigured')}</button>
              : <button type="button" disabled={disabled || !supabase} onClick={() => void browserSync(true)}>{t('setup.verifyBrowser')}</button>}
            <label>{t('setup.syncDate')}<input type="date" value={syncDate} disabled={disabled} onChange={(event) => { setSyncDate(event.target.value); setSyncNotice(null); setUserConfirmed(false); setReviewedTab(null); }} /></label>
            {(!configured || configuredActive) && <button type="button" className={configured ? 'pims-setup__primary' : undefined}
              disabled={disabled || current.state !== 'active' || !dayBounds(syncDate) || !supabase || configured && (!userConfirmed || !reviewedTab)} onClick={() => void browserSync(false)}>{t('setup.sync')}</button>}
            {syncNotice && <p role="status">{syncNotice}</p>}
          </div>}
          <div className="pims-review__actions">{collections.map((value) => <button key={value} type="button" aria-pressed={collection === value} disabled={disabled} onClick={() => { setExternalId(''); setMemberId(''); void load(connection, value); }}>{t(`setup.collections.${value}`)}</button>)}</div>
          <ul className="pims-review__rows">{page.rows.map((row) => <li key={setupRowKey(row)}>
            {'chart_id' in row ? <><strong>{row.patient_name}</strong><span>{row.patient_number} · {row.chart_date} · {row.chart_id}</span><span>{row.patient_id ?? t('setup.unlinked')}</span>
              <button type="button" disabled={disabled} onClick={() => { setChart(row); setExternalId(''); setReason(''); }}>{t('setup.selectChart')}</button></>
              : 'clinician_id' in row ? <span>{row.clinician_id} → {members.find((member) => member.userId === row.user_id)?.label ?? row.user_id}</span>
                : <span>{row.patient_id} · {row.patient_key}</span>}
          </li>)}</ul>
          {!page.rows.length && !busy && <p>{t('setup.empty')}</p>}
          {page.next_cursor && <button type="button" disabled={disabled} onClick={() => void load(connection, collection, true)}>{t('review.more')}</button>}
          {(collection !== 'charts' || chart) && <form onSubmit={reviewLink}>
            <fieldset disabled={disabled} className="pims-setup__form">
              {chart && <p>{t('setup.chartWarning', { patient: chart.patient_name, chart: chart.chart_id })}</p>}
              <label>{t(collection === 'clinicians' ? 'setup.clinicianId' : 'setup.patientId')}<input required maxLength={200} value={externalId} onChange={(event) => setExternalId(event.target.value)} /></label>
              {collection === 'clinicians' && <label>{t('setup.member')}<select required value={memberId} onChange={(event) => setMemberId(event.target.value)}><option value="">{t('setup.chooseMember')}</option>
                {context.members.map((member) => <option key={member.user_id} value={member.user_id}>{members.find((entry) => entry.userId === member.user_id)?.label ?? member.user_id}</option>)}
              </select></label>}
              {collection === 'charts' && <label>{t('review.reason')}<input required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}
              <button type="submit">{t(`setup.reviewLink.${collection}`)}</button>
            </fieldset>
          </form>}
        </>}
      </>}
      {pending && <div role="group" aria-label={t('setup.confirm')} className="pims-setup__form">
        <p>{t('setup.confirmHint')}</p><p>{pending.description}</p>
        <div className="pims-review__actions"><button ref={confirmation} type="button" disabled={busy || blocked} onClick={() => void apply()}>{t('setup.confirm')}</button>
          <button type="button" disabled={busy} onClick={() => setPending(null)}>{t('review.cancel')}</button></div>
      </div>}
    </div>}
  </section>;
}
