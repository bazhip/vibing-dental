import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ChartSnapshot as PreviewSnapshot } from './PdfPreviewModal';
import type { StoredRecordNote } from '../types';
import type { InspectResult, ItemResult, SendResult } from '../extension/protocol';
import { HEADING_KEYS, type RecordNote, type RecordNoteKey } from '../utils/recordNote';
import {
  buildSendItems,
  splitStoredNote,
  targetableFields,
  type FieldInfo,
  type PimsFieldMap,
  type SourceKey,
} from '../utils/pims/mapping';
import { matchField } from '../extension/ezyvet/matchField';
import { patientsMatch } from '../utils/pims/patientMatch';
import { diagnose, inspect, ping, send } from '../utils/pims/extensionBridge';
import { renderChartPicture } from '../utils/pims/chartPicture';
import { markPimsSent } from '../utils/edgeFunctions';
import { usePimsFieldMap } from '../hooks/usePimsFieldMap';
import { useModalFocus } from '../hooks/useModalFocus';
import { supabase } from '../utils/supabaseClient';
import { copyRichText } from '../utils/clipboard';
import { errorText } from '../utils/apiErrors';
import { confirmDialog, toast } from './ui/dialogs';

export interface SendToEzyvetDialogProps {
  open: boolean;
  onClose: () => void;
  /** The generated note (in `stored.lng` when there is a stored note, so it can be split). */
  note: RecordNote;
  /** The edited note on the chart, sent instead of `note` when present. */
  stored: StoredRecordNote | null;
  /** For the chart picture (null = no picture row). */
  chartSnapshot: PreviewSnapshot | null;
  /** Cloud chart id (null = not saved to the cloud: nothing is stamped). */
  chartId: string | null;
  patientName: string;
  /** When the chart was last sent (null = unknown; the dialog looks it up). */
  sentAt: string | null;
  onSent: (sentAt: string) => void;
}

type FailCode = Extract<ItemResult, { ok: false }>['code'] | 'picture_failed';
type ResultRow = { fieldTitle: string; code: FailCode | null };

type Phase =
  | { kind: 'loading' }
  | { kind: 'notInstalled' }
  | { kind: 'error'; message: string; tabId?: number }
  | { kind: 'ready'; info: InspectResult }
  | { kind: 'results'; info: InspectResult; rows: ResultRow[]; stampFailed: boolean };

/** Row key: a note section, the chart picture, or the whole edited note. */
type RowKey = SourceKey | 'edited';

const DONT_SEND = '';
const MISSING = '\u0000missing';

/** Choice shown in a row's select for the wanted title. */
function selectValue(wanted: string | null, options: FieldInfo[]): string {
  if (wanted == null) return DONT_SEND;
  return matchField(wanted, options.map((f) => f.title)) ?? MISSING;
}

/**
 * Documents → Record note → Send to ezyVet. Finds the open ezyVet consult
 * through the extension, shows where each part of the note goes (the vet's
 * saved map over the defaults), checks the patient and writes the note.
 * Nothing from the ezyVet page is stored or sent anywhere; the diagnostic
 * report only copies what the extension's `diagnose` returns.
 */
