import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredRecordNote } from '../../types';
import { recordNoteSectionText, recordNoteText, type RecordNote } from '../../utils/recordNote';
import { splitStoredNote } from '../../utils/pims/mapping';
import { createNoteMappingBackend, groupNoteSources, type NoteGroup, type NoteMapping, type NoteMappingBackend } from '../../utils/pims/noteMappings';
import type { PimsTransport } from '../../utils/pims/extensionBridge';
import type { NoteRequest, NoteResponse } from '../../extension/noteProtocol';
import { supabase } from '../../utils/supabaseClient';
import './PimsReview.css';

const ALL_NOTES = 'all';
type Prepared = Extract<NoteResponse, { state: 'prepared' }>;
type Target = Extract<NoteResponse, { state: 'targets' }>['targets'][number];
type Outcome = 'filled' | 'blocked' | 'unknown' | 'skipped';
type Review = NoteGroup & { prepared: Prepared };
interface Props {
  note: RecordNote;
  stored: StoredRecordNote | null;
  chartKey: string;
  patientName: string;
  transport: PimsTransport;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  templateId?: string;
  mappingBackend?: NoteMappingBackend;
}
type Form = { scope: string; expanded?: boolean; targets?: Target[]; tab?: number; fields?: string[]; field?: string;
  mapped?: boolean; prepared?: Review[]; reviewed?: boolean; result?: Exclude<Outcome, 'skipped'> | 'expired' | 'partial'; outcomes?: { field: string; outcome: Outcome }[] };
type MapForm = { context: string; mapping: NoteMapping; version: number; status: 'loading' | 'ready' | 'saving' | 'saved' | 'error' | 'conflict' };

