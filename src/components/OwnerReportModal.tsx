import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { PdfPagesPreview, canShowPdfInline } from './PdfPagesPreview';
import { PdfLinkPanel, useInAppPdfLink } from './PdfLinkPanel';
import { savePdf, downloadHint } from '../utils/savePdf';
import { saveFile } from '../native/saveFile';
import { isNativeApp } from '../native/platform';
import { Icon } from '../ios/icons';
import { toast } from './ui/dialogs';
import { ChartSnapshot, ImageRole, Species } from '../types';
import { diagramSvgToPng, type DiagramPin } from '../utils/svgToPng';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import { useAttachments } from '../hooks/useAttachments';
import { buildOwnerReportModel, hasSection, teethWithFindings } from '../utils/ownerReport';
import type { OwnerReportConfig } from '../utils/ownerReportConfig';
import { fetchAsJpeg } from '../utils/imageJpeg';
import { buildOwnerReportPdfBytes, OwnerReportBranding, OwnerReportPhoto } from '../utils/ownerReportPdf';

// SF Symbol names (not text).
const SQUARE_AND_ARROW_UP_ICON = 'square-and-arrow-up';

interface OwnerReportModalProps {
  open: boolean;
  onClose: () => void;
  snapshot: ChartSnapshot;
  branding: OwnerReportBranding;
  /** Before/after tags (attachment id → role) from the chart. */
  imageRoles: Record<string, ImageRole>;
  /** Attachments are cloud-scoped; '' disables the photo section. */
  chartId: string;
  practiceId: string;
  cloudActive: boolean;
  /** Render just the preview body inside the Documents dialog. */
  bare?: boolean;
  /** Jump to the Owner report section to edit the wording. */
  onEditWording?: () => void;
  /** Live procedure-diagram SVG (missing + removed teeth) for the mouth
   *  diagram; omitted → the report has no diagram. */
  diagramSvg?: SVGSVGElement;
  species?: Species;
  /** Practice owner report templates; the chart's chosen (or the
   *  default) template drives the layout. Omitted = built-in report. */
  config?: OwnerReportConfig;
}

/** Longest edge for photos embedded in the report — keeps a report with
 *  several photos around a couple of MB. */
const REPORT_PHOTO_MAX_EDGE = 1000;

/**
 * Owner report preview: the chart's findings rendered as a plain-English
 * take-home PDF, with any before/after-tagged photos. Available on every
 * plan — the translation is a deterministic mapping, not AI.
 */
