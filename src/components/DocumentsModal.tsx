import React from 'react';
import { useTranslation } from 'react-i18next';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { PdfPreviewModal, type ChartSnapshot as PreviewSnapshot } from './PdfPreviewModal';
import { OwnerReportModal } from './OwnerReportModal';
import { RecordNotePanel } from './RecordNotePanel';
import type { ChartSnapshot, ImageRole, StoredRecordNote } from '../types';
import type { OwnerReportBranding } from '../utils/ownerReportPdf';
import type { OwnerReportConfig } from '../utils/ownerReportConfig';

export type DocumentTab = 'chart' | 'owner' | 'note';

const TAB_KEY = 'documents.tab';

interface DocumentsModalProps {
  open: boolean;
  onClose: () => void;
  /** Tab to show when opened; falls back to the last one used. */
  initialTab?: DocumentTab;
  /** Clinical chart snapshot (with the live diagram SVGs). */
  chartSnapshot: PreviewSnapshot | null;
  /** Owner report: off for practices without the feature. */
  ownerReport?: {
    snapshot: ChartSnapshot;
    branding: OwnerReportBranding;
    imageRoles: Record<string, ImageRole>;
    chartId: string;
    practiceId: string;
    cloudActive: boolean;
    onEditWording: () => void;
    /** Practice owner report templates (omitted = built-in report). */
    config?: OwnerReportConfig;
    /** Email to owner (see OwnerReportModal). */
    ownerEmail?: string;
    ensureSaved?: () => Promise<boolean>;
    onEditPatient?: () => void;
  };
  /** Medical record note to paste into the practice software (omitted =
   *  no tab). Shown whether or not the owner report is on. */
  recordNote?: {
    snapshot: ChartSnapshot;
    stored: StoredRecordNote | null;
    onChange: (note: StoredRecordNote | null) => void;
    readOnly: boolean;
    aiEnabled: boolean;
  };
}

const TAB_LABEL: Record<DocumentTab, 'documents.chartTab' | 'documents.ownerTab' | 'documents.noteTab'> = {
  chart: 'documents.chartTab',
  owner: 'documents.ownerTab',
  note: 'documents.noteTab',
};
const TAB_WHO: Record<DocumentTab, 'documents.chartWho' | 'documents.ownerWho' | 'documents.noteWho'> = {
  chart: 'documents.chartWho',
  owner: 'documents.ownerWho',
  note: 'documents.noteWho',
};

/**
 * One place for the documents a visit produces. Each tab is a full
 * preview + download; switching tabs keeps the other preview alive so
 * it doesn't re-render. With the owner report off there are no tabs —
 * just the clinical chart.
 */