/** One-use editor fills, separate from verified encounter sends and their Sent stamps. */
export function PimsNoteAutofill({ note, stored, chartKey, patientName, transport, disabled = false, onBusyChange, templateId = 'record-note-v1', mappingBackend }: Props) {
  const { t } = useTranslation('pims');
  const id = useId();
  const [auth, setAuth] = useState<{ user: string | null; revision: number }>({ user: null, revision: 0 });
  const authUser = useRef<string | null>(null);
  const [source, setSource] = useState(ALL_NOTES);
  const generated = recordNoteText(note);
  const wholeText = stored?.text ?? generated;
  const split = stored ? splitStoredNote(stored.text, note) : note;
  const section = split?.sections.find(value => value.key === source);
  const selectedSource = source === ALL_NOTES || section ? source : ALL_NOTES;
  const text = section ? recordNoteSectionText(section) : wholeText;
  useEffect(() => { if (source !== selectedSource) setSource(selectedSource); }, [source, selectedSource]);
  const scope = JSON.stringify([chartKey, patientName, generated, stored?.text, stored?.lng, source, auth.user, auth.revision, disabled, templateId]);
  const [form, setForm] = useState<Form>({ scope });
  const [working, setWorking] = useState(false);
  const epoch = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const latest = useRef({ scope, transport, disabled, onBusyChange });
  latest.current = { scope, transport, disabled, onBusyChange };
  const current: Form = form.scope === scope ? form : { ...form, scope, prepared: undefined, reviewed: false, outcomes: form.result === 'unknown' || form.result === 'partial' ? form.outcomes : undefined, result: form.result === 'unknown' || form.result === 'partial' ? form.result : undefined };
  const target = current.targets?.find(value => value.tabId === current.tab);
  const backend = useMemo(() => mappingBackend ?? (typeof supabase?.rpc === 'function' ? createNoteMappingBackend(supabase) : undefined), [mappingBackend]);
  const mapContext = JSON.stringify([scope, target?.provider, target?.origin, target?.tabId]);
  const mapLatest = useRef(mapContext); mapLatest.current = mapContext;
  const mapEdits = useRef(0);
  const mapSaving = useRef(false);
  const [mapForm, setMapForm] = useState<MapForm>({ context: mapContext, mapping: {}, version: 0, status: 'ready' });
  const mapping = mapForm.context === mapContext ? mapForm.mapping : {};
  const [reload, setReload] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current++; };
  }, []);
  useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange?.((_event, session) => {
      epoch.current++;
      authUser.current = session?.user.id ?? null;
      setForm({ scope: latest.current.scope });
      setAuth(previous => ({ user: session?.user.id ?? null, revision: previous.revision + 1 }));
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    epoch.current++;
    setForm(previous => ({ ...previous, scope, prepared: undefined, reviewed: false, outcomes: previous.result === 'unknown' || previous.result === 'partial' ? previous.outcomes : undefined, result: previous.result === 'unknown' || previous.result === 'partial' ? previous.result : undefined }));
  }, [scope, transport]);
  useEffect(() => {
    let cancelled = false;
    const revision = mapEdits.current;
    setMapForm({ context: mapContext, mapping: {}, version: 0, status: backend && target && auth.user ? 'loading' : 'ready' });
    if (backend && target && auth.user) void backend.load({ provider: target.provider, origin: target.origin, template_id: templateId }).then(saved => {
      if (cancelled || mapLatest.current !== mapContext) return;
      setMapForm(previous => ({ context: mapContext, mapping: mapEdits.current === revision ? saved.mapping : previous.mapping, version: saved.version, status: 'ready' }));
    }, () => {
      if (!cancelled && mapLatest.current === mapContext) setMapForm(previous => ({ ...previous, status: 'error' }));
    });
    return () => { cancelled = true; };
  }, [mapContext, backend, reload]); // Context includes authenticated user, template, source and explicit tab.
  useEffect(() => {
    if (!current.prepared?.length) return;
    const prepared = current.prepared;
    const timer = setTimeout(() => {
      epoch.current++;
      setForm(previous => previous.prepared === prepared ? { ...previous, prepared: undefined, reviewed: false, result: 'expired' } : previous);
    }, Math.max(0, Math.min(...prepared.map(value => Date.parse(value.prepared.expires_at))) - Date.now()));
    return () => clearTimeout(timer);
  }, [current.prepared]);

  if (!auth.user || !transport.noteAutofill) return null;
  const sources = split ? split.sections.map(value => ({ id: value.key, label: value.heading, text: recordNoteSectionText(value) }))
    : [{ id: 'editedNote', label: t('noteAutofill.all'), text: wholeText }];
  const groups = current.mapped ? groupNoteSources(sources, mapping) : current.field ? [{ field: current.field, text, sources: [] }] : [];
  const missing = current.mapped ? sources.filter(value => mapping[value.id] && !current.fields?.includes(mapping[value.id]!)) : [];
  const mapStatus = mapForm.context === mapContext ? mapForm.status : 'loading';
  const canPrepare = groups.length > 0 && groups.every(group => group.text.trim() && group.text.length <= 60000) && !missing.length;
  function update(changes: Partial<Form>) {
    if (pending.current || disabled) return;
    epoch.current++;
    setForm(previous => ({ ...previous, ...changes, prepared: undefined, reviewed: false, outcomes: previous.result === 'unknown' || previous.result === 'partial' ? previous.outcomes : undefined, result: previous.result === 'unknown' || previous.result === 'partial' ? previous.result : undefined }));
  }
  function changeMapping(sourceId: string, field: string) {
    mapEdits.current++;
    setMapForm(previous => ({ ...previous, context: mapContext, mapping: { ...mapping, [sourceId]: field || null }, status: previous.status === 'loading' ? 'loading' : 'ready' }));
    update({});
  }
  async function saveMapping() {
    if (!backend || !target || disabled || pending.current || mapSaving.current || mapStatus === 'loading' || mapStatus === 'saving' || mapStatus === 'conflict' || mapStatus === 'error') return;
    const context = mapContext, revision = mapEdits.current;
    mapSaving.current = true;
    setMapForm(previous => ({ ...previous, status: 'saving' }));
    try {
      const saved = await backend.save({ provider: target.provider, origin: target.origin, template_id: templateId, expected_version: mapForm.version, mapping });
      if (!mounted.current || mapLatest.current !== context) return;
      setMapForm(previous => ({ ...previous, version: saved.version, status: mapEdits.current === revision ? 'saved' : 'ready' }));
    } catch (error) {
      if (mounted.current && mapLatest.current === context) setMapForm(previous => ({ ...previous, status: (error as { code?: string })?.code === 'conflict' ? 'conflict' : 'error' }));
    } finally { mapSaving.current = false; }
  }
  async function run(kind: 'list' | 'inspect' | 'prepare' | 'fill', destination = target) {
    if (pending.current || disabled || !transport.noteAutofill) return;
    const batch = current.prepared;
    if (kind === 'fill' && (!current.reviewed || !batch?.length || batch.some(value => Date.parse(value.prepared.expires_at) <= Date.now()))) return;
    if (kind === 'prepare' && (!canPrepare || !destination)) return;
    const root = document.documentElement, user = auth.user;
    const attempt = ++epoch.current;
    pending.current = true; setWorking(true); onBusyChange?.(true);
    const active = () => mounted.current && document.documentElement === root && latest.current.scope === scope && latest.current.transport === transport
      && !latest.current.disabled && epoch.current === attempt;
    setForm(previous => ({ ...previous, expanded: true, prepared: undefined, reviewed: false, outcomes: kind === 'list' || kind === 'inspect' ? previous.outcomes : undefined,
      result: (previous.result === 'unknown' || previous.result === 'partial') && kind !== 'prepare' ? previous.result : undefined }));
    let dispatched = false;
    let inFlight: string | null = null;
    const outcomes: { field: string; outcome: Outcome }[] = [];
    const interrupted = () => {
      if (!mounted.current || authUser.current !== user || !dispatched) return;
      setForm(previous => ({ ...previous, prepared: undefined, reviewed: false, result: outcomes.some(value => value.outcome === 'filled') ? 'partial' : 'unknown', outcomes: [
        ...outcomes,
        ...batch!.slice(outcomes.length).map(value => ({ field: value.field, outcome: value.field === inFlight ? 'unknown' as const : 'skipped' as const })),
      ] }));
    };
    try {
      if (kind === 'list' || kind === 'inspect') {
        const request: NoteRequest = kind === 'list' ? { operation: 'list' } : { operation: 'inspect', tabId: destination!.tabId };
        const result = await transport.noteAutofill(request);
        if (!active()) return;
        if (kind === 'list' && result.state === 'targets') setForm(previous => ({ scope, expanded: true, targets: result.targets, outcomes: previous.outcomes, result: previous.result === 'unknown' || previous.result === 'partial' ? previous.result : undefined }));
        else if (kind === 'inspect' && result.state === 'fields' && destination && sameTarget(result, destination)) setForm(previous => ({ ...previous, fields: result.fields, field: '' }));
        else setForm(previous => ({ ...previous, result: previous.result === 'partial' || previous.result === 'unknown' ? previous.result : 'blocked' }));
      } else if (kind === 'prepare') {
        const prepared: Review[] = [];
        for (const group of groups) {
          if (!active()) return;
          const result = await transport.noteAutofill({ operation: 'prepare', tabId: destination!.tabId, field: group.field });
          if (!active()) return;
          if (result.state !== 'prepared' || !sameTarget(result, destination!) || result.field !== group.field || Date.parse(result.expires_at) <= Date.now()) {
            setForm(previous => ({ ...previous, result: 'blocked' })); return;
          }
          prepared.push({ ...group, prepared: result });
        }
        if (prepared.some(value => Date.parse(value.prepared.expires_at) <= Date.now())) { setForm(previous => ({ ...previous, result: 'expired' })); return; }
        setForm(previous => ({ ...previous, prepared, reviewed: false }));
      } else {
        for (let index = 0; index < batch!.length; index++) {
          if (!active()) { interrupted(); return; }
          const item = batch![index];
          let outcome: Exclude<Outcome, 'skipped'> = 'blocked';
          if (Date.parse(item.prepared.expires_at) > Date.now()) {
            dispatched = true;
            inFlight = item.field;
            try {
              const result = await transport.noteAutofill({ operation: 'fill', tabId: destination!.tabId, ticket: item.prepared.ticket, text: item.text });
              outcome = result.state === 'filled' || result.state === 'blocked' ? result.state : 'unknown';
            } catch { outcome = 'unknown'; }
          }
          if (!active()) { interrupted(); return; }
          outcomes.push({ field: item.field, outcome });
          inFlight = null;
          if (outcome !== 'filled') {
            outcomes.push(...batch!.slice(index + 1).map(value => ({ field: value.field, outcome: 'skipped' as const })));
            setForm(previous => ({ ...previous, result: outcomes.some(value => value.outcome === 'filled') ? 'partial' : outcome, outcomes })); return;
          }
        }
        setForm(previous => ({ ...previous, result: 'filled', outcomes }));
      }
    } catch {
      if (active()) setForm(previous => ({ ...previous, result: kind === 'fill' ? 'unknown' : kind !== 'prepare' && (previous.result === 'partial' || previous.result === 'unknown') ? previous.result : 'blocked' }));
      else interrupted();
    } finally {
      pending.current = false;
      if (mounted.current) setWorking(false);
      latest.current.onBusyChange?.(false);
    }
  }
  function sameTarget(value: { provider: string; origin: string; title: string }, selected: Target) {
    return value.provider === selected.provider && value.origin === selected.origin && value.title === selected.title;
  }
  function inspectTab(tab: number) {
    if (pending.current || disabled) return;
    update({ tab, fields: undefined, field: '' });
    const selected = current.targets?.find(value => value.tabId === tab);
    if (selected) void run('inspect', selected);
  }
  return <section className="pims-review pims-setup pims-note-autofill">
    <button type="button" aria-expanded={!!current.expanded} aria-controls={id} disabled={disabled || working}
      onClick={() => current.expanded ? update({ expanded: false }) : void run('list')}>
      {t(current.expanded ? 'noteAutofill.close' : 'noteAutofill.open')}
    </button>
    {current.expanded && <div id={id} className="pims-setup__form">
      <p className="pims-review__hint">{t('noteAutofill.hint')}</p>
      {!current.mapped && <label>{t('noteAutofill.source')}
        <select value={selectedSource} disabled={disabled || working} onChange={event => { epoch.current++; setSource(event.target.value); }}>
          <option value={ALL_NOTES}>{t('noteAutofill.all')}</option>
          {split?.sections.map(value => <option key={value.key} value={value.key}>{value.heading}</option>)}
        </select>
      </label>}
      <label>{t('noteAutofill.preview')}<textarea readOnly value={current.mapped ? wholeText : text} /></label>
      <label>{t('noteAutofill.tab')}
        <select value={current.tab ?? ''} disabled={disabled || working} onChange={event => inspectTab(Number(event.target.value))}>
          <option value="">{t('noteAutofill.chooseTab')}</option>
          {current.targets?.map(value => <option key={value.tabId} value={value.tabId}>{t('noteAutofill.destination', { provider: t(`setup.providers.${value.provider}`), title: value.title, origin: value.origin })}</option>)}
        </select>
      </label>
      {!current.targets?.length && !working && <p role="status">{t('noteAutofill.noTabs')}</p>}
      {target && !current.fields?.length && <button type="button" disabled={disabled || working} onClick={() => void run('inspect')}>{t('noteAutofill.inspect')}</button>}
      {current.fields && <>
        <button type="button" className="pims-note-autofill__mode" disabled={disabled || working} onClick={() => update({ mapped: !current.mapped })}>{t(current.mapped ? 'noteAutofill.singleField' : 'noteAutofill.mapSections')}</button>
        {current.mapped ? <div className="pims-note-autofill__mapping">
          <p id={`${id}-mapping-hint`} className="pims-review__hint">{t('noteAutofill.mappingHint')}</p>
          {sources.map(value => <div key={value.id} className="pims-note-autofill__mapping-row">
            <label>{value.label}<select value={mapping[value.id] ?? ''} disabled={disabled || working} aria-describedby={`${id}-mapping-hint${mapping[value.id] && !current.fields!.includes(mapping[value.id]!) ? ` ${id}-missing-${value.id}` : ''}`}
              onChange={event => changeMapping(value.id, event.target.value)}>
              <option value="">{t('noteAutofill.skip')}</option>
              {mapping[value.id] && !current.fields!.includes(mapping[value.id]!) && <option value={mapping[value.id]!}>{mapping[value.id]}</option>}
              {current.fields!.map(field => <option key={field} value={field}>{field}</option>)}
            </select></label>
            {mapping[value.id] && !current.fields!.includes(mapping[value.id]!) && <p role="alert" id={`${id}-missing-${value.id}`}>{t('noteAutofill.missingField', { field: mapping[value.id] })}</p>}
          </div>)}
          <div className="pims-review__actions">
            <button type="button" disabled={disabled || working || !backend || ['loading','saving','conflict','error'].includes(mapStatus)} onClick={() => void saveMapping()}>{t('noteAutofill.saveMapping')}</button>
            <details className="pims-note-autofill__options"><summary>{t('noteAutofill.mappingOptions')}</summary><div className="pims-review__actions">
            <button type="button" disabled={disabled || working || mapStatus === 'saving'} onClick={() => { mapEdits.current++; update({}); setReload(value => value + 1); }}>{t('noteAutofill.reloadMapping')}</button>
            <button type="button" disabled={disabled || working || mapStatus === 'saving'} onClick={() => { mapEdits.current++; update({}); setMapForm(previous => ({ ...previous, mapping: {}, status: ['loading','conflict','error'].includes(previous.status) ? previous.status : 'ready' })); }}>{t('noteAutofill.resetMapping')}</button>
            </div></details>
          </div>
          <p className="pims-review__hint">{t('noteAutofill.mappingPrivacy')}</p>
          {mapStatus !== 'ready' && <p role={mapStatus === 'conflict' || mapStatus === 'error' ? 'alert' : 'status'}>{t(`noteAutofill.mappingStatus.${mapStatus}`)}</p>}
        </div> : <label>{t('noteAutofill.field')}
          <select value={current.field ?? ''} disabled={disabled || working} onChange={event => update({ field: event.target.value })}>
            <option value="">{t('noteAutofill.chooseField')}</option>
            {current.fields.map(field => <option key={field} value={field}>{field}</option>)}
          </select>
        </label>}
        {!current.fields.length && <p role="status">{t('noteAutofill.noFields')}</p>}
      </>}
      {working && <p role="status">{t('noteAutofill.working')}</p>}
      {current.result && <p role={current.result === 'filled' ? 'status' : 'alert'}>{t(`noteAutofill.${current.result}`)}</p>}
      {!!current.outcomes?.length && (current.mapped || current.result === 'partial' || current.result === 'unknown') && <ul className="pims-note-autofill__results">{current.outcomes.map(value => <li key={value.field}>{t('noteAutofill.fieldOutcome', { field: value.field, outcome: t(`noteAutofill.outcomes.${value.outcome}`) })}</li>)}</ul>}
      {target && (current.mapped || current.field) && !current.prepared && <button type="button" className="pims-setup__primary" disabled={disabled || working || !canPrepare}
        onClick={() => void run('prepare')}>{t('noteAutofill.prepare')}</button>}
      {!!current.prepared?.length && <>
        <p>{t('noteAutofill.destination', { provider: t(`setup.providers.${target!.provider}`), title: target!.title, origin: target!.origin })}</p>
        {current.prepared.map(value => <div key={value.field} className="pims-note-autofill__review-field"><p>{t('noteAutofill.preparedField', { field: value.field })}</p>
          {current.mapped && <p className="pims-review__hint">{t('noteAutofill.groupSources', { sections: value.sources.join(', ') })}</p>}
        </div>)}
        <label className="pims-setup__check"><input type="checkbox" checked={!!current.reviewed} disabled={disabled || working}
          onChange={event => setForm(previous => ({ ...previous, reviewed: event.target.checked }))} />{t('noteAutofill.review')}</label>
        <button type="button" className="pims-setup__primary" disabled={disabled || working || !current.reviewed}
          onClick={() => void run('fill')}>{t(current.mapped ? 'noteAutofill.pasteAll' : 'noteAutofill.fill')}</button>
      </>}
    </div>}
  </section>;
}
