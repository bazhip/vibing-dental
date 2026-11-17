import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InspectResult } from '../../extension/protocol';
import { isPhysicalExamResult, shepherdObjectiveRecord, type PhysicalExamCode, type PhysicalExamRequest, type PhysicalExamResult } from '../../extension/pims/types';
import { identifyPims } from '../../extension/pims/hosts';
import type { PimsTransport } from '../../utils/pims/extensionBridge';
import { supabase } from '../../utils/supabaseClient';
import './PimsReview.css';

export type PimsExamProps = {
  inspection: InspectResult;
  transport: PimsTransport;
  userId?: string | null;
  chartKey: string;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onOpened: () => void;
};

type Prepared = Extract<PhysicalExamResult, { state: 'prepared' }>;
type FormState = { scope: string; expanded?: boolean; busy?: boolean; prepared?: Prepared; template?: string; error?: PhysicalExamCode; opened?: boolean };

function offered(inspection: InspectResult): boolean {
  const status = inspection.status;
  if (!inspection.tab || status?.provider !== 'shepherd' || !status.consult) return false;
  try {
    const url = new URL(status.consult.viewId.split('|')[0]);
    return identifyPims(url.href) === 'shepherd' && !url.port && status.consult.viewId === `${url.href}|`
      && shepherdObjectiveRecord(url) === status.consult.recordId;
  } catch { return false; }
}

