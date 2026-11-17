import React from 'react';
import { useTranslation } from 'react-i18next';
import type { StoredRecordNote } from '../types';
import type { InspectResult, ItemResult, SendResult } from '../extension/protocol';
import { HEADING_KEYS, type RecordNote, type RecordNoteKey } from '../utils/recordNote';
import {
  buildSendItems,
  splitStoredNote,
  targetableFields,
  type PimsFieldMap,
  type SourceKey,
} from '../utils/pims/mapping';
import { DONT_SEND, MISSING, selectValue, type MappingRow, type RowKey } from '../utils/pims/rowChoice';
import { patientsMatch, pimsPatientMatch, samePatientNumber } from '../utils/pims/patientMatch';
import type { PimsTransport } from '../utils/pims/extensionBridge';
import { markPimsSent } from '../utils/edgeFunctions';
import { usePimsFieldMap } from './usePimsFieldMap';
import { supabase } from '../utils/supabaseClient';
import { copyRichText } from '../utils/clipboard';
import { errorText } from '../utils/apiErrors';
import { confirmDialog, toast } from '../components/ui/dialogs';

export type FailCode = Extract<ItemResult, { ok: false }>['code'] | 'picture_failed';
export type ResultRow = { fieldTitle: string; code: FailCode | null };

/** Failures that may come after ezyVet already saved the field: the next Send asks first. */
const MAYBE_WRITTEN: ReadonlySet<FailCode> = new Set<FailCode>([
  'popup_not_closed',
  'save_not_confirmed',
  'save_button_not_found',
  'extension_error',
]);

export type PimsPhase =
  | { kind: 'loading' }
  | { kind: 'notInstalled' }
  | { kind: 'error'; message: string; tabId?: number }
  | { kind: 'ready'; info: InspectResult }
  | { kind: 'results'; info: InspectResult; rows: ResultRow[]; stampFailed: boolean };

/** Did the consult the vet was looking at change since `a` was inspected? */
function targetChanged(a: InspectResult, b: InspectResult): boolean {
  const sa = a.status;
  const sb = b.status;
  return (
    a.tab?.id !== b.tab?.id ||
    (sa?.provider ?? 'ezyvet') !== (sb?.provider ?? 'ezyvet') ||
    (sa?.state === 'writable') !== (sb?.state === 'writable') ||
    (sa?.patientName ?? null) !== (sb?.patientName ?? null) ||
    (sa?.consult?.viewId ?? null) !== (sb?.consult?.viewId ?? null) ||
    (sa?.consult?.recordId ?? null) !== (sb?.consult?.recordId ?? null)
  );
}

export interface UsePimsSendOptions {
  transport: PimsTransport;
  /** The generated note (in `stored.lng` when there is a stored note, so it can be split). */
  note: RecordNote;
  /** The edited note on the chart, sent instead of `note` when present. */
  stored: StoredRecordNote | null;
  /** A PNG data URL of the chart picture, or null. Called only when the chart row targets a field.
   *  `hasChartPicture` says whether there is a chart row at all. */
  chartSnapshotPicture: () => Promise<string | null>;
  hasChartPicture: boolean;
  /** Cloud chart id (null = not saved to the cloud: nothing is stamped). */
  chartId: string | null;
  patientName: string;
  /** The chart's patient number ('' = none). When ezyVet's is known too, the numbers decide the
   *  patient check instead of the names. */
  patientNumber: string;
  /** When the chart was last sent (null = unknown; the hook looks it up). */
  sentAt: string | null;
  onSent: (sentAt: string) => void;
  /** Loads and resets when this turns true. Default true. */
  open?: boolean;
  /** Without two patient numbers to compare: does the ezyVet patient count as the chart's patient
   *  (no confirmation)? Default `patientsMatch` (whole words of the shorter name); the side panel
   *  passes a stricter rule. */
  patientMatcher?: (chartName: string, ezyvetName: string | null) => boolean;
}

/**
 * The Send to ezyVet flow: find the open consult through the transport, work out where each part of
 * the note goes (the vet's saved map over the defaults), check the patient, write, and stamp the chart.
 * Nothing from the ezyVet page is stored or sent anywhere; the diagnostic report only copies what
 * the transport's `diagnose` returns.
 */
