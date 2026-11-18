import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredRecordNote } from '../../types';
import { recordNoteSectionText, recordNoteText, type RecordNote } from '../../utils/recordNote';
import { splitStoredNote } from '../../utils/pims/mapping';
import type { PimsTransport } from '../../utils/pims/extensionBridge';
import type { NoteRequest, NoteResponse } from '../../extension/noteProtocol';
import { supabase } from '../../utils/supabaseClient';
import './PimsReview.css';

const ALL_NOTES = 'all';
type Prepared = Extract<NoteResponse, { state: 'prepared' }>;
type Target = Extract<NoteResponse, { state: 'targets' }>['targets'][number];
interface Props {
  note: RecordNote;
  stored: StoredRecordNote | null;
  chartKey: string;
  patientName: string;
  transport: PimsTransport;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}
type Form = { scope: string; expanded?: boolean; targets?: Target[]; tab?: number; fields?: string[]; field?: string;
  prepared?: Prepared; reviewed?: boolean; result?: 'filled' | 'blocked' | 'unknown' | 'expired' };

/** A one-use editor fill, separate from verified encounter sends and their Sent stamps. */
export function PimsNoteAutofill({ note, stored, chartKey, patientName, transport, disabled = false, onBusyChange }: Props) {
  const { t } = useTranslation('pims');
  const id = useId();
  const [auth, setAuth] = useState<{ user: string | null; revision: number }>({ user: null, revision: 0 });
  const [source, setSource] = useState('all');
  const generated = recordNoteText(note);
  const wholeText = stored?.text ?? generated;
  const split = stored ? splitStoredNote(stored.text, note) : note;
  const section = split?.sections.find(value => value.key === source);
  const selectedSource = source === ALL_NOTES || section ? source : ALL_NOTES;
  const text = section ? recordNoteSectionText(section) : wholeText;
  useEffect(() => { if (source !== selectedSource) setSource(selectedSource); }, [source, selectedSource]);
  const scope = JSON.stringify([chartKey, patientName, generated, stored?.text, stored?.lng, source, auth.user, auth.revision, disabled]);
  const [form, setForm] = useState<Form>({ scope });
  const [working, setWorking] = useState(false);
  const epoch = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const latest = useRef({ scope, transport, disabled, onBusyChange });
  latest.current = { scope, transport, disabled, onBusyChange };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; epoch.current++; };
  }, []);
  useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange?.((_event, session) => {
      epoch.current++;
      setForm({ scope: latest.current.scope });
      setAuth(previous => ({ user: session?.user.id ?? null, revision: previous.revision + 1 }));
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => { epoch.current++; setForm(previous => ({ ...previous, scope, prepared: undefined, reviewed: false, result: previous.result === 'unknown' ? 'unknown' : undefined })); }, [scope, transport]);
  const current: Form = form.scope === scope ? form : { ...form, scope, prepared: undefined, reviewed: false, result: form.result === 'unknown' ? 'unknown' : undefined };
  useEffect(() => {
    if (!current.prepared) return;
    const ticket = current.prepared.ticket;
    const timer = setTimeout(() => {
      epoch.current++;
      setForm(previous => previous.prepared?.ticket === ticket ? { ...previous, prepared: undefined, reviewed: false, result: 'expired' } : previous);
    }, Math.max(0, Date.parse(current.prepared.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [current.prepared]);

  if (!auth.user || !transport.noteAutofill) return null;
  const target = current.targets?.find(value => value.tabId === current.tab);
  function update(changes: Partial<Form>) {
    epoch.current++;
    setForm(previous => ({ ...previous, ...changes, prepared: undefined, reviewed: false, result: previous.result === 'unknown' ? 'unknown' : undefined }));
  }
  async function request(value: NoteRequest, destination = target) {
    if (pending.current || disabled || !transport.noteAutofill) return;
    if (value.operation === 'fill' && (!current.reviewed || !current.prepared || Date.parse(current.prepared.expires_at) <= Date.now())) return;
    const root = document.documentElement;
    const attempt = ++epoch.current;
    pending.current = true;
    setWorking(true);
    onBusyChange?.(true);
    const active = () => mounted.current && document.documentElement === root && latest.current.scope === scope && latest.current.transport === transport
      && !latest.current.disabled && epoch.current === attempt;
    setForm(previous => ({ ...previous, expanded: true, prepared: undefined, reviewed: false, result: value.operation !== 'prepare' && previous.result === 'unknown' ? 'unknown' : undefined }));
    try {
      const result = await transport.noteAutofill(value);
      if (!active()) return;
      if (value.operation === 'list' && result.state === 'targets') {
        setForm(previous => ({ scope, expanded: true, targets: result.targets, result: previous.result === 'unknown' ? 'unknown' : undefined }));
      } else if (value.operation === 'inspect' && result.state === 'fields' && destination
        && result.provider === destination.provider && result.origin === destination.origin && result.title === destination.title) {
        setForm(previous => ({ ...previous, fields: result.fields, field: '' }));
      } else if (value.operation === 'prepare' && result.state === 'prepared' && destination
        && result.provider === destination.provider && result.origin === destination.origin && result.title === destination.title
        && result.field === value.field && Date.parse(result.expires_at) > Date.now()) {
        setForm(previous => ({ ...previous, prepared: result, reviewed: false }));
      } else {
        setForm(previous => ({ ...previous, result: value.operation === 'fill'
          ? result.state === 'filled' || result.state === 'blocked' ? result.state : 'unknown' : 'blocked' }));
      }
    } catch {
      if (active()) setForm(previous => ({ ...previous, result: value.operation === 'fill' ? 'unknown' : 'blocked' }));
    } finally {
      pending.current = false;
      if (mounted.current) setWorking(false);
      latest.current.onBusyChange?.(false);
    }
  }
  const inspectTab = (tab: number) => {
    if (pending.current || disabled) return;
    update({ tab, fields: undefined, field: '' });
    const selected = current.targets?.find(value => value.tabId === tab);
    if (selected) void request({ operation: 'inspect', tabId: tab }, selected);
  };
  return <section className="pims-review pims-setup pims-note-autofill">
    <button type="button" aria-expanded={!!current.expanded} aria-controls={id} disabled={disabled || working}
      onClick={() => current.expanded ? update({ expanded: false }) : void request({ operation: 'list' })}>
      {t(current.expanded ? 'noteAutofill.close' : 'noteAutofill.open')}
    </button>
    {current.expanded && <div id={id} className="pims-setup__form">
      <p className="pims-review__hint">{t('noteAutofill.hint')}</p>
      <label>{t('noteAutofill.source')}
        <select value={selectedSource} disabled={disabled || working} onChange={event => { epoch.current++; setSource(event.target.value); }}>
          <option value={ALL_NOTES}>{t('noteAutofill.all')}</option>
          {split?.sections.map(value => <option key={value.key} value={value.key}>{value.heading}</option>)}
        </select>
      </label>
      <label>{t('noteAutofill.preview')}<textarea readOnly value={text} /></label>
      <label>{t('noteAutofill.tab')}
        <select value={current.tab ?? ''} disabled={disabled || working} onChange={event => inspectTab(Number(event.target.value))}>
          <option value="">{t('noteAutofill.chooseTab')}</option>
          {current.targets?.map(value => <option key={value.tabId} value={value.tabId}>{t('noteAutofill.destination', { provider: t(`setup.providers.${value.provider}`), title: value.title, origin: value.origin })}</option>)}
        </select>
      </label>
      {!current.targets?.length && !working && <p role="status">{t('noteAutofill.noTabs')}</p>}
      {target && !current.fields?.length && <button type="button" disabled={disabled || working} onClick={() => void request({ operation: 'inspect', tabId: target.tabId })}>{t('noteAutofill.inspect')}</button>}
      {current.fields && <>
        <label>{t('noteAutofill.field')}
          <select value={current.field ?? ''} disabled={disabled || working} onChange={event => update({ field: event.target.value })}>
            <option value="">{t('noteAutofill.chooseField')}</option>
            {current.fields.map(field => <option key={field} value={field}>{field}</option>)}
          </select>
        </label>
        {!current.fields.length && <p role="status">{t('noteAutofill.noFields')}</p>}
      </>}
      {working && <p role="status">{t('noteAutofill.working')}</p>}
      {current.result && <p role={current.result === 'filled' ? 'status' : 'alert'}>{t(`noteAutofill.${current.result}`)}</p>}
      {target && current.field && !current.prepared && <button type="button" disabled={disabled || working || !text.trim()}
        onClick={() => void request({ operation: 'prepare', tabId: target.tabId, field: current.field! })}>{t('noteAutofill.prepare')}</button>}
      {current.prepared && <>
        <p>{t('noteAutofill.destination', { provider: t(`setup.providers.${current.prepared.provider}`), title: current.prepared.title, origin: current.prepared.origin })}</p>
        <p>{t('noteAutofill.preparedField', { field: current.prepared.field })}</p>
        <label className="pims-setup__check"><input type="checkbox" checked={!!current.reviewed} disabled={disabled || working}
          onChange={event => setForm(previous => ({ ...previous, reviewed: event.target.checked }))} />{t('noteAutofill.review')}</label>
        <button type="button" className="pims-setup__primary" disabled={disabled || working || !current.reviewed || !text.trim()}
          onClick={() => void request({ operation: 'fill', tabId: current.tab!, ticket: current.prepared!.ticket, text })}>{t('noteAutofill.fill')}</button>
      </>}
    </div>}
  </section>;
}