export const OwnerReportModal: React.FC<OwnerReportModalProps> = ({
  open,
  onClose,
  snapshot,
  branding,
  imageRoles,
  chartId,
  practiceId,
  cloudActive,
  bare = false,
  onEditWording,
  diagramSvg,
  species,
  config,
}) => {
  const { t } = useTranslation('reportui');
  const attachments = useAttachments(cloudActive ? chartId : '', practiceId);
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

  React.useEffect(() => {
    if (open && !bare) closeButtonRef.current?.focus();
  }, [open, bare]);

  React.useEffect(() => {
    if (!open || bare) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, bare]);

  React.useEffect(() => {
    if (!open || !attachments.loaded) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setGenerating(true);
    setError(null);

    (async () => {
      try {
        const tagged = attachments.items
          .map((item) => ({ item, role: imageRoles[item.id] }))
          .filter((x): x is { item: (typeof attachments.items)[number]; role: ImageRole } => !!x.role);
        const photos: OwnerReportPhoto[] = [];
        for (const { item, role } of tagged) {
          if (!item.url) continue;
          const jpegBytes = await fetchAsJpeg(item.url, REPORT_PHOTO_MAX_EDGE);
          if (jpegBytes) photos.push({ role, caption: item.caption, jpegBytes });
        }
        if (cancelled) return;
        const model = buildOwnerReportModel(snapshot, {
          config,
          practiceName: branding.practiceName,
          doctorName: branding.doctorName,
        });
        // Mouth diagram: numbered pins on the teeth with findings, in the
        // same order as the report's list. No clinical code cards.
        let diagram: { png: Uint8Array } | undefined;
        if (diagramSvg && species && hasSection(model, 'diagram')) {
          try {
            const diag = TOOTH_DIAGRAMS[species];
            const pins: DiagramPin[] = [];
            // No findings list printed → no numbers to match, so no pins.
            const pinned = hasSection(model, 'findings') ? teethWithFindings(model) : [];
            pinned.forEach((t, i) => {
              // Measured centre from the live diagram; the shape table's
              // hand-placed centre is only a fallback.
              const el = diagramSvg.querySelector<SVGGElement>(`g.tooth-group[data-triadan="${t.triadan}"]`);
              const cx = Number(el?.dataset.cx);
              const cy = Number(el?.dataset.cy);
              const tooth = diag.teeth.find((x) => x.triadan === t.triadan);
              if (Number.isFinite(cx) && Number.isFinite(cy) && el) pins.push({ x: cx, y: cy, label: String(i + 1) });
              else if (tooth) pins.push({ x: tooth.cx, y: tooth.cy, label: String(i + 1) });
            });
            diagram = { png: await diagramSvgToPng(diagramSvg, diag.width, diag.height, [], 2, undefined, diag.cropBounds, pins) };
          } catch (err) {
            console.warn('[OwnerReport] diagram render failed', err);
          }
        }
        if (cancelled) return;
        const bytes = await buildOwnerReportPdfBytes(model, branding, photos, diagram);
        if (cancelled) return;
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        pdfBlobRef.current = blob;
        setPdfUrl(createdUrl);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(i18n.t('modal.buildFailed', { ns: 'reportui' }));
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
    // Attachment identity churns with signed-URL refreshes; key on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attachments.loaded, snapshot, imageRoles, diagramSvg, species, config]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const sanitize = (value: string) => value.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${sanitize(snapshot.patientInfo.patientName) || 'patient'}_owner_report_${snapshot.patientInfo.date}.pdf`;
    if (!pdfBlobRef.current) return;
    const blob = pdfBlobRef.current;
    // In the iOS app the PDF goes to the native share sheet (Save to Files,
    // Mail, AirDrop…); the browser download / in-app-link flow is web-only.
    if (isNativeApp()) {
      void saveFile(blob, filename, 'application/pdf').catch(() => toast(i18n.t('common:errors.saveFile')));
      return;
    }
    savePdf(blob, filename).then((outcome) => {
      if (outcome === 'unsupported') void inAppLink.start(blob, filename);
    });
  };

  if (!open) return null;

  const taggedCount = attachments.items.filter((item) => imageRoles[item.id]).length;

  const body = (
        <div className="pdf-preview-body">
          <aside className="pdf-preview-styles">
            <ul className="pdf-preview-notes">
              <li>{t('modal.noteFindings')}</li>
              <li>
                {!cloudActive
                  ? t('modal.photosNeedAccount')
                  : taggedCount > 0
                    ? t('modal.photosIncluded', { count: taggedCount })
                    : t('modal.photosTag')}
              </li>
            </ul>
            {onEditWording && (
              <button type="button" className="pdf-preview-secondary" onClick={onEditWording}>
                {t('modal.editWording')}
              </button>
            )}
            <button
              type="button"
              className="pdf-preview-download"
              onClick={handleDownload}
              disabled={!pdfUrl || generating}
            >
              {isNativeApp() ? (
                <>
                  <Icon name={SQUARE_AND_ARROW_UP_ICON} size={17} />
                  {t('ios.sheets.documents.share', { ns: 'common' })}
                </>
              ) : (
                t('modal.download')
              )}
            </button>
            {!isNativeApp() && !inAppLink.state && downloadHint() && <p className="pdf-preview-hint" role="note">{downloadHint()}</p>}
            <PdfLinkPanel state={inAppLink.state} />
          </aside>
          <div className="pdf-preview-iframe-wrap">
            {generating && <div className="pdf-preview-status">{t('modal.generating')}</div>}
            {error && !generating && (
              <div className="pdf-preview-status pdf-preview-status--error">{error}</div>
            )}
            {pdfUrl && !error && (canShowPdfInline() ? (
              <iframe src={pdfUrl} title={t('modal.previewTitle')} className="pdf-preview-iframe" />
            ) : pdfBlobRef.current && (
              <PdfPagesPreview blob={pdfBlobRef.current} title={t('modal.previewTitle')} />
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
      aria-labelledby="owner-report-title"
    >
      <div className="pdf-preview-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pdf-preview-header">
          <div>
            <h2 id="owner-report-title">{t('modal.title')}</h2>
            <p>{t('modal.subtitle')}</p>
          </div>
          <button ref={closeButtonRef} type="button" className="pdf-preview-close" onClick={onClose} aria-label={t('modal.close')}>
            ×
          </button>
        </header>
        {body}
      </div>
    </div>
  );
};