export const DocumentsModal: React.FC<DocumentsModalProps> = ({
  open, onClose, initialTab, chartSnapshot, ownerReport, recordNote,
}) => {
  const { t } = useTranslation('media');
  const readSaved = (): DocumentTab => {
    try {
      const saved = window.sessionStorage.getItem(TAB_KEY);
      return saved === 'owner' || saved === 'note' ? saved : 'chart';
    } catch { return 'chart'; }
  };
  const tabs: DocumentTab[] = ['chart', ...(ownerReport ? ['owner' as const] : []), ...(recordNote ? ['note' as const] : [])];
  const available = (id: DocumentTab) => tabs.includes(id);
  const [tab, setTab] = React.useState<DocumentTab>(() => initialTab ?? readSaved());
  // Previews mount on first visit and stay mounted, so flipping back and
  // forth doesn't regenerate a PDF each time.
  const [visited, setVisited] = React.useState<Set<DocumentTab>>(() => new Set([initialTab ?? readSaved()]));
  const closeRef = React.useRef<HTMLButtonElement>(null);
  // iOS app: a kit sheet (grabber, swipe down, its own Escape and focus).
  const native = isNativeApp();

  React.useEffect(() => {
    if (!open) return;
    const wanted = initialTab ?? readSaved();
    const next = available(wanted) ? wanted : 'chart';
    setTab(next);
    setVisited(new Set([next]));
    closeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  React.useEffect(() => {
    if (!open || native) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, native]);

  if (!open && !native) return null;

  const active = available(tab) ? tab : 'chart';
  const select = (id: DocumentTab) => {
    setTab(id);
    setVisited((v) => new Set(v).add(id));
    try { window.sessionStorage.setItem(TAB_KEY, id); } catch { /* ignore */ }
  };
  const chartVisited = visited.has('chart');
  const ownerVisited = visited.has('owner');
  const noteVisited = visited.has('note');
  const patient = chartSnapshot?.patientInfo ?? ownerReport?.snapshot.patientInfo;
  const subtitle = [patient?.patientName, patient?.date].filter(Boolean).join(' · ');
  const who = t(TAB_WHO[active]);

  const panels = (
    <>
      <div
        className="documents-modal__panel"
        role="tabpanel"
        id="documents-panel-chart"
        aria-labelledby="documents-tab-chart"
        hidden={active !== 'chart'}
      >
        {chartVisited && <PdfPreviewModal open bare onClose={onClose} snapshot={chartSnapshot} />}
      </div>
      {ownerReport && (
        <div
          className="documents-modal__panel"
          role="tabpanel"
          id="documents-panel-owner"
          aria-labelledby="documents-tab-owner"
          hidden={active !== 'owner'}
        >
          {ownerVisited && (
            <OwnerReportModal
              open
              bare
              onClose={onClose}
              snapshot={ownerReport.snapshot}
              branding={ownerReport.branding}
              imageRoles={ownerReport.imageRoles}
              chartId={ownerReport.chartId}
              practiceId={ownerReport.practiceId}
              cloudActive={ownerReport.cloudActive}
              onEditWording={ownerReport.onEditWording}
              diagramSvg={chartSnapshot?.postSvg}
              species={chartSnapshot?.species}
              config={ownerReport.config}
              ownerEmail={ownerReport.ownerEmail}
              ensureSaved={ownerReport.ensureSaved}
              onEditPatient={ownerReport.onEditPatient}
            />
          )}
        </div>
      )}
      {recordNote && (
        <div
          className="documents-modal__panel"
          role="tabpanel"
          id="documents-panel-note"
          aria-labelledby="documents-tab-note"
          hidden={active !== 'note'}
        >
          {noteVisited && (
            <RecordNotePanel
              snapshot={recordNote.snapshot}
              stored={recordNote.stored}
              onChange={recordNote.onChange}
              readOnly={recordNote.readOnly}
              aiEnabled={recordNote.aiEnabled}
            />
          )}
        </div>
      )}
    </>
  );

  if (native) {
    // Page-style sheet: the preview wants the room. The two documents are a
    // segmented control (same tab semantics as the website's tabs).
    return (
      <Sheet open={open} onClose={onClose} title={t('ios.sheets.documents.title', { ns: 'common' })} className="ios-sheet--page documents-sheet">
        <div className="documents-sheet__head">
          {subtitle && <p className="documents-sheet__subtitle">{subtitle}</p>}
          {tabs.length > 1 && (
            <div className="ios-segmented" role="tablist" aria-label={t('documents.tablist')}>
              {tabs.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`documents-tab-${id}`}
                  aria-selected={active === id}
                  aria-controls={`documents-panel-${id}`}
                  className={`ios-segmented__segment${active === id ? ' ios-segmented__segment--on' : ''}`}
                  onClick={() => select(id)}
                >
                  {t(TAB_LABEL[id])}
                </button>
              ))}
            </div>
          )}
          <p className="documents-sheet__who">{who}</p>
        </div>
        {panels}
      </Sheet>
    );
  }

  return (
    <div className="pdf-preview-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="documents-title">
      <div className="pdf-preview-modal documents-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pdf-preview-header documents-modal__header">
          <div>
            <h2 id="documents-title">{t('documents.title')}{subtitle && <span className="documents-modal__subtitle"> · {subtitle}</span>}</h2>
            <p>{who}</p>
          </div>
          <button ref={closeRef} type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('documents.close')}>
            ×
          </button>
        </header>

        {tabs.length > 1 && (
          <div className="documents-modal__tabs" role="tablist" aria-label={t('documents.tablist')}>
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`documents-tab-${id}`}
                aria-selected={active === id}
                aria-controls={`documents-panel-${id}`}
                className={`documents-modal__tab${active === id ? ' documents-modal__tab--on' : ''}`}
                onClick={() => select(id)}
              >
                {t(TAB_LABEL[id])}
              </button>
            ))}
          </div>
        )}

        {panels}
      </div>
    </div>
  );
};
