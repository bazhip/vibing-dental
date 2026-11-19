import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../hooks/useModalFocus';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { isChartSnapshot, normalizeSnapshot } from '../hooks/useChartState';
import { formatDate } from '../i18n/format';
import { Sheet } from '../ios/Sheet';
import { isNativeApp } from '../native/platform';
import type { ChartSnapshot } from '../types';
import { useOffscreenChartPicture } from '../extension/sidepanel/OffscreenChartPicture';
import { PdfPreviewModal, type ChartSnapshot as PdfSnapshot } from './PdfPreviewModal';
import { buildRecordNote, recordNoteT, recordNoteText } from '../utils/recordNote';
import './PatientRecordHistory.css';

export interface HistoryVisit {
  id: string;
  chart_date: string;
}

interface Props {
  current: ChartSnapshot;
  currentId: string | null;
  listVisits?: () => Promise<HistoryVisit[]>;
  fetchVisit: (id: string) => Promise<ChartSnapshot>;
  branding: PdfSnapshot['branding'];
  onClose: () => void;
}

const modes = ['pdf', 'note'] as const;

export function PatientRecordHistory({ current, currentId, listVisits, fetchVisit, branding, onClose }: Props) {
  const { t, i18n } = useTranslation(['media', 'common', 'library', 'pdfui']);
  const native = isNativeApp();
  const focusRef = useModalFocus<HTMLDivElement>(!native);
  const backdrop = useBackdropDismiss(onClose);
  const titleId = React.useId();
  const [visits, setVisits] = React.useState<HistoryVisit[]>([]);
  const [historyStatus, setHistoryStatus] = React.useState<'loading' | 'ready' | 'error'>(listVisits ? 'loading' : 'ready');
  const [selectedId, selectId] = React.useState('');
  const [mode, setMode] = React.useState<'note' | 'pdf'>('pdf');
  const [result, setResult] = React.useState<{ id: string; snapshot: ChartSnapshot | null }>();
  const selected = selectedId ? (result?.id === selectedId ? result.snapshot : undefined) : current;

  React.useEffect(() => {
    if (!listVisits) return;
    let cancelled = false;
    void listVisits().then(rows => {
      if (cancelled) return;
      setVisits(rows.filter(row => row.id !== currentId));
      setHistoryStatus('ready');
    }, () => { if (!cancelled) setHistoryStatus('error'); });
    return () => { cancelled = true; };
  }, [listVisits, currentId]);

  React.useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void fetchVisit(selectedId).then(data => {
      if (cancelled) return;
      setResult({ id: selectedId, snapshot: isChartSnapshot(data) ? normalizeSnapshot(data) : null });
    }, () => { if (!cancelled) setResult({ id: selectedId, snapshot: null }); });
    return () => { cancelled = true; };
  }, [selectedId, fetchVisit]);

  React.useEffect(() => {
    if (native) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [native, onClose]);

  const dateLabel = (date: string) => formatDate(date, 'medium', i18n.language);
  const content = (
    <div className="patient-record-history">
      <div className="patient-record-history__controls">
        <div className="patient-record-history__visits" role="group" aria-label={t('patientRecord.visit')}>
          {[{ id: '', chart_date: current.patientInfo.date }, ...visits].map((visit, index) => (
            <button key={visit.id} type="button" className="diagram-view__action" aria-pressed={selectedId === visit.id}
              onClick={() => {
                if (selectedId === visit.id) return;
                setResult(undefined);
                selectId(visit.id);
              }}>
              {selectedId === visit.id && <span aria-hidden="true">✓ </span>}
              {index === 0 ? t('patientRecord.currentVisit') : null}
              {index === 0 && visit.chart_date ? ' · ' : null}
              {visit.chart_date ? dateLabel(visit.chart_date) : index > 0 ? t('patientRecord.undatedVisit') : null}
            </button>
          ))}
        </div>
        <div className="documents-modal__tabs patient-record-history__tabs" role="tablist" aria-label={t('documents.tablist')}>
          {modes.map((value, index) => (
            <button key={value} type="button" role="tab" id={`${titleId}-${value}`}
              aria-selected={mode === value} aria-controls={`${titleId}-panel`} tabIndex={mode === value ? 0 : -1}
              className={`documents-modal__tab${mode === value ? ' documents-modal__tab--on' : ''}`}
              onClick={() => setMode(value)}
              onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = modes[event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index];
                setMode(next);
                document.getElementById(`${titleId}-${next}`)?.focus();
              }}>
              {t(value === 'pdf' ? 'patientRecord.pdfs' : 'patientRecord.notes')}
            </button>
          ))}
        </div>
      </div>
      {historyStatus === 'loading' && <p role="status">{t('patientRecord.loadingVisits')}</p>}
      {historyStatus === 'error' && <p role="alert">{t('patientRecord.visitsFailed')}</p>}
      {historyStatus === 'ready' && !visits.length && <p>{t('patientRecord.noVisits')}</p>}
      {selected === undefined && <p role="status">{t('library:history.loadingVersion')}</p>}
      {selected === null && <p role="alert">{t('patientRecord.visitFailed')}</p>}
      <div role="tabpanel" id={`${titleId}-panel`} aria-labelledby={`${titleId}-${mode}`} tabIndex={0}>
        {selected && mode === 'note' && (
          <div className="patient-record-history__note">
            {selected.recordNote?.text ?? recordNoteText(buildRecordNote(selected, recordNoteT(i18n.language)))}
          </div>
        )}
        {selected && mode === 'pdf' && (
          <VisitPdf key={selectedId} snapshot={selected} chartId={selectedId || currentId} branding={branding} onClose={onClose} />
        )}
      </div>
    </div>
  );

  if (native) return <Sheet open onClose={onClose} title={t('patientRecord.title')} className="ios-sheet--page documents-sheet">{content}</Sheet>;
  return createPortal(
    <div className="pdf-preview-overlay" {...backdrop} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="pdf-preview-modal documents-modal patient-record-history__dialog" ref={focusRef} tabIndex={-1}>
        <header className="pdf-preview-header documents-modal__header">
          <h2 id={titleId}>{t('patientRecord.title')}{current.patientInfo.patientName && <span className="documents-modal__subtitle"> · {current.patientInfo.patientName}</span>}</h2>
          <button type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('common:actions.close')}>×</button>
        </header>
        {content}
      </div>
    </div>,
    document.body,
  );
}

function VisitPdf({ snapshot, chartId, branding, onClose }: {
  snapshot: ChartSnapshot;
  chartId: string | null;
  branding: PdfSnapshot['branding'];
  onClose: () => void;
}) {
  const { element, hasDiagrams, getDiagrams } = useOffscreenChartPicture(snapshot);
  const pdf = React.useMemo<PdfSnapshot | null>(() => {
    const diagrams = hasDiagrams ? getDiagrams() : null;
    if (!diagrams) return null;
    return {
      ...diagrams,
      patientInfo: snapshot.patientInfo,
      species: snapshot.species,
      toothData: snapshot.toothData,
      logo: snapshot.logo,
      preState: { marks: snapshot.preMarks, comments: snapshot.preComments, strokes: snapshot.preStrokes },
      postState: { marks: snapshot.postMarks, comments: snapshot.postComments, strokes: snapshot.postStrokes },
      imagesChartId: chartId ?? undefined,
      pdfExcludedImages: snapshot.pdfExcludedImages,
      branding,
    };
  }, [snapshot, chartId, branding, getDiagrams, hasDiagrams]);
  return <>
    {element}
    {pdf && <PdfPreviewModal open bare viewOnly snapshot={pdf} onClose={onClose} />}
  </>;
}
