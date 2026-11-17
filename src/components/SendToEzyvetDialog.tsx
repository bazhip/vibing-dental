import React from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ChartSnapshot as PreviewSnapshot } from './PdfPreviewModal';
import type { StoredRecordNote } from '../types';
import type { RecordNote } from '../utils/recordNote';
import { appointments, diagnose, inspect, ping, send, startChart, takePendingPatient, type PimsTransport } from '../utils/pims/extensionBridge';
import { renderChartPicture } from '../utils/pims/chartPicture';
import { usePimsSend } from '../hooks/usePimsSend';
import { useModalFocus } from '../hooks/useModalFocus';
import { MappingRows } from './pims/MappingRows';
import { CopyActions } from './pims/CopyActions';
import { DiagnosticLink, SendResults } from './pims/SendResults';

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
  /** The chart's patient number ('' = none). */
  patientNumber: string;
  /** When the chart was last sent (null = unknown; the dialog looks it up). */
  sentAt: string | null;
  onSent: (sentAt: string) => void;
}

// Built here (not imported as `externalTransport`) from the bridge's own functions.
const transport: PimsTransport = { ping, inspect, send, diagnose, appointments, startChart, takePendingPatient };

/**
 * Documents → Record note → Send to ezyVet. The send flow lives in `usePimsSend`; this is the
 * dialog around it.
 */
export const SendToEzyvetDialog: React.FC<SendToEzyvetDialogProps> = ({
  open, onClose, note, stored, chartSnapshot, chartId, patientName, patientNumber, sentAt, onSent,
}) => {
  const { t } = useTranslation(['pims', 'media', 'app', 'forms', 'common']);
  const modalRef = useModalFocus(open);
  const {
    phase, rows, split, sending, changedTarget, sentAtSettled, lastSentAt, nothingToSend,
    load, choose, resetToDefaults, doSend, copyDiagnostic, formatDate,
  } = usePimsSend({
    transport,
    note,
    stored,
    chartSnapshotPicture: async () =>
      chartSnapshot ? renderChartPicture(chartSnapshot, { pre: t('pims:picture.pre'), post: t('pims:picture.post') }) : null,
    hasChartPicture: !!chartSnapshot,
    chartId,
    patientName,
    patientNumber,
    sentAt,
    onSent,
    open,
  });

  if (!open) return null;

  const header = (
    <header className="ai-settings-header">
      <h2>{t('pims:dialog.title')}</h2>
      {/* Not while sending: a reopened dialog wouldn't know a write is still running. */}
      <button type="button" className="pdf-preview-close" onClick={onClose} disabled={sending} aria-label={t('common:actions.close')}>×</button>
    </header>
  );

  const diagnosticLink = (tabId?: number) => <DiagnosticLink onCopy={() => void copyDiagnostic(tabId)} />;

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
    body = (
      <div className="pims-dialog__loading" role="status">
        <div className="app-loading__spinner" aria-hidden="true" />
        <p>{t('pims:dialog.loading')}</p>
      </div>
    );
  } else if (phase.kind === 'notInstalled') {
    // Reached when Chrome exposes the extension bridge but the extension didn't answer the ping.
    // The Web Store link goes here once the extension is published.
    body = (
      <>
        <h3 className="pims-dialog__subtitle">{t('pims:install.title')}</h3>
        <p>{t('pims:install.body')}</p>
      </>
    );
    footer = <>{footer}{retryButton}</>;
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

    if (phase.kind === 'results') {
      body = (
        <>
          <SendResults
            rows={phase.rows}
            stampFailed={phase.stampFailed}
            sentOn={lastSentAt ? formatDate(lastSentAt) : null}
            onCopyDiagnostic={() => void copyDiagnostic(tab.id)}
          />
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
          <MappingRows rows={rows} disabled={sending} onChoose={choose} />
          {changedTarget && <p className="record-note__stale" role="status">{t('pims:send.targetChanged')}</p>}
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
            disabled={sending || nothingToSend || !sentAtSettled}
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
        <div className="ai-settings-body">
          {body}
          <CopyActions note={note} storedText={stored?.text ?? null} disabled={sending}
            renderImage={chartSnapshot ? () => renderChartPicture(chartSnapshot, { pre: t('pims:picture.pre'), post: t('pims:picture.post') }) : undefined} />
        </div>
        <footer className="ai-settings-footer">{footer}</footer>
      </div>
    </div>,
    document.body,
  );
};