export const SendToEzyvetDialog: React.FC<SendToEzyvetDialogProps> = ({
  open, onClose, note, stored, chartSnapshot, chartId, patientName, sentAt, onSent,
}) => {
  const { t, i18n } = useTranslation(['pims', 'media', 'app', 'forms', 'common']);
  const { map, save, reset } = usePimsFieldMap();
  const modalRef = useModalFocus(open);
  const idBase = React.useId();
  const [phase, setPhase] = React.useState<Phase>({ kind: 'loading' });
  const [edits, setEdits] = React.useState<PimsFieldMap>({});
  const [editedField, setEditedField] = React.useState<string | null | undefined>(undefined);
  const [sending, setSending] = React.useState(false);
  const sendingRef = React.useRef(false);
  const [fetchedSentAt, setFetchedSentAt] = React.useState<string | null>(null);
  const [justSentAt, setJustSentAt] = React.useState<string | null>(null);
  const lastSentAt = justSentAt ?? sentAt ?? fetchedSentAt;

  const load = React.useCallback(async () => {
    setPhase({ kind: 'loading' });
    const version = await ping();
    if (!version) { setPhase({ kind: 'notInstalled' }); return; }
    try {
      setPhase({ kind: 'ready', info: await inspect() });
    } catch (err) {
      setPhase({ kind: 'error', message: errorText(err, t('pims:errors.extension_error')) });
    }
  }, [t]);

  React.useEffect(() => {
    if (!open) return;
    setEdits({});
    setEditedField(undefined);
    setJustSentAt(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The last send date isn't loaded with the chart; read it here. Any
  // failure (e.g. row-level security for a practice member) means unknown.
  React.useEffect(() => {
    setFetchedSentAt(null);
    if (!open || !chartId || !supabase) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase!.from('charts').select('pims_sent_at').eq('id', chartId).maybeSingle();
        if (cancelled || error) return;
        setFetchedSentAt((data as { pims_sent_at?: string | null } | null)?.pims_sent_at ?? null);
      } catch { /* unknown */ }
    })();
    return () => { cancelled = true; };
  }, [open, chartId]);

  // What is sent: the generated note, the edited note split back into its
  // sections, or (when the split fails) the edited note as one block.
  const split = React.useMemo(() => (stored ? splitStoredNote(stored.text, note) : note), [stored, note]);
  const sections = split?.sections ?? [];

  if (!open) return null;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    try {
      return d.toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return d.toLocaleString();
    }
  };

  const copyDiagnostic = async (tabId?: number) => {
    try {
      const report = JSON.stringify(await diagnose(tabId), null, 2);
      const html = `<pre>${report.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
      const outcome = await copyRichText(html, report, t('pims:actions.diagnosticPrompt'));
      if (outcome !== 'prompt') toast(t('pims:actions.diagnosticCopied'), { kind: 'success' });
    } catch (err) {
      toast(errorText(err, t('pims:errors.extension_error')), { kind: 'error' });
    }
  };

  const wantedFor = (key: SourceKey): string | null => (key in edits ? edits[key]! : map[key]) ?? null;
  const editedWanted = editedField !== undefined ? editedField : map.treatment ?? 'Plan';

  const header = (
    <header className="ai-settings-header">
      <h2>{t('pims:dialog.title')}</h2>
      <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('common:actions.close')}>×</button>
    </header>
  );

  const diagnosticLink = (tabId?: number) => (
    <button type="button" className="pims-dialog__link" onClick={() => void copyDiagnostic(tabId)}>
      {t('pims:actions.copyDiagnostic')}
    </button>
  );

  const retryButton = (
    <button type="button" className="entry-grid__button entry-grid__button--topbar" onClick={() => void load()}>
      {t('pims:dialog.retry')}
    </button>
  );

  let body: React.ReactNode;
  let footer: React.ReactNode = (
    <button type="button" className="diagram-view__action" onClick={onClose}>{t('common:actions.close')}</button>
  );

  if (phase.kind === 'loading') {
    body = <p className="pims-dialog__status" role="status">{t('pims:dialog.loading')}</p>;
  } else if (phase.kind === 'notInstalled') {
    // The Web Store link goes here once the extension is published.
    body = (
      <>
        <h3 className="pims-dialog__subtitle">{t('pims:install.title')}</h3>
        <p>{t('pims:install.body')}</p>
      </>
    );
  } else if (phase.kind === 'error') {
    body = (
      <>
        <p className="login-error" role="alert">{phase.message}</p>
        {diagnosticLink(phase.tabId)}
      </>
    );
    footer = <>{footer}{retryButton}</>;
  } else if (!phase.info.tab) {
    body = <p role="status">{t('pims:noTab')}</p>;
    footer = <>{footer}{retryButton}</>;
  } else if (phase.info.status?.state !== 'writable') {
    const state = phase.info.status?.state;
    body = (
      <>
        <p role="status">{state ? t(`pims:state.${state}`) : t('pims:errors.extension_error')}</p>
        {diagnosticLink(phase.info.tab.id)}
      </>
    );
    footer = <>{footer}{retryButton}</>;
  } else {
    const info = phase.info;
    const tab = info.tab!;
    const ezyvetName = info.status!.patientName;
    const targets = targetableFields(info.fields);
    const imageTargets = targets.filter((f) => f.acceptsImage);

    type Row = { key: RowKey; label: string; options: FieldInfo[]; wanted: string | null };
    const rows: Row[] = split
      ? sections.map((s) => ({ key: s.key, label: t(HEADING_KEYS[s.key as RecordNoteKey]), options: targets, wanted: wantedFor(s.key) }))
      : [{ key: 'edited', label: t('pims:rows.edited'), options: targets, wanted: editedWanted }];
    if (chartSnapshot) rows.push({ key: 'chart', label: t('pims:rows.chart'), options: imageTargets, wanted: wantedFor('chart') });

    const choose = (key: RowKey, value: string) => {
      const next = value === DONT_SEND ? null : value;
      if (key === 'edited') setEditedField(next);
      else setEdits((e) => ({ ...e, [key]: next }));
    };

    const resetToDefaults = async () => {
      setEdits({});
      setEditedField(undefined);
      try { await reset(); } catch (err) { toast(errorText(err, t('common:errors.generic')), { kind: 'error' }); }
    };

    const nothingToSend = rows.every((r) => r.wanted == null);

    const doSend = async () => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      try {
        if (Object.keys(edits).length) {
          // Saving the map must not stop the send.
          try { await save(edits); } catch { /* the choices still apply to this send */ }
        }
        if (lastSentAt) {
          const again = await confirmDialog({
            title: t('pims:alreadySent.title', { date: formatDate(lastSentAt) }),
            message: t('pims:alreadySent.message'),
            confirmLabel: t('pims:alreadySent.confirm'),
          });
          if (!again) return;
        }
        if (!patientsMatch(patientName, ezyvetName)) {
          const anyway = await confirmDialog({
            title: t('pims:mismatch.title'),
            message: t('pims:mismatch.message', {
              chart: patientName.trim() || t('pims:mismatch.noName'),
              ezyvet: ezyvetName?.trim() || t('pims:mismatch.unknown'),
            }),
            confirmLabel: t('pims:mismatch.sendAnyway'),
          });
          if (!anyway) return;
        }

        const effective = { ...map, ...edits } as Record<SourceKey, string | null>;
        let pngDataUrl: string | null = null;
        let pictureFailed = false;
        if (chartSnapshot && effective.chart != null) {
          try {
            pngDataUrl = await renderChartPicture(chartSnapshot, { pre: t('pims:picture.pre'), post: t('pims:picture.post') });
          } catch {
            pictureFailed = true;
          }
        }
        const { items, unresolved } = buildSendItems({
          note: split ?? { editedText: stored!.text, field: editedWanted },
          map: effective,
          fields: info.fields,
          pngDataUrl,
        });

        const rowsOut: ResultRow[] = [];
        if (items.length) {
          let result: SendResult;
          try {
            result = await send({
              type: 'send',
              tabId: tab.id,
              expectedPatient: patientName,
              confirmedEzyvetPatient: ezyvetName,
              items,
            });
          } catch (err) {
            setPhase({ kind: 'error', message: errorText(err, t('pims:errors.extension_error')), tabId: tab.id });
            return;
          }
          if (!result.ok) {
            setPhase({ kind: 'error', message: t(`pims:errors.${result.code}`), tabId: tab.id });
            return;
          }
          for (const r of result.results) rowsOut.push({ fieldTitle: r.fieldTitle, code: r.result.ok ? null : r.result.code });
        }
        for (const title of unresolved) rowsOut.push({ fieldTitle: title, code: 'field_not_found' });
        if (pictureFailed) rowsOut.push({ fieldTitle: t('pims:rows.chart'), code: 'picture_failed' });

        let stampFailed = false;
        if (chartId && rowsOut.some((r) => r.code === null)) {
          try {
            const { sentAt: at } = await markPimsSent(chartId);
            setJustSentAt(at);
            onSent(at);
          } catch {
            stampFailed = true;
          }
        }
        setPhase({ kind: 'results', info, rows: rowsOut, stampFailed });
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    };

    if (phase.kind === 'results') {
      body = (
        <>
          <h3 className="pims-dialog__subtitle">{t('pims:results.title')}</h3>
          <ul className="pims-dialog__results">
            {phase.rows.map((r, i) => (
              <li key={`${r.fieldTitle}-${i}`} className={r.code ? 'pims-dialog__result--failed' : 'pims-dialog__result--ok'}>
                <strong>{r.fieldTitle}</strong>
                {r.code
                  ? <span>{t(`pims:errors.${r.code}`)}</span>
                  : <span><span aria-hidden="true">✓ </span>{t('pims:results.sent')}</span>}
              </li>
            ))}
          </ul>
          {phase.stampFailed && <p className="login-error" role="alert">{t('pims:results.stampFailed')}</p>}
          {lastSentAt && <p className="patient-form__hint">{t('pims:dialog.sentOn', { date: formatDate(lastSentAt) })}</p>}
          {diagnosticLink(tab.id)}
        </>
      );
    } else {
      body = (
        <>
          <p className="pims-dialog__target">
            {ezyvetName
              ? t('pims:target', { patient: ezyvetName, title: tab.title })
              : t('pims:targetNoPatient', { title: tab.title })}
          </p>
          {info.candidates > 1 && <p className="patient-form__hint">{t('pims:severalTabs', { title: tab.title })}</p>}
          {lastSentAt && <p className="patient-form__hint">{t('pims:dialog.sentOn', { date: formatDate(lastSentAt) })}</p>}
          {!split && <p className="record-note__stale" role="status">{t('pims:editedNotice')}</p>}
          <h3 className="pims-dialog__subtitle">{t('pims:rows.heading')}</h3>
          <div className="pims-dialog__rows">
            {rows.map((r) => {
              const value = selectValue(r.wanted, r.options);
              return (
                <div key={r.key} className="pims-dialog__row">
                  <label htmlFor={`${idBase}-${r.key}`}>{r.label}</label>
                  <select
                    id={`${idBase}-${r.key}`}
                    className="patient-form__input"
                    value={value}
                    disabled={sending}
                    onChange={(e) => choose(r.key, e.target.value)}
                  >
                    <option value={DONT_SEND}>{t('pims:rows.dontSend')}</option>
                    {value === MISSING && <option value={MISSING}>{t('pims:rows.notOnPage', { title: r.wanted })}</option>}
                    {r.options.map((f) => <option key={f.title} value={f.title}>{f.title}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </>
      );
      footer = (
        <>
          <button type="button" className="diagram-view__action" onClick={() => void resetToDefaults()} disabled={sending}>
            {t('pims:rows.reset')}
          </button>
          <button type="button" className="diagram-view__action" onClick={onClose} disabled={sending}>
            {t('common:actions.cancel')}
          </button>
          <button
            type="button"
            className="entry-grid__button entry-grid__button--topbar"
            onClick={() => void doSend()}
            disabled={sending || nothingToSend}
          >
            {sending ? t('pims:actions.sending') : t('pims:actions.send')}
          </button>
        </>
      );
    }
  }

  return ReactDOM.createPortal(
    <div
      className="ai-settings-overlay"
      onClick={() => { if (!sending) onClose(); }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        // Close this dialog only, not the Documents window behind it.
        e.stopPropagation();
        if (!sending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t('pims:dialog.title')}
    >
      <div className="ai-settings-modal pims-dialog" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        {header}
        <div className="ai-settings-body">{body}</div>
        <footer className="ai-settings-footer">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
};
