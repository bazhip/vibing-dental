import React from 'react';
import { useTranslation } from 'react-i18next';
import type { CloudChartMeta } from '../../utils/chartQueries';
import { loadChartSnapshot } from '../../utils/chartQueries';
import { buildRecordNote, recordNoteT, recordNoteText } from '../../utils/recordNote';
import type { AppLanguage } from '../../i18n/config';
import type { ChartSnapshot } from '../../types';
import { usePimsSend } from '../../hooks/usePimsSend';
import { MappingRows } from '../../components/pims/MappingRows';
import { DiagnosticLink, SendResults } from '../../components/pims/SendResults';
import { friendlyError } from '../../components/ui/dialogs';
import { internalTransport } from './internalTransport';
import { useOffscreenChartPicture } from './OffscreenChartPicture';
import { useActiveTabChange } from './useActiveTabChange';

interface ChartSendProps {
  chart: CloudChartMeta;
  onBack: () => void;
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: ChartSnapshot; pimsSentAt: string | null };

/** The picked chart: its record note (read only) and the send to the open ezyVet consult. */
export const ChartSend: React.FC<ChartSendProps> = ({ chart, onBack }) => {
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
      <ChartSendReady chart={chart} snapshot={loaded.snapshot} pimsSentAt={loaded.pimsSentAt} back={back} />
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
  pimsSentAt: string | null;
  back: (disabled?: boolean) => React.ReactNode;
}

const ChartSendReady: React.FC<ReadyProps> = ({ chart, snapshot, pimsSentAt, back }) => {
  const { t, i18n } = useTranslation(['pims', 'common']);
  const lng = i18n.language as AppLanguage;
  const stored = snapshot.recordNote ?? null;
  // The stored note is split on its headings in the language it was written in.
  const note = React.useMemo(
    () => buildRecordNote(snapshot, recordNoteT(stored?.lng ?? lng)),
    [snapshot, stored, lng],
  );
  const picture = useOffscreenChartPicture(snapshot);
  const [sentAt, setSentAt] = React.useState<string | null>(pimsSentAt);
  const patientName = snapshot.patientInfo.patientName || chart.patient_name;

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
    sentAt,
    onSent: setSentAt,
  });

  // The vet moved to another tab or came back to the panel: look again (quietly, keeping the mapping choices), unless a send (or its
  // confirmations) is under way or the results are showing.
  useActiveTabChange(() => {
    if (sending) return;
    if (phase.kind === 'ready') void refreshTarget();
    else if (phase.kind === 'error') void load();
  });

  const retry = (
    <button type="button" className="sp-secondary" onClick={() => void load()}>{t('pims:dialog.retry')}</button>
  );

  let body: React.ReactNode;
  if (phase.kind === 'loading') {
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
      <textarea
        className="sp-note"
        readOnly
        aria-label={t('pims:panel.chart.noteLabel')}
        value={stored?.text ?? recordNoteText(note)}
      />
      {picture.element}
      {body}
    </section>
  );
};