export function usePimsSend({
  transport, note, stored, chartSnapshotPicture, hasChartPicture, chartId, patientName, patientNumber, sentAt, onSent, open = true,
  patientMatcher = patientsMatch,
}: UsePimsSendOptions) {
  const { t, i18n } = useTranslation(['pims', 'media', 'app', 'forms', 'common']);
  const [phase, setPhase] = React.useState<PimsPhase>({ kind: 'loading' });
  const provider = (phase.kind === 'ready' || phase.kind === 'results' ? phase.info.status?.provider : undefined) ?? 'ezyvet';
  const { map, save, reset } = usePimsFieldMap(provider);
  const [edits, setEdits] = React.useState<PimsFieldMap>({});
  const [editedField, setEditedField] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => {
    setEdits({});
    setEditedField(undefined);
  }, [provider]);
  const [sending, setSending] = React.useState(false);
  // Set when Send found a different consult than the one on screen (and sent nothing).
  const [changedTarget, setChangedTarget] = React.useState(false);
  const sendingRef = React.useRef(false);
  // The target the vet saw when the screen loaded: a refresh that shows it again clears the notice.
  const loadedInfo = React.useRef<InspectResult | null>(null);
  // Only the newest quiet refresh may update the screen; load and Send make older ones void.
  const refreshId = React.useRef(0);
  const [fetchedSentAt, setFetchedSentAt] = React.useState<string | null>(null);
  const [justSentAt, setJustSentAt] = React.useState<string | null>(null);
  // Send waits for the send-date lookup, so a re-send always asks first.
  const [sentAtSettled, setSentAtSettled] = React.useState(true);
  const lastSentAt = justSentAt ?? sentAt ?? fetchedSentAt;

  const load = React.useCallback(async () => {
    refreshId.current++;
    loadedInfo.current = null;
    setPhase({ kind: 'loading' });
    setChangedTarget(false);
    const version = await transport.ping();
    if (!version) { setPhase({ kind: 'notInstalled' }); return; }
    try {
      const first = await transport.inspect();
      loadedInfo.current = first;
      setPhase({ kind: 'ready', info: first });
    } catch (err) {
      setPhase({ kind: 'error', message: errorText(err, t('pims:errors.extension_error')) });
    }
  }, [t, transport]);

  /** A quiet look at the ezyVet tab (no loading screen, no ping): keeps the mapping choices, updates the
   *  target in place, and flags a change. For the panel gaining focus or the active tab changing. */
  const refreshTarget = async () => {
    if (phase.kind !== 'ready' || sendingRef.current) return;
    const id = ++refreshId.current;
    const seen = loadedInfo.current ?? phase.info;
    let fresh: InspectResult;
    try {
      fresh = await transport.inspect();
    } catch {
      return; // Quiet: Send looks again and reports a failure itself.
    }
    // An older inspect that lands after a newer one (or after a load or a Send started) is ignored.
    if (id !== refreshId.current || sendingRef.current) return;
    // Back on the consult the vet saw at load: the notice goes.
    setChangedTarget(targetChanged(seen, fresh));
    setPhase((p) => (p.kind === 'ready' ? { kind: 'ready', info: fresh } : p));
  };

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
    if (!open || !chartId || !supabase) { setSentAtSettled(true); return; }
    setSentAtSettled(false);
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase!.from('charts').select('pims_sent_at').eq('id', chartId).maybeSingle();
        if (cancelled || error) return;
        setFetchedSentAt((data as { pims_sent_at?: string | null } | null)?.pims_sent_at ?? null);
      } catch { /* unknown */ } finally {
        if (!cancelled) setSentAtSettled(true);
      }
    })();
    return () => { cancelled = true; };
  }, [open, chartId]);

  // What is sent: the generated note, the edited note split back into its
  // sections, or (when the split fails) the edited note as one block.
  const split = React.useMemo(() => (stored ? splitStoredNote(stored.text, note) : note), [stored, note]);
  const sections = split?.sections ?? [];

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
      const report = JSON.stringify(await transport.diagnose(tabId), null, 2);
      const html = `<pre>${report.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
      const outcome = await copyRichText(html, report, t('pims:actions.diagnosticPrompt'));
      if (outcome !== 'prompt') toast(t('pims:actions.diagnosticCopied'), { kind: 'success' });
    } catch (err) {
      toast(errorText(err, t('pims:errors.extension_error')), { kind: 'error' });
    }
  };

  const wantedFor = (key: SourceKey): string | null => (key in edits ? edits[key]! : map[key]) ?? null;
  const editedWanted =
    editedField !== undefined ? editedField : map.editedNote !== undefined ? map.editedNote : map.treatment;

  // Only meaningful once the tab is writable; the mapping rows are shown from then on.
  const info = phase.kind === 'ready' || phase.kind === 'results' ? phase.info : null;
  const writable = !!info?.tab && info.status?.state === 'writable';
  const targets = writable ? targetableFields(info!.fields) : [];
  const imageTargets = targets.filter((f) => f.acceptsImage);

  const rows: MappingRow[] = writable
    ? split
      ? sections.map((s) => ({ key: s.key, label: t(HEADING_KEYS[s.key as RecordNoteKey]), options: targets, wanted: wantedFor(s.key) }))
      : [{ key: 'edited', label: t('pims:rows.edited'), options: targets, wanted: editedWanted }]
    : [];
  if (writable && hasChartPicture) rows.push({ key: 'chart', label: t('pims:rows.chart'), options: imageTargets, wanted: wantedFor('chart') });

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
    if (phase.kind !== 'ready' || !info?.tab || sendingRef.current) return;
    sendingRef.current = true;
    refreshId.current++;
    setSending(true);
    try {
      // Look again first: the vet may have switched consults in ezyVet since this screen loaded.
      let fresh: InspectResult;
      try {
        fresh = await transport.inspect();
      } catch (err) {
        setPhase({ kind: 'error', message: errorText(err, t('pims:errors.extension_error')) });
        return;
      }
      if (targetChanged(info, fresh)) {
        setPhase({ kind: 'ready', info: fresh });
        setChangedTarget(true);
        return;
      }
      setChangedTarget(false);
      const info2 = fresh;
      const tab = info2.tab!;
      const ezyvetName = info2.status!.patientName;
      const ezyvetNumber = info2.status!.patientNumber;
      const changes = editedField !== undefined ? { ...edits, editedNote: editedField } : edits;
      if (Object.keys(changes).length) {
        // Saving the map must not stop the send.
        try { await save(changes); } catch { /* the choices still apply to this send */ }
      }
      if (lastSentAt) {
        const again = await confirmDialog({
          title: t('pims:alreadySent.title', { date: formatDate(lastSentAt) }),
          message: t('pims:alreadySent.message'),
          confirmLabel: t('pims:alreadySent.confirm'),
        });
        if (!again) return;
      }
      const match = pimsPatientMatch(
        { name: patientName, number: patientNumber },
        { name: ezyvetName, number: ezyvetNumber },
        patientMatcher,
      );
      if (match === 'different' || (provider !== 'ezyvet' && !patientMatcher(patientName, ezyvetName))) {
        const names = {
          chart: patientName.trim() || t('pims:mismatch.noName'),
          ezyvet: ezyvetName?.trim() || t('pims:mismatch.unknown'),
        };
        // Both numbers known (and so different): show them, they are what the check went on.
        const message = samePatientNumber(patientNumber, ezyvetNumber) === false
          ? t('pims:mismatch.messageNumbers', { ...names, chartNumber: patientNumber.trim(), ezyvetNumber: ezyvetNumber!.trim() })
          : t('pims:mismatch.message', names);
        const anyway = await confirmDialog({
          title: t('pims:mismatch.title'),
          message,
          confirmLabel: t('pims:mismatch.sendAnyway'),
        });
        if (!anyway) return;
      }

      const effective = { ...map, ...edits } as Record<SourceKey, string | null>;
      let pngDataUrl: string | null = null;
      let pictureFailed = false;
      // A chart target not on this page is reported, not rendered.
      const chartMissing = hasChartPicture && selectValue(effective.chart, imageTargets) === MISSING;
      if (hasChartPicture && effective.chart != null && !chartMissing) {
        try {
          pngDataUrl = await chartSnapshotPicture();
        } catch {
          pictureFailed = true;
        }
        // No picture for a row that targets a field is a failure to report, not a silent skip.
        if (!pngDataUrl) pictureFailed = true;
      }
      const { items, unresolved } = buildSendItems({
        note: split ?? { editedText: stored!.text, field: editedWanted },
        map: effective,
        fields: info2.fields,
        pngDataUrl,
      });

      const rowsOut: ResultRow[] = [];
      if (items.length) {
        let result: SendResult;
        try {
          result = await transport.send({
            type: 'send',
            tabId: tab.id,
            expectedPatient: patientName,
            confirmedEzyvetPatient: ezyvetName,
            expectedConsult: info2.status!.consult ?? null,
            expectedPims: info2.status!.provider ?? 'ezyvet',
            items,
          });
        } catch {
          // Timed out or lost the extension mid-send: some fields may be
          // written, so the next Send asks first.
          const at = new Date().toISOString();
          setJustSentAt(at);
          onSent(at);
          setPhase({ kind: 'error', message: t('pims:errors.maybe_sent'), tabId: tab.id });
          return;
        }
        if (!result.ok) {
          setPhase({ kind: 'error', message: t(`pims:errors.${result.code}`), tabId: tab.id });
          return;
        }
        for (const r of result.results) rowsOut.push({ fieldTitle: r.fieldTitle, code: r.result.ok ? null : r.result.code });
      }
      for (const title of unresolved) rowsOut.push({ fieldTitle: title, code: 'field_not_found' });
      if (chartMissing && !unresolved.includes(effective.chart!)) rowsOut.push({ fieldTitle: effective.chart!, code: 'field_not_found' });
      if (pictureFailed) rowsOut.push({ fieldTitle: t('pims:rows.chart'), code: 'picture_failed' });

      let stampFailed = false;
      if (rowsOut.some((r) => r.code === null)) {
        // Remember the send even when it can't be recorded on the chart.
        let at = new Date().toISOString();
        if (chartId) {
          try {
            at = (await markPimsSent(chartId)).sentAt;
          } catch {
            stampFailed = true;
          }
        }
        setJustSentAt(at);
        onSent(at);
      } else if (rowsOut.some((r) => r.code !== null && MAYBE_WRITTEN.has(r.code))) {
        // Nothing confirmed, but a field may have been saved: like a lost send, the next Send asks.
        const at = new Date().toISOString();
        setJustSentAt(at);
        onSent(at);
      }
      setPhase({ kind: 'results', info: info2, rows: rowsOut, stampFailed });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return {
    phase, rows, split, sending, changedTarget, sentAtSettled, lastSentAt, nothingToSend,
    load, refreshTarget, choose, resetToDefaults, doSend, copyDiagnostic, formatDate,
  };
}
