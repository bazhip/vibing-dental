import React from 'react';
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
} from '../utils/pdfGenerator';
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
  /** Nerve block rows hidden in the person's chart settings. */
  hiddenBlocks?: readonly string[];
  /** Cloud chart id whose images get appended as extra pages (4 per
   *  page). Absent/empty → no image pages. */
  imagesChartId?: string;
  /** Image ids the user left out of the PDF. */
  pdfExcludedImages?: string[];
}

/** Longest edge for images on the PDF's image pages. A 2×2 cell is ~5in
 *  wide, so this prints at ~280 dpi while keeping file size sane. */
const PDF_IMAGE_MAX_EDGE = 1400;

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** Returns the chart snapshot — captured fresh each time the modal opens. */
  snapshot: ChartSnapshot | null;
  /** Render just the preview body (style rail + PDF) inside another
   *  dialog — the Documents dialog supplies header, tabs and Escape. */
  bare?: boolean;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ open, onClose, snapshot, bare = false }) => {
  const { t, i18n: i18nInstance } = useTranslation('pdfui');
  // The document's labels print in the app language; the preview rebuilds
  // when it changes.
  const lng = isAppLanguage(i18nInstance.language) ? i18nInstance.language : 'en';
  // The document style is independent of the app UI. The last pick
  // (preset or custom color) is remembered on this device.
  const [styleId, setStyleIdState] = React.useState<string>(readSavedPdfStyle);
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
  // A new PDF (style switched, data changed) invalidates an old link.
  React.useEffect(() => { inAppLink.reset(); }, [pdfUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  // Chart images, fetched once per open (not per style switch). null =
  // still loading; [] = none / not requested.
  const [images, setImages] = React.useState<PdfImage[] | null>(null);
  const [imageWarning, setImageWarning] = React.useState<string | null>(null);

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
    if (!open || !snapshot) {
      setImages(null);
      return;
    }
    const chartId = snapshot.imagesChartId;
    if (!chartId) {
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
        setImageWarning(warn);
        setImages([]);
        return;
      }
      const excluded = new Set(snapshot.pdfExcludedImages ?? []);
      const out: PdfImage[] = [];
      for (const item of items.filter((it) => !excluded.has(it.id))) {
        const jpegBytes = item.url ? await fetchAsJpeg(item.url, PDF_IMAGE_MAX_EDGE, 0.85) : null;
        if (cancelled) return;
        out.push({ jpegBytes, caption: item.caption, kind: item.kind });
      }
      if (!cancelled) {
        if (out.some((img) => !img.jpegBytes)) {
          setImageWarning(i18n.t('preview.imagesPartial', { ns: 'pdfui' }));
        }
        setImages(out);
      }
    })().catch((err) => {
      console.error(err);
      if (!cancelled) {
        setImageWarning(warn);
        setImages([]);
      }
    });
    return () => { cancelled = true; };
  }, [open, snapshot]);

  React.useEffect(() => {
    if (!open || !snapshot || images === null) return;
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
          snapshot.branding ?? {},
          { includeGrid: snapshot.includeGrid, images, hiddenBlocks: snapshot.hiddenBlocks, lng }
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
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, snapshot, styleId, images, lng]);

  const handleDownload = () => {
    if (!pdfUrl || !snapshot) return;
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
    savePdf(blob, filename).then((outcome) => {
      if (outcome === 'unsupported') void inAppLink.start(blob, filename);
    });
  };

  if (!open) return null;

  const downloadButton = (
    <button
      type="button"
      className="pdf-preview-download"
      onClick={handleDownload}
      disabled={!pdfUrl || generating || images === null}
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

  const body = (
        <div className="pdf-preview-body">
          <aside className="pdf-preview-styles">
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
            {!isNativeApp() && !inAppLink.state && downloadHint() && <p className="pdf-preview-hint" role="note">{downloadHint()}</p>}
            <PdfLinkPanel state={inAppLink.state} />
            {imageWarning && (
              <p className="pdf-preview-warning" role="status">{imageWarning}</p>
            )}
          </aside>
          <div className="pdf-preview-iframe-wrap">
            {(generating || (images === null && !error)) && (
              <div className="pdf-preview-status">
                {images === null ? t('preview.loadingImages') : t('preview.generating')}
              </div>
            )}
            {error && !generating && (
              <div className="pdf-preview-status pdf-preview-status--error">{error}</div>
            )}
            {pdfUrl && !error && (canShowPdfInline() ? (
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
