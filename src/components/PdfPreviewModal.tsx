import { DocumentToolbar } from './DocumentToolbar';
import React from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../hooks/useModalFocus';
import './PdfExportWarning.css';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { isAppLanguage } from '../i18n/config';
import { PdfPagesPreview, canShowPdfInline } from './PdfPagesPreview';
import { PdfLinkPanel, useInAppPdfLink } from './PdfLinkPanel';
import { savePdf, downloadHint } from '../utils/savePdf';
import { saveChartPdf } from '../native/saveFile';
import { isNativeApp } from '../native/platform';
import { Icon } from '../ios/icons';
import { toast } from './ui/dialogs';
import { PdfStylePicker, readSavedPdfStyle, savePdfStyle, useCompactPdfLayout } from './PdfStylePicker';
import { resolvePdfStyle } from '../utils/pdf/styles';
import {
  buildDentalChartPDFBytes,
  type PdfBranding,
  type PdfImage,
  type ReportFit,
} from '../utils/pdfGenerator';
import { treatmentAreaTitle } from '../utils/pdf/sections';
import { listChartAttachments } from '../hooks/useAttachments';
import { fetchAsJpeg } from '../utils/imageJpeg';
import { diagramSvgToPng, CommentForExport } from '../utils/svgToPng';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import {
  PatientInfo,
  ToothData,
  Species,
  Logo,
  ToothMarks,
  DiagramComment,
  DiagramStroke,
} from '../types';

// SF Symbol names (not text).
const SQUARE_AND_ARROW_UP_ICON = 'square-and-arrow-up';

/**
 * One snapshot of the chart that's enough to (re-)build a PDF in any
 * style: patient/tooth/diagram state plus live SVG references for the
 * pre + post diagrams.
 */
export interface ChartSnapshot {
  patientInfo: PatientInfo;
  toothData: ToothData[];
  species: Species;
  logo: Logo;
  preSvg: SVGSVGElement;
  preComments: CommentForExport[];
  preState: { marks: ToothMarks; comments: DiagramComment[]; strokes: DiagramStroke[] };
  postSvg: SVGSVGElement;
  postComments: CommentForExport[];
  postState: { marks: ToothMarks; comments: DiagramComment[]; strokes: DiagramStroke[] };
  /** Practice identity (doctor line + uploaded logo) from the profile. */
  branding?: PdfBranding;
  /** False drops the arch grids from page 1 (diagram-first layout). */
  includeGrid?: boolean;
  /** False leaves the radiographic / CT report off the treatment card. */
  includeRadiographicReport?: boolean;
  includeCtReport?: boolean;
  includeDischarge?: boolean;
  includeCodesUsed?: boolean;
  /** A report too long for page 2 continues on an extra page. */
  continueCutReports?: boolean;
  /** Cloud chart id whose images get appended as extra pages (4 per
   *  page). Absent/empty → no image pages. */
  imagesChartId?: string;
  /** Image ids the user left out of the PDF. */
  pdfExcludedImages?: string[];
}

/** Longest edge for images on the PDF's image pages. A 2×2 cell is ~5in
 *  wide, so this prints at ~280 dpi while keeping file size sane. */
const PDF_IMAGE_MAX_EDGE = 1400;

export interface PdfExportLifecycle {
  unsaved: boolean;
  unfinalized: boolean;
  canFinalize: boolean;
  finalize: () => Promise<boolean>;
}

export interface ChartPdfOptions {
  gridRequired: boolean;
  imagesAvailable: boolean;
  includeImages: boolean;
  onChange: (field: 'pdfIncludeGrid' | 'pdfIncludeImages' | 'pdfIncludeRadiographicReport' | 'pdfIncludeCtReport' | 'pdfIncludeDischarge' | 'pdfIncludeCodesUsed' | 'pdfContinueReports', value: boolean) => void;
}

