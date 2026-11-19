/// <reference types="chrome" />
import { useProfile } from '../../hooks/useProfile';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CloudChartMeta } from '../../utils/chartQueries';
import { loadChartSnapshot } from '../../utils/chartQueries';
import { buildRecordNote, recordNoteBasis, recordNoteT, recordNoteText } from '../../utils/recordNote';
import type { AppLanguage } from '../../i18n/config';
import type { ChartSnapshot } from '../../types';
import { usePimsSend } from '../../hooks/usePimsSend';
import { MappingRows } from '../../components/pims/MappingRows';
import { CopyActions } from '../../components/pims/CopyActions';
import { PimsDrafts } from '../../components/pims/PimsDrafts';
import { PimsImages } from '../../components/pims/PimsImages';
import { PimsExam } from '../../components/pims/PimsExam';
import { PimsNoteAutofill } from '../../components/pims/PimsNoteAutofill';
import type { SelectedImageTransfer } from '../../utils/pims/images';
import { PimsUploadReview } from '../../components/pims/PimsUploadReview';
import { DiagnosticLink, SendResults } from '../../components/pims/SendResults';
import { friendlyError, toast } from '../../components/ui/dialogs';
import { WEB_APP_ORIGIN } from '../protocol';
import { internalTransport } from './internalTransport';
import { useOffscreenChartPicture } from './OffscreenChartPicture';
import { useActiveTabChange } from './useActiveTabChange';
import { patientsMatchStrict } from '../../utils/pims/patientMatch';
import type { PimsSendFlag } from './usePimsSendFlag';

interface ChartSendProps {
  chart: CloudChartMeta;
  onBack: () => void;
  /** Whether the practice may send (anything but 'on' shows a notice and no Send). */
  sendFlag: PimsSendFlag;
  onRetrySendFlag?: () => void;
  /** When this panel session last sent (or may have sent) this chart; outlives this screen, so a
   *  send that never reached pims_sent_at still asks first after Back. */
  knownSentAt?: string | null;
  onSent?: (sentAt: string) => void;
  /** True while a send (or its confirmations) is running. */
  onBusyChange?: (busy: boolean) => void;
}

/** The later of two ISO dates (either may be missing). */
function later(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: ChartSnapshot; pimsSentAt: string | null };
type NoteReload = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string };

/** The picked chart: its record note (read only) and the send to the open ezyVet consult. */
export const ChartSend: React.FC<ChartSendProps> = ({
  chart, onBack, sendFlag, onRetrySendFlag, knownSentAt = null, onSent, onBusyChange,
}) => {
  const { t } = useTranslation(['pims', 'common']);
  const [loaded, setLoaded] = React.useState<Loaded>({ kind: 'loading' });
  const [request, setRequest] = React.useState<{ chartId: string; reloadNote: boolean }>();
  const [noteReload, setNoteReload] = React.useState<NoteReload>({ kind: 'idle' });
  const requestChart = (reloadNote: boolean) => {
    if (reloadNote) setNoteReload({ kind: 'loading' });
    else setLoaded({ kind: 'loading' });
    setRequest({ chartId: chart.id, reloadNote });
  };

  React.useEffect(() => {
    let cancelled = false;
    const reloadNote = request?.chartId === chart.id && request.reloadNote;
    if (!reloadNote) {
      setLoaded({ kind: 'loading' });
      setNoteReload({ kind: 'idle' });
    }
    loadChartSnapshot(chart.id).then(
      ({ snapshot, pimsSentAt }) => {
        if (cancelled) return;
        setLoaded({ kind: 'ready', snapshot, pimsSentAt });
        if (reloadNote) setNoteReload({ kind: 'idle' });
      },
      (err) => {
        if (cancelled) return;
        const error = { kind: 'error', message: friendlyError(err) } as const;
        if (reloadNote) setNoteReload(error);
        else setLoaded(error);
      },
    );
    return () => { cancelled = true; };
  }, [chart.id, request]);

  // Not while a send is running: the next screen couldn't show what it did.
  const back = (disabled = false) => (
    <button type="button" className="sp-link" onClick={onBack} disabled={disabled}>{t('pims:panel.chart.back')}</button>
  );

  if (loaded.kind === 'ready') {
    return (
      <ChartSendReady
        chart={chart}
        snapshot={loaded.snapshot}
        initialSentAt={later(knownSentAt, loaded.pimsSentAt)}
        back={back}
        onReloadChart={() => requestChart(true)}
        noteReload={noteReload}
        sendFlag={sendFlag}
        onRetrySendFlag={onRetrySendFlag}
        onSent={onSent}
        onBusyChange={onBusyChange}
      />
    );
  }
  return (
    <section className="sp-chartview">
      {back()}
      <h2 className="sp-section">{chart.patient_name}</h2>
      {loaded.kind === 'loading' ? (
        <p className="sp-hint" role="status">{t('pims:panel.chart.loading')}</p>
      ) : (
        <>
          <p className="sp-error" role="alert">{loaded.message}</p>
          <button type="button" className="sp-secondary" onClick={() => requestChart(false)}>
            {t('pims:dialog.retry')}
          </button>
        </>
      )}
    </section>
  );
};

