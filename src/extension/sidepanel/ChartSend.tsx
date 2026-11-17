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
import { DiagnosticLink, SendResults } from '../../components/pims/SendResults';
import { friendlyError } from '../../components/ui/dialogs';
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

/** The picked chart: its record note (read only) and the send to the open ezyVet consult. */
export const ChartSend: React.FC<ChartSendProps> = ({
  chart, onBack, sendFlag, onRetrySendFlag, knownSentAt = null, onSent, onBusyChange,
}) => {
  const { t } = useTranslation(['pims', 'common']);
  const [loaded, setLoaded] = React.useState<Loaded>({ kind: 'loading' });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoaded({ kind: 'loading' });
    loadChartSnapshot(chart.id).then(
      ({ snapshot, pimsSentAt }) => { if (!cancelled) setLoaded({ kind: 'ready', snapshot, pimsSentAt }); },
      (err) => { if (!cancelled) setLoaded({ kind: 'error', message: friendlyError(err) }); },
    );
    return () => { cancelled = true; };
  }, [chart.id, attempt]);

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
          <button type="button" className="sp-secondary" onClick={() => setAttempt((n) => n + 1)}>
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
  sendFlag: PimsSendFlag;
  onRetrySendFlag?: () => void;
  onSent?: (sentAt: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

const ChartSendReady: React.FC<ReadyProps> = ({
  chart, snapshot, initialSentAt, back, sendFlag, onRetrySendFlag, onSent, onBusyChange,
}) => {
  const { t, i18n } = useTranslation(['pims', 'media', 'common']);
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
    phase, rows, split, sending, changedTarget, sentAtSettled, lastSentAt, nothingToSend,
    load, refreshTarget, choose, resetToDefaults, doSend, copyDiagnostic, formatDate,
  } = usePimsSend({
    transport: internalTransport,
    note,
    stored,
    chartSnapshotPicture: picture.render,
    hasChartPicture: picture.hasDiagrams,
    chartId: chart.id,
    patientName,
    patientNumber,
    sentAt,
    onSent: handleSent,
    open: canSend,
    patientMatcher,
  });

  const busy = React.useRef(onBusyChange);
  busy.current = onBusyChange;
  React.useEffect(() => { busy.current?.(sending); }, [sending]);
  React.useEffect(() => () => busy.current?.(false), []);

  // The vet moved to another tab or came back to the panel: look again (quietly, keeping the mapping choices), unless a send (or its
  // confirmations) is under way or the results are showing.
  useActiveTabChange(() => {
    if (sending || !canSend) return;
    if (phase.kind === 'ready') void refreshTarget();
    else if (phase.kind === 'error') void load();
  }, phase.kind === 'ready' || phase.kind === 'results' ? phase.info.tab?.id ?? null : null);

  const retry = (
    <button type="button" className="sp-secondary" onClick={() => void load()}>{t('pims:dialog.retry')}</button>
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
    const tab = phase.info.tab;
    const ezyvetName = phase.info.status!.patientName;
    body = (
      <>
        <p className="sp-target">
          {ezyvetName
            ? t('pims:target', { patient: ezyvetName, title: tab.title })
            : t('pims:targetNoPatient', { title: tab.title })}
        </p>
        {phase.info.candidates > 1 && <p className="sp-hint">{t('pims:severalTabs', { title: tab.title })}</p>}
        {!split && <p className="sp-hint" role="status">{t('pims:editedNotice')}</p>}
        <h3 className="sp-subtitle">{t('pims:rows.heading')}</h3>
        <MappingRows rows={rows} disabled={sending} onChoose={choose} />
        {changedTarget && <p className="sp-hint" role="status">{t('pims:send.targetChanged')}</p>}
        <div className="sp-actions">
          <button type="button" className="sp-secondary" onClick={() => void resetToDefaults()} disabled={sending}>
            {t('pims:rows.reset')}
          </button>
          <button
            type="button"
            className="sp-primary"
            onClick={() => void doSend()}
            disabled={sending || nothingToSend || !sentAtSettled}
          >
            {sending ? t('pims:actions.sending') : t('pims:actions.send')}
          </button>
        </div>
      </>
    );
  }

  return (
    <section className="sp-chartview">
      {back(sending)}
      <h2 className="sp-section">{patientName}</h2>
      {lastSentAt && <p className="sp-hint">{t('pims:dialog.sentOn', { date: formatDate(lastSentAt) })}</p>}
      {stale && <p className="sp-hint" role="status">{t('media:recordNote.stale')}</p>}
      <textarea
        className="sp-note"
        readOnly
        aria-label={t('pims:panel.chart.noteLabel')}
        value={stored?.text ?? recordNoteText(note)}
      />
      {picture.element}
      {canSend && <CopyActions note={note} storedText={stored?.text ?? null}
        renderImage={picture.hasDiagrams ? picture.render : undefined} disabled={sending} />}
      {body}
    </section>
  );
};