interface PdfPreviewModalProps {
  lifecycle?: PdfExportLifecycle;
  open: boolean;
  onClose: () => void;
  /** Returns the chart snapshot — captured fresh each time the modal opens. */
  snapshot: ChartSnapshot | null;
  branding?: PdfBranding;
  brandingReady?: boolean;
  /** Render just the preview body (style rail + PDF) inside another
   *  dialog — the Documents dialog supplies header, tabs and Escape. */
  bare?: boolean;
  /** History displays pages without style or export controls. */
  viewOnly?: boolean;
  options?: ChartPdfOptions;
  controlsHost?: HTMLElement | null;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ open, onClose, snapshot, branding = snapshot?.branding, brandingReady = true, bare = false, viewOnly = false, lifecycle, options, controlsHost }) => {
  const { t, i18n: i18nInstance } = useTranslation(['pdfui', 'media', 'settings']);
  // The document's labels print in the app language; the preview rebuilds
  // when it changes.
  const lng = isAppLanguage(i18nInstance.language) ? i18nInstance.language : 'en';
  // The document style is independent of the app UI. The last pick
  // (preset or custom color) is remembered on this device.
  const [styleId, setStyleIdState] = React.useState<string>(() => viewOnly ? 'clinic' : readSavedPdfStyle());
  const setStyleId = (id: string) => { setStyleIdState(id); savePdfStyle(id); };
  // In the app the preview always gets the width; the style list is a
  // button that opens a picker sheet.
  const compactLayout = useCompactPdfLayout();
  const compact = compactLayout || isNativeApp();
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  // The bytes behind pdfUrl — the share sheet needs the file itself,
  // in hand when the button is tapped.
  const pdfBlobRef = React.useRef<Blob | null>(null);
  const inAppLink = useInAppPdfLink();
  const downloadGeneration = React.useRef(0);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** Page-2 reports the last build couldn't fit. */
  const [reportFit, setReportFit] = React.useState<ReportFit[]>([]);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  // Chart images, fetched once per open (not per style switch). null =
  // still loading; [] = none / not requested.
  const [images, setImages] = React.useState<PdfImage[] | null>(null);
  const [imageAttempt, setImageAttempt] = React.useState(0);
  const loadedSnapshot = React.useRef<ChartSnapshot | null>(null);
  const [imageWarning, setImageWarning] = React.useState<string | null>(null);
  const [pendingDownload, setPendingDownload] = React.useState<boolean | null>(null);
  const [finalizing, setFinalizing] = React.useState(false);
  const [finalizeError, setFinalizeError] = React.useState(false);
  const finalizingRef = React.useRef(false);
  const warningRef = useModalFocus(pendingDownload !== null);

  React.useEffect(() => {
    setPendingDownload(null);
    setFinalizeError(false);
    setFinalizing(false);
    finalizingRef.current = false;
  }, [open, snapshot]);

  React.useEffect(() => {
    if (finalizing) warningRef.current?.focus();
  }, [finalizing, warningRef]);

  React.useEffect(() => {
    if (pendingDownload === null) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!finalizingRef.current) setPendingDownload(null);
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [pendingDownload]);


  // Move focus into the dialog on open so keyboard / screen-reader users
  // land inside it rather than back on the trigger.
  React.useEffect(() => {
    if (open && !bare) closeButtonRef.current?.focus();
  }, [open, bare]);

  React.useEffect(() => {
    if (!open || bare) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, bare]);

  React.useEffect(() => {
    loadedSnapshot.current = null;
    setImageWarning(null);
    if (!open || !snapshot) {
      setImages(null);
      return;
    }
    const chartId = snapshot.imagesChartId;
    if (!chartId) {
      loadedSnapshot.current = snapshot;
      setImages([]);
      return;
    }
    let cancelled = false;
    setImages(null);
    setImageWarning(null);
    const warn = i18n.t('preview.imagesFailed', { ns: 'pdfui' });
    (async () => {
      const items = await listChartAttachments(chartId);
      if (cancelled) return;
      if (!items) {
        loadedSnapshot.current = snapshot;
        setImageWarning(warn);
        setImages([]);
        return;
      }
      const excluded = new Set(snapshot.pdfExcludedImages ?? []);
      const out: PdfImage[] = [];
      for (const item of items.filter((it) => !excluded.has(it.id))) {
        const jpegBytes = item.url ? await fetchAsJpeg(item.url, PDF_IMAGE_MAX_EDGE, 0.85) : null;
        if (cancelled) return;
        out.push({ jpegBytes, caption: item.caption, kind: item.kind, tooth: item.toothTriadan });
      }
      if (!cancelled) {
        if (out.some((img) => !img.jpegBytes)) {
          setImageWarning(i18n.t('preview.imagesPartial', { ns: 'pdfui' }));
        }
        loadedSnapshot.current = snapshot;
        setImages(out.some((img) => !img.jpegBytes) ? [] : out);
      }
    })().catch((err) => {
      console.error(err);
      if (!cancelled) {
        loadedSnapshot.current = snapshot;
        setImageWarning(warn);
        setImages([]);
      }
    });
    return () => { cancelled = true; };
  }, [open, snapshot, imageAttempt]);

  React.useEffect(() => {
    downloadGeneration.current += 1;
    inAppLink.reset();
    pdfBlobRef.current = null;
    setPdfUrl(null);
    if (!open || !snapshot || !brandingReady || images === null || loadedSnapshot.current !== snapshot) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setGenerating(true);
    setError(null);

    (async () => {
      try {
        const style = resolvePdfStyle(styleId);
        const { width, height } = TOOTH_DIAGRAMS[snapshot.species];
        const crop = TOOTH_DIAGRAMS[snapshot.species].cropBounds;
        const [prePng, postPng] = await Promise.all([
          diagramSvgToPng(snapshot.preSvg, width, height, snapshot.preComments, 2, style.comment, crop),
          diagramSvgToPng(snapshot.postSvg, width, height, snapshot.postComments, 2, style.comment, crop),
        ]);
        if (cancelled) return;
        const bytes = await buildDentalChartPDFBytes(
          snapshot.patientInfo,
          snapshot.toothData,
          snapshot.species,
          snapshot.logo,
          { state: snapshot.preState,  png: prePng  },
          { state: snapshot.postState, png: postPng },
          styleId,
          branding ?? {},
          {
            includeGrid: snapshot.includeGrid,
            includeRadiographicReport: snapshot.includeRadiographicReport,
            includeCtReport: snapshot.includeCtReport,
            includeDischarge: snapshot.includeDischarge,
            includeCodesUsed: snapshot.includeCodesUsed,
            continueCutReports: snapshot.continueCutReports,
            onReportFit: cut => { if (!cancelled) setReportFit(cut); },
            images,
            lng,
          }
        );
        if (cancelled) return;
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        pdfBlobRef.current = blob;
        setPdfUrl(createdUrl);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(i18n.t('preview.buildFailed', { ns: 'pdfui' }));
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
      downloadGeneration.current += 1;
      pdfBlobRef.current = null;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, snapshot, branding, brandingReady, styleId, images, lng, imageAttempt, inAppLink.reset]);

  const canDownload = brandingReady && !!pdfUrl && !generating && images !== null && !error;

  const download = (withoutImages = false) => {
    if (!canDownload || !snapshot || (imageWarning && !withoutImages)) return;
    const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const { patientInfo } = snapshot;
    const filename = `${sanitize(patientInfo.patientName) || 'patient'}_${sanitize(patientInfo.patientNumber) || 'pid'}_dental_chart_${patientInfo.date}.pdf`;
    if (!pdfBlobRef.current) return;
    const blob = pdfBlobRef.current;
    // In the iOS app the PDF goes to the native share sheet (Save to Files,
    // Mail, AirDrop…); the browser download / in-app-link flow is web-only.
    if (isNativeApp()) {
      void saveChartPdf(blob, filename).catch(() => toast(i18n.t('common:errors.saveFile')));
      return;
    }
    const attempt = downloadGeneration.current;
    savePdf(blob, filename).then((outcome) => {
      if (attempt !== downloadGeneration.current || pdfBlobRef.current !== blob) return;
      if (outcome === 'unsupported') void inAppLink.start(blob, filename);
    });
  };

  const handleDownload = (withoutImages = false) => {
    if (lifecycle && (lifecycle.unsaved || lifecycle.unfinalized)) {
      setFinalizeError(false);
      setPendingDownload(withoutImages);
    } else download(withoutImages);
  };

  const finalizeAndDownload = async () => {
    if (finalizingRef.current || pendingDownload === null || !lifecycle?.canFinalize) return;
    finalizingRef.current = true;
    setFinalizing(true);
    setFinalizeError(false);
    const generation = downloadGeneration.current;
    const withoutImages = pendingDownload;
    try {
      const saved = await lifecycle.finalize();
      if (generation !== downloadGeneration.current) return;
      if (!saved) { setFinalizeError(true); return; }
      setPendingDownload(null);
      download(withoutImages);
    } catch {
      if (generation === downloadGeneration.current) setFinalizeError(true);
    } finally {
      if (generation === downloadGeneration.current) {
        finalizingRef.current = false;
        setFinalizing(false);
      }
    }
  };

  if (!open) return null;

  const toolbar = bare && !viewOnly;
  const downloadButton = (
    <button
      type="button"
      className={toolbar ? "ui-btn ui-btn--primary" : "pdf-preview-download"}
      onClick={() => handleDownload()}
      disabled={!canDownload || !!imageWarning}
    >
      {isNativeApp() ? (
        <>
          <Icon name={SQUARE_AND_ARROW_UP_ICON} size={17} />
          {t('ios.sheets.documents.share', { ns: 'common' })}
        </>
      ) : (
        t('preview.download')
      )}
    </button>
  );

  const warning = pendingDownload !== null && createPortal(
    <div
      className="ui-dialog-overlay pdf-export-warning-overlay"
      onClick={(event) => {
        event.stopPropagation();
        if (!finalizingRef.current) setPendingDownload(null);
      }}
    >
      <div
        ref={warningRef}
        tabIndex={-1}
        className="ui-dialog pdf-export-warning"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-export-warning-title"
        aria-describedby="pdf-export-warning-message"
        aria-busy={finalizing}
        onKeyDown={event => {
          // Portals still bubble through the native Sheet's React tree;
          // its focus trap must not move focus behind this dialog.
          event.stopPropagation();
          if (finalizing && event.key === 'Tab') event.preventDefault();
        }}
        onClick={event => event.stopPropagation()}
      >
        <h2 className="ui-dialog__title" id="pdf-export-warning-title">{t('exportWarning.title')}</h2>
        <p className="ui-dialog__message" id="pdf-export-warning-message">
          {t(lifecycle?.unsaved ? (lifecycle.unfinalized ? 'exportWarning.both' : 'exportWarning.unsaved') : 'exportWarning.unfinalized')}
        </p>
        {finalizeError && <p className="ui-dialog__error" role="alert">{t('exportWarning.failed')}</p>}
        <div className="pdf-export-warning__actions">
          {(lifecycle?.canFinalize || finalizing) && (
            <button type="button" className="ui-btn ui-btn--primary" disabled={finalizing} onClick={() => { void finalizeAndDownload(); }}>
              {t(finalizing ? 'exportWarning.finalizing' : 'exportWarning.finalize')}
            </button>
          )}
          <button
            type="button"
            className="ui-btn ui-btn--secondary"
            disabled={finalizing}
            onClick={() => { setPendingDownload(null); download(pendingDownload); }}
          >
            {t('exportWarning.anyway')}
          </button>
          <button type="button" className="ui-btn ui-btn--secondary" disabled={finalizing} onClick={() => setPendingDownload(null)}>
            {t('actions.cancel', { ns: 'common' })}
          </button>
        </div>
      </div>
    </div>, document.body,
  );

  const notices = <>
    {!isNativeApp() && !inAppLink.state && downloadHint() && <p className="pdf-preview-hint" role="note">{downloadHint()}</p>}
    <PdfLinkPanel state={inAppLink.state} />
    {!viewOnly && reportFit.length > 0 && <div className="pdf-preview-warning pdf-report-fit">
      {reportFit.map(({ kind, hiddenLines }) => <p key={kind} role="status">{snapshot?.continueCutReports
        ? t('reportFit.continued', { report: treatmentAreaTitle(kind, lng) })
        : t('reportFit.cut', { report: treatmentAreaTitle(kind, lng), count: hiddenLines })}</p>)}
      {options && <label className="choice-row">
        <input type="checkbox" checked={!!snapshot?.continueCutReports}
          onChange={event => options.onChange('pdfContinueReports', event.target.checked)} />
        <span>{t('reportFit.continue')}</span>
      </label>}
    </div>}
    {imageWarning && <div className="pdf-preview-warning">
      <p role="status">{imageWarning}</p>
      <button type="button" className="pdf-preview-secondary" onClick={() => setImageAttempt(attempt => attempt + 1)}>{t('preview.retryImages')}</button>
      <button type="button" className="pdf-preview-secondary" disabled={!canDownload} onClick={() => handleDownload(true)}>{t('preview.withoutImages')}</button>
    </div>}
  </>;
  const included = [
    { key: 'pdfIncludeGrid', label: 'chart.pdf.grid', value: snapshot?.includeGrid !== false, disabled: options?.gridRequired, hint: options?.gridRequired ? t('chart.pdf.gridHint', { ns: 'settings' }) : undefined },
    { key: 'pdfIncludeImages', label: 'chart.pdf.images', value: options?.includeImages, disabled: !options?.imagesAvailable, hint: undefined },
    { key: 'pdfIncludeRadiographicReport', label: 'chart.pdf.radiographicReport', value: snapshot?.includeRadiographicReport !== false, disabled: false, hint: undefined },
    { key: 'pdfIncludeCtReport', label: 'chart.pdf.ctReport', value: snapshot?.includeCtReport !== false, disabled: false, hint: undefined },
    { key: 'pdfIncludeDischarge', label: 'chart.pdf.dischargeSections', value: snapshot?.includeDischarge !== false, disabled: false, hint: undefined },
    { key: 'pdfIncludeCodesUsed', label: 'chart.pdf.codesUsed', value: snapshot?.includeCodesUsed !== false, disabled: false, hint: undefined },
  ] as const;
  const body = (
    <>{warning}
        <div className={viewOnly ? 'pdf-preview-body pdf-preview-body--view-only' : toolbar ? 'pdf-preview-body pdf-preview-body--toolbar' : 'pdf-preview-body'}>
          {toolbar && <DocumentToolbar actions={downloadButton} notice={notices} controlsHost={controlsHost}>
            <section className="document-toolbar__group">
              <h3>{t('documents.color', { ns: 'media' })}</h3>
              <PdfStylePicker styleId={styleId} onChange={setStyleId} compact inline />
            </section>
            {options && <section className="document-toolbar__group">
              <h3>{t('documents.included', { ns: 'media' })}</h3>
              <div className="document-toolbar__options">
                {included.map(({ key, label, value, disabled, hint }) => <label key={key} className="choice-row" title={hint}>
                  <input type="checkbox" checked={!!value} disabled={disabled}
                    onChange={event => options.onChange(key, event.target.checked)} />
                  <span>{t(label, { ns: 'settings' })}</span>
                </label>)}
              </div>
            </section>}
          </DocumentToolbar>}
          {!viewOnly && !toolbar && <aside className="pdf-preview-styles">
            {compact ? (
              <div className="pdf-preview-toolbar">
                <PdfStylePicker styleId={styleId} onChange={setStyleId} compact />
                {downloadButton}
              </div>
            ) : (
              <>
                <PdfStylePicker styleId={styleId} onChange={setStyleId} compact={false} />
                {downloadButton}
              </>
            )}
            {notices}
          </aside>}
          {viewOnly && imageWarning && <div className="pdf-preview-warning">
            <p role="status">{imageWarning}</p>
            <button type="button" className="pdf-preview-secondary" onClick={() => setImageAttempt(attempt => attempt + 1)}>{t('preview.retryImages')}</button>
          </div>}
          <div className="pdf-preview-iframe-wrap">
            {(!brandingReady || generating || (images === null && !error)) && (
              <div className="pdf-preview-status" role="status">
                {brandingReady && images === null ? t('preview.loadingImages') : t('preview.generating')}
              </div>
            )}
            {brandingReady && error && !generating && (
              <div className="pdf-preview-status pdf-preview-status--error">{error}</div>
            )}
            {brandingReady && pdfUrl && !error && (!viewOnly && canShowPdfInline() ? (
              <iframe
                key={styleId}
                src={pdfUrl}
                title={t('preview.frameTitle')}
                className="pdf-preview-iframe"
              />
            ) : pdfBlobRef.current && (
              <PdfPagesPreview blob={pdfBlobRef.current} title={t('preview.frameTitle')} />
            ))}
          </div>
        </div>
    </>
  );

  if (bare) return body;

  return (
    <div
      className="pdf-preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-preview-title"
    >
      <div className="pdf-preview-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pdf-preview-header">
          <div>
            <h2 id="pdf-preview-title">{t('preview.title')}</h2>
            <p>{t('preview.subtitle')}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('preview.closeAria')}>
            ×
          </button>
        </header>
        {body}
      </div>
    </div>
  );
};