interface ReadyProps {
  chart: CloudChartMeta;
  snapshot: ChartSnapshot;
  initialSentAt: string | null;
  back: (disabled?: boolean) => React.ReactNode;
  onReloadChart: () => void;
  noteReload: NoteReload;
  sendFlag: PimsSendFlag;
  onRetrySendFlag?: () => void;
  onSent?: (sentAt: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

const ChartSendReady: React.FC<ReadyProps> = ({
  chart, snapshot, initialSentAt, back, onReloadChart, noteReload, sendFlag, onRetrySendFlag, onSent, onBusyChange,
}) => {
  const { t, i18n } = useTranslation(['pims', 'media', 'common']);
  const profile = useProfile();
  const reloadControl = React.useRef<HTMLButtonElement>(null);
  const restoreReloadFocus = React.useRef(false);
  const refreshing = noteReload.kind === 'loading';
  React.useEffect(() => {
    if (refreshing || !restoreReloadFocus.current) return;
    restoreReloadFocus.current = false;
    if (document.activeElement === document.body || document.activeElement === reloadControl.current) reloadControl.current?.focus();
  }, [refreshing]);
  const lng = i18n.language as AppLanguage;
  const stored = snapshot.recordNote ?? null;
  // The stored note is split on its headings in the language it was written in.
  const note = React.useMemo(
    () => buildRecordNote(snapshot, recordNoteT(stored?.lng ?? lng)),
    [snapshot, stored, lng],
  );
  // Same rule as the Record note panel: the chart changed since the note was edited.
  const stale = !!stored && stored.basedOn !== recordNoteBasis(snapshot);
  const picture = useOffscreenChartPicture(snapshot);
  const [sentAt, setSentAt] = React.useState<string | null>(initialSentAt);
  const patientName = snapshot.patientInfo.patientName || chart.patient_name;
  const patientNumber = snapshot.patientInfo.patientNumber || chart.patient_number || '';
  const ownerName = snapshot.patientInfo.ownerName || chart.owner_name;
  const canSend = sendFlag === 'on';
  const [savedImage, setSavedImage] = React.useState<SelectedImageTransfer | null>(null);
  const [examBusy, setExamBusy] = React.useState(false);
  const [noteBusy, setNoteBusy] = React.useState(false);
  // The panel proposed this chart itself, so without two patient numbers to compare only an exact
  // name (or name + owner surname) skips the "Different patient?" confirmation.
  const patientMatcher = React.useCallback(
    (chartName: string, ezyvetName: string | null) => patientsMatchStrict(chartName, ownerName, ezyvetName),
    [ownerName],
  );
  const handleSent = (at: string) => {
    setSentAt(at);
    onSent?.(at);
  };

  const {
    phase, rows, split, sending, changedTarget, sentAtSettled, lastSentAt, nothingToSend, mappingStatus,
    load, refreshTarget, choose, resetToDefaults, doSend, copyDiagnostic, formatDate,
  } = usePimsSend({
    transport: internalTransport,
    note,
    stored,
    chartSnapshotPicture: picture.render,
    hasChartPicture: picture.hasDiagrams,
    savedImage,
    chartId: chart.id,
    patientName,
    patientNumber,
    sentAt: later(sentAt, initialSentAt),
    onSent: handleSent,
    open: canSend,
    patientMatcher,
  });

  const busy = React.useRef(onBusyChange);
  busy.current = onBusyChange;
  const actionsBusy = sending || examBusy || noteBusy;
  const noteUnavailable = noteReload.kind !== 'idle';
  const disableTransfer = actionsBusy || noteUnavailable;
  // Match the chart route's permitted ID segment before offering navigation.
  const consultationAvailable = profile.loaded && profile.consultationEnabled && /^[A-Za-z0-9-]+$/.test(chart.id);
  const openingConsultation = React.useRef(false);
  const openConsultation = async () => {
    if (!consultationAvailable || actionsBusy || openingConsultation.current) return;
    openingConsultation.current = true;
    try {
      await chrome.tabs.create({ url: `${WEB_APP_ORIGIN}/#/chart/${chart.id}/consultation` });
    } catch (error) {
      toast(friendlyError(error, t('common:errors.generic')), { kind: 'error' });
    } finally {
      openingConsultation.current = false;
    }
  };
  React.useEffect(() => { busy.current?.(actionsBusy); }, [actionsBusy]);
  React.useEffect(() => () => busy.current?.(false), []);

  // The vet moved to another tab or came back to the panel: look again (quietly, keeping the mapping choices), unless a send (or its
  // confirmations) is under way or the results are showing.
  useActiveTabChange(() => {
    if (actionsBusy || !canSend) return;
    if (phase.kind === 'ready') void refreshTarget();
    else if (phase.kind === 'error') void load();
  }, phase.kind === 'ready' || phase.kind === 'results' ? phase.info.tab?.id ?? null : null);

  const retry = (
    <button type="button" className="sp-secondary" onClick={() => void load()} disabled={actionsBusy}>{t('pims:dialog.retry')}</button>
  );

  const destination = phase.kind === 'ready' || phase.kind === 'results' ? phase.info : null;
  const notePreview = (
    <details className="sp-note-preview" aria-busy={refreshing}>
      <summary>{t('pims:panel.chart.noteLabel')}</summary>
      <textarea
        className="sp-note"
        readOnly
        aria-label={t('pims:panel.chart.noteLabel')}
        value={stored?.text ?? recordNoteText(note)}
      />
      {consultationAvailable && (
        <button ref={reloadControl} type="button" className="sp-link sp-consultation-action" disabled={actionsBusy || refreshing} onClick={() => {
          restoreReloadFocus.current = document.activeElement === reloadControl.current;
          onReloadChart();
        }}>
          {t('pims:panel.chart.reloadSavedNote')}
        </button>
      )}
      {noteReload.kind === 'error' && <p className="sp-error" role="alert">{noteReload.message}</p>}
    </details>
  );

  let body: React.ReactNode;
  if (sendFlag === 'loading') {
    body = <p className="sp-hint" role="status">{t('pims:panel.chart.flagLoading')}</p>;
  } else if (sendFlag === 'error') {
    body = (
      <>
        <p className="sp-error" role="alert">{t('pims:panel.chart.flagFailed')}</p>
        <button type="button" className="sp-secondary" onClick={() => onRetrySendFlag?.()}>{t('pims:dialog.retry')}</button>
      </>
    );
  } else if (sendFlag === 'off') {
    body = <p className="sp-hint" role="status">{t('pims:panel.chart.sendOff')}</p>;
  } else if (phase.kind === 'loading') {
    body = <p className="sp-hint" role="status">{t('pims:dialog.loading')}</p>;
  } else if (phase.kind === 'notInstalled') {
    body = (
      <>
        <h3 className="sp-subtitle">{t('pims:install.title')}</h3>
        <p>{t('pims:install.body')}</p>
        {retry}
      </>
    );
  } else if (phase.kind === 'error') {
    body = (
      <>
        <p className="sp-error" role="alert">{phase.message}</p>
        <DiagnosticLink onCopy={() => void copyDiagnostic(phase.tabId)} />
        {retry}
      </>
    );
  } else if (!phase.info.tab) {
    body = (
      <>
        <p role="status">{t('pims:noTab')}</p>
        {retry}
      </>
    );
  } else if (phase.info.status?.state !== 'writable') {
    const state = phase.info.status?.state;
    body = (
      <>
        <p role="status">{state ? t(`pims:state.${state}`) : t('pims:errors.extension_error')}</p>
        <DiagnosticLink onCopy={() => void copyDiagnostic(phase.info.tab!.id)} />
        {retry}
      </>
    );
  } else if (phase.kind === 'results') {
    const tab = phase.info.tab!;
    body = (
      <SendResults
        rows={phase.rows}
        stampFailed={phase.stampFailed}
        sentOn={lastSentAt ? formatDate(lastSentAt) : null}
        onCopyDiagnostic={() => void copyDiagnostic(tab.id)}
      />
    );
  } else {
    body = (
      <>
        {!split && <p className="sp-hint" role="status">{t('pims:editedNotice')}</p>}
        <h3 className="sp-subtitle">{t('pims:rows.heading')}</h3>
        <MappingRows rows={rows} disabled={disableTransfer} onChoose={choose} />
          {mappingStatus !== 'ready' && <p className="patient-form__hint" role={mappingStatus === 'error' ? 'alert' : 'status'}>{t(`pims:noteAutofill.mappingStatus.${mappingStatus}`)}</p>}
          {mappingStatus === 'error' && <button type="button" className="diagram-view__action" onClick={() => void load()}>{t('pims:noteAutofill.reloadMapping')}</button>}
        {changedTarget && <p className="sp-hint" role="status">{t('pims:send.targetChanged')}</p>}
        {notePreview}
        <div className="sp-actions">
          <button type="button" className="sp-secondary" onClick={() => void resetToDefaults()} disabled={disableTransfer}>
            {t('pims:rows.reset')}
          </button>
          <button
            type="button"
            className="sp-primary"
            onClick={() => void doSend()}
            disabled={disableTransfer || nothingToSend || !sentAtSettled}
          >
            {sending ? t('pims:actions.sending') : t('pims:actions.send')}
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="sp-chartview">
      {back(actionsBusy)}
      <div className="sp-chartview__summary">
        <h2 className="sp-section">{patientName}</h2>
        {consultationAvailable && (
          <button type="button" className="sp-link sp-consultation-action" disabled={actionsBusy} onClick={() => void openConsultation()}>
            {t('pims:panel.chart.openConsultation')}
          </button>
        )}
      </div>
      {lastSentAt && <p className="sp-hint">{t('pims:dialog.sentOn', { date: formatDate(lastSentAt) })}</p>}
      {destination?.tab && (
        <aside className="sp-destination" aria-label={t('pims:panel.chart.destination')}>
          <h3 className="sp-subtitle">{t('pims:panel.chart.destination')}</h3>
          <p className="sp-target">
            {destination.status?.patientName
              ? t('pims:target', { patient: destination.status.patientName, title: destination.tab.title })
              : t('pims:targetNoPatient', { title: destination.tab.title })}
          </p>
          {destination.candidates > 1 && <p className="sp-hint">{t('pims:severalTabs', { title: destination.tab.title })}</p>}
        </aside>
      )}
      {stale && <p className="sp-hint" role="status">{t('media:recordNote.stale')}</p>}
      {picture.element}
      {canSend && destination && <PimsExam inspection={destination} transport={internalTransport} chartKey={chart.id}
        disabled={sending || noteBusy} onBusyChange={setExamBusy} onOpened={() => void load()} />}
      {canSend && <PimsNoteAutofill note={note} stored={stored} chartKey={chart.id} patientName={patientName}
        transport={internalTransport} disabled={sending || examBusy || noteUnavailable} onBusyChange={setNoteBusy} />}
      {canSend && <CopyActions note={note} storedText={stored?.text ?? null}
        renderImage={picture.hasDiagrams ? picture.render : undefined} disabled={disableTransfer} />}
      {canSend && <PimsDrafts key={chart.id} chartId={chart.id} aiEnabled={profile.loaded && profile.aiEnabled} radiologyTransport={internalTransport} disabled={actionsBusy}
        instinctUpload={destination?.tab && destination.status?.provider === 'instinct'
          ? { tabId: destination.tab.id, transport: internalTransport } : undefined} />}
      {canSend && <PimsImages editorTransfer chartId={chart.id} disabled={actionsBusy} onTransferSelect={setSavedImage}
        canTransfer={phase.kind === 'ready' && destination?.status?.state === 'writable' && (destination.status.provider ?? 'ezyvet') === 'ezyvet'
          && destination.fields.some(field => field.acceptsImage && field.kind !== 'email')} />}
      {canSend && <PimsUploadReview chartId={chart.id} disabled={actionsBusy} />}
      {body}
      {(phase.kind !== 'ready' || !canSend || destination?.status?.state !== 'writable') && notePreview}
    </section>
  );
};