export function PimsExam({ inspection, transport, userId, chartKey, disabled = false, onBusyChange, onOpened }: PimsExamProps) {
  const { t } = useTranslation('pims');
  const controlsId = useId();
  const [authUser, setAuthUser] = useState<string | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  const scope = JSON.stringify([authUser, userId, chartKey, inspection.tab?.id, inspection.status?.provider,
    inspection.status?.consult?.recordId, inspection.status?.consult?.viewId]);
  const [form, setForm] = useState<FormState>({ scope });
  const [capability, setCapability] = useState<{ scope: string; transport: PimsTransport } | null>(null);
  const eligible = !!authUser && (userId === undefined || userId === authUser) && !!chartKey && offered(inspection) && !!transport.physicalExam;
  const latest = useRef({ scope, transport, disabled, onBusyChange, onOpened });
  latest.current = { scope, transport, disabled, onBusyChange, onOpened };
  const generation = useRef(0);
  const inFlight = useRef<number | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setForm({ scope });
    return () => {
      mounted.current = false;
      generation.current++;
      if (inFlight.current !== null) { inFlight.current = null; latest.current.onBusyChange?.(false); }
    };
  }, [scope, transport]);
  useEffect(() => {
    const subscription = supabase?.auth?.onAuthStateChange?.((_event, session) => {
      generation.current++;
      if (inFlight.current !== null) { inFlight.current = null; latest.current.onBusyChange?.(false); }
      setForm({ scope: latest.current.scope });
      setAuthUser(session?.user.id ?? null);
      setAuthRevision(previous => previous + 1);
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setCapability(null);
    if (!eligible || disabled) return;
    let cancelled = false;
    const attempt = generation.current;
    void (async () => {
      try {
        const ping = await transport.ping();
        if (!cancelled && mounted.current && generation.current === attempt && latest.current.scope === scope
          && latest.current.transport === transport && ping?.capabilities.includes('physicalExam')) {
          setCapability({ scope, transport });
        }
      } catch { return; }
    })();
    return () => { cancelled = true; };
  }, [authRevision, disabled, eligible, scope, transport]);
  useEffect(() => {
    if (!disabled) return;
    generation.current++;
    if (inFlight.current !== null) { inFlight.current = null; latest.current.onBusyChange?.(false); }
    setForm(previous => previous.error === 'physical_exam_outcome_unknown' || previous.opened ? previous : { scope });
  }, [disabled, scope]);

  const current = form.scope === scope ? form : { scope };
  if (!eligible || capability?.scope !== scope || capability.transport !== transport) return null;
  const tabId = inspection.tab!.id;
  const target = { provider: 'shepherd' as const, consult: inspection.status!.consult! };
  const matches = (value: InspectResult) => value.tab?.id === tabId && value.status?.provider === 'shepherd'
    && value.status.consult?.recordId === target.consult.recordId && value.status.consult?.viewId === target.consult.viewId;

  async function act(open: boolean) {
    if (inFlight.current !== null || disabled || current.opened || current.error === 'physical_exam_outcome_unknown') return;
    const prepared = current.prepared;
    if (open && (!prepared || !current.template || !prepared.templates.some(template => template.id === current.template))) return;
    const attempt = ++generation.current;
    inFlight.current = attempt;
    const active = () => mounted.current && generation.current === attempt && latest.current.scope === scope
      && latest.current.transport === transport && !latest.current.disabled;
    setForm(previous => ({ ...previous, scope, expanded: true, busy: true, error: undefined }));
    onBusyChange?.(true);
    let dispatched = false;
    let didOpen = false;
    try {
      if (!open) {
        const ping = await transport.ping();
        if (!active()) return;
        if (!ping?.capabilities.includes('physicalExam')) { setForm({ scope, expanded: true, error: 'unavailable' }); return; }
      }
      const inspected = await transport.inspect();
      if (!active()) return;
      if (!matches(inspected)) { setForm({ scope, expanded: true, error: 'patient_changed' }); return; }
      const call = async (request: PhysicalExamRequest): Promise<PhysicalExamResult> => {
        const reply = await transport.physicalExam!(tabId, request);
        return isPhysicalExamResult(reply, request) ? reply : { ok: false, code: open ? 'physical_exam_outcome_unknown' : 'unavailable' };
      };
      let result: PhysicalExamResult;
      if (open) {
        dispatched = true;
        result = await call({ operation: 'open', target, pageId: prepared!.pageId, ticket: prepared!.ticket, templateId: current.template! });
      } else {
        const available = await call({ operation: 'inspect', target });
        if (!active()) return;
        if (!available.ok || available.state !== 'available') {
          setForm({ scope, expanded: true, error: !available.ok ? available.code : 'unavailable' }); return;
        }
        result = await call({ operation: 'prepare', target, pageId: available.pageId });
      }
      if (!active()) return;
      if (!result.ok) setForm({ scope, expanded: true, error: result.code });
      else if (result.state === 'prepared') setForm({ scope, expanded: true, prepared: result, template: '' });
      else if (result.state === 'opened') { setForm({ scope, expanded: true, opened: true }); didOpen = true; }
    } catch {
      if (active()) setForm({ scope, expanded: true, error: dispatched ? 'physical_exam_outcome_unknown' : 'unavailable' });
    } finally {
      if (inFlight.current === attempt) {
        inFlight.current = null;
        if (active()) setForm(previous => ({ ...previous, busy: false }));
        latest.current.onBusyChange?.(false);
      }
    }
    if (didOpen && active()) latest.current.onOpened();
  }

  const locked = current.error === 'physical_exam_outcome_unknown' || current.opened;
  return <section className="pims-review pims-setup">
    {!locked && <button type="button" aria-expanded={!!current.expanded} aria-controls={controlsId} disabled={disabled || current.busy}
      onClick={() => current.expanded ? setForm({ scope }) : void act(false)}>{t(current.expanded ? 'exam.close' : 'exam.setup')}</button>}
    {current.expanded && <div id={controlsId} className="pims-setup__form">
      <p className="pims-review__hint">{t('exam.hint')}</p>
      {current.busy && <p role="status">{t('exam.working')}</p>}
      {current.error && <p role="alert">{t(`exam.errors.${current.error}`)}</p>}
      {current.opened && <p role="status">{t('exam.opened')}</p>}
      {current.prepared && <>
        <label htmlFor={`${controlsId}-template`}>{t('exam.template')}</label>
        <select id={`${controlsId}-template`} value={current.template ?? ''} disabled={disabled || current.busy}
          onChange={event => setForm(previous => ({ ...previous, template: event.target.value }))}>
          <option value="">{t('exam.chooseTemplate')}</option>
          {current.prepared.templates.map(template => <option key={template.id} value={template.id}>{template.label}</option>)}
        </select>
        <div><p>{t('exam.doctor')}</p><p>{current.prepared.doctor}</p></div>
        <p className="pims-review__hint">{t('exam.doctorHint')}</p>
        <button type="button" disabled={disabled || current.busy || !current.template} onClick={() => void act(true)}>{t('exam.open')}</button>
      </>}
    </div>}
  </section>;
}
