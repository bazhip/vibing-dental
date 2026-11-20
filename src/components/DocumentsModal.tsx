import React from 'react';
import { useTranslation } from 'react-i18next';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import { useModalFocus } from '../hooks/useModalFocus';
import { PdfPreviewModal, type ChartSnapshot as PreviewSnapshot, type PdfExportLifecycle, type ChartPdfOptions } from './PdfPreviewModal';
import { OwnerReportModal } from './OwnerReportModal';
import { RecordNotePanel, type RecordNotePims } from './RecordNotePanel';
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
  ownerPreviewOnly?: boolean;
  /** Clinical chart snapshot (with the live diagram SVGs). */
  chartSnapshot: PreviewSnapshot | null;
  chartBranding?: PreviewSnapshot['branding'];
  brandingReady?: boolean;
  chartLifecycle?: PdfExportLifecycle;
  chartOptions?: ChartPdfOptions;
  /** Owner report: off for practices without the feature. */
  ownerReport?: {
    snapshot: ChartSnapshot;
    branding: OwnerReportBranding;
    imageRoles: Record<string, ImageRole>;
    chartId: string;
    practiceId: string;
    cloudActive: boolean;
    onEditWording: () => void;
    onCustomizeTemplate?: () => void;
    onTemplateChange?: (id: string | null) => void;
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
    showConsultationGuide?: boolean;
    onChange: (note: StoredRecordNote | null) => void;
    readOnly: boolean;
    /** Send to ezyVet (omitted = no button). */
    pims?: RecordNotePims;
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
  open, onClose, initialTab, ownerPreviewOnly, chartSnapshot, chartBranding, brandingReady, chartLifecycle, chartOptions, ownerReport, recordNote,
}) => {
  const { t } = useTranslation('media');
  const readSaved = (): DocumentTab => {
    try {
      const saved = window.sessionStorage.getItem(TAB_KEY);
      return saved === 'owner' || saved === 'note' ? saved : 'chart';
    } catch { return 'chart'; }
  };
  const tabs: DocumentTab[] = [
    ...(chartSnapshot ? ['chart' as const] : []),
    ...(ownerReport ? ['owner' as const] : []),
    ...(recordNote ? ['note' as const] : []),
  ];
  const available = (id: DocumentTab) => tabs.includes(id);
  const [tab, setTab] = React.useState<DocumentTab>(() => initialTab ?? readSaved());
  // Previews mount on first visit and stay mounted, so flipping back and
  // forth doesn't regenerate a PDF each time.
  const [visited, setVisited] = React.useState<Set<DocumentTab>>(() => new Set([initialTab ?? readSaved()]));
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const [controlsHost, setControlsHost] = React.useState<HTMLDivElement | null>(null);
  // iOS app: a kit sheet (grabber, swipe down, its own Escape and focus).
  const native = isNativeApp();
  const modalRef = useModalFocus(open && !native && !ownerPreviewOnly);

  React.useEffect(() => {
    if (!open) return;
    const wanted = initialTab ?? readSaved();
    const next = available(wanted) ? wanted : tabs[0];
    if (!next) return;
    setTab(next);
    setVisited(new Set([next]));
    closeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTab]);

  React.useEffect(() => {
    if (!open || native || ownerPreviewOnly) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, native, ownerPreviewOnly]);

  if (!open && !native) return null;

  if (ownerPreviewOnly && ownerReport) {
    if (!open) return null;
    const preview = <OwnerReportModal {...ownerReport} open viewOnly bare={native} onClose={onClose} brandingReady={brandingReady}
      diagramSvg={chartSnapshot?.postSvg} species={chartSnapshot?.species} />;
    return native ? (
      <Sheet open={open} onClose={onClose} title={t('documents.ownerTab')} className="ios-sheet--page documents-sheet">
        {preview}
      </Sheet>
    ) : preview;
  }

  const active = available(tab) ? tab : tabs[0];
  if (!active) return null;
  const select = (id: DocumentTab) => {
    setTab(id);
    setVisited((v) => new Set(v).add(id));
    try { window.sessionStorage.setItem(TAB_KEY, id); } catch { /* ignore */ }
  };
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, id: DocumentTab) => {
    const index = tabs.indexOf(id);
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : null;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next];
    select(target);
    document.getElementById(`documents-tab-${target}`)?.focus();
  };
  const chartVisited = active === 'chart' || visited.has('chart');
  const ownerVisited = active === 'owner' || visited.has('owner');
  const noteVisited = active === 'note' || visited.has('note');
  const patient = chartSnapshot?.patientInfo ?? ownerReport?.snapshot.patientInfo ?? recordNote?.snapshot.patientInfo;
  const subtitle = [patient?.patientName, patient?.date].filter(Boolean).join(' · ');
  const who = t(TAB_WHO[active]);
  const chartControlsHost = native ? undefined : active === 'chart' ? controlsHost : null;
  const ownerControlsHost = native ? undefined : active === 'owner' ? controlsHost : null;

  const panels = (
    <>
      {chartSnapshot && <div
        className="documents-modal__panel"
        role="tabpanel"
        id="documents-panel-chart"
        aria-labelledby="documents-tab-chart"
        hidden={active !== 'chart'}
      >
        {chartVisited && <PdfPreviewModal open={open} bare onClose={onClose} snapshot={chartSnapshot} branding={chartBranding} brandingReady={brandingReady} lifecycle={chartLifecycle} options={chartOptions} controlsHost={chartControlsHost} />}
      </div>}
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
              controlsHost={ownerControlsHost}
              onClose={onClose}
              snapshot={ownerReport.snapshot}
              branding={ownerReport.branding}
              brandingReady={brandingReady}
              imageRoles={ownerReport.imageRoles}
              chartId={ownerReport.chartId}
              practiceId={ownerReport.practiceId}
              cloudActive={ownerReport.cloudActive}
              onEditWording={ownerReport.onEditWording}
              onCustomizeTemplate={ownerReport.onCustomizeTemplate}
              onTemplateChange={ownerReport.onTemplateChange}
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
          aria-labelledby={tabs.length > 1 ? 'documents-tab-note' : undefined}
          aria-label={tabs.length === 1 ? t(TAB_LABEL.note) : undefined}
          hidden={active !== 'note'}
        >
          {noteVisited && (
            <RecordNotePanel
              snapshot={recordNote.snapshot}
              stored={recordNote.stored}
              showConsultationGuide={recordNote.showConsultationGuide}
              onChange={recordNote.onChange}
              readOnly={recordNote.readOnly}
              pims={recordNote.pims}
              chartSnapshot={chartSnapshot}
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
                  tabIndex={active === id ? 0 : -1}
                  onKeyDown={(event) => onTabKeyDown(event, id)}
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
      <div className="pdf-preview-modal documents-modal" ref={modalRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header className="pdf-preview-header documents-modal__header">
          <div>
            <h2 id="documents-title">{t('documents.title')}{subtitle && <span className="documents-modal__subtitle"> · {subtitle}</span>}</h2>
            <p>{who}</p>
          </div>
          <button ref={closeRef} type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('documents.close')}>
            ×
          </button>
        </header>

        {(tabs.length > 1 || active !== 'note') && <div className="documents-modal__bar">
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
                  tabIndex={active === id ? 0 : -1}
                  onKeyDown={(event) => onTabKeyDown(event, id)}
                  className={`documents-modal__tab${active === id ? ' documents-modal__tab--on' : ''}`}
                  onClick={() => select(id)}
                >
                  {t(TAB_LABEL[id])}
                </button>
              ))}
            </div>
          )}
          <div className="documents-modal__controls" ref={setControlsHost} />
        </div>}

        {panels}
      </div>
    </div>
  );
};
