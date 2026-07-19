import React from 'react';
import { ChartSnapshot, ImageRole } from '../types';
import { useAttachments } from '../hooks/useAttachments';
import { buildOwnerReportModel } from '../utils/ownerReport';
import { buildOwnerReportPdfBytes, OwnerReportBranding, OwnerReportPhoto } from '../utils/ownerReportPdf';

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
}

/** Longest edge for photos embedded in the report — keeps a report with
 *  several photos around a couple of MB. */
const REPORT_PHOTO_MAX_EDGE = 1000;

/** Fetch a signed image URL and re-encode it as a right-sized JPEG. */
async function toReportJpeg(url: string): Promise<Uint8Array | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, REPORT_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82)
    );
    return jpeg ? new Uint8Array(await jpeg.arrayBuffer()) : null;
  } catch {
    return null; // a photo that won't load shouldn't sink the report
  }
}

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
}) => {
  const attachments = useAttachments(cloudActive ? chartId : '', practiceId);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
          const jpegBytes = await toReportJpeg(item.url);
          if (jpegBytes) photos.push({ role, caption: item.caption, jpegBytes });
        }
        if (cancelled) return;
        const model = buildOwnerReportModel(snapshot);
        const bytes = await buildOwnerReportPdfBytes(model, branding, photos);
        if (cancelled) return;
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError("Couldn't build the owner report. Retry in a moment.");
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
  }, [open, attachments.loaded, snapshot, imageRoles]);

  const handleDownload = () => {
    if (!pdfUrl) return;
    const sanitize = (value: string) => value.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${sanitize(snapshot.patientInfo.patientName) || 'patient'}_owner_report_${snapshot.patientInfo.date}.pdf`;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!open) return null;

  const taggedCount = attachments.items.filter((item) => imageRoles[item.id]).length;

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
            <h2 id="owner-report-title">Owner report</h2>
            <p>
              The chart in plain English, for the owner to take home.
              {cloudActive && taggedCount === 0 && (
                <> Tag photos as Before/After in the Images section to include them.</>
              )}
            </p>
          </div>
          <button ref={closeButtonRef} type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close owner report">
            ×
          </button>
        </header>
        <div className="pdf-preview-body">
          <aside className="pdf-preview-styles">
            <button
              type="button"
              className="pdf-preview-download"
              onClick={handleDownload}
              disabled={!pdfUrl || generating}
            >
              Download PDF
            </button>
          </aside>
          <div className="pdf-preview-iframe-wrap">
            {generating && <div className="pdf-preview-status">Generating the owner report…</div>}
            {error && !generating && (
              <div className="pdf-preview-status pdf-preview-status--error">{error}</div>
            )}
            {pdfUrl && !error && (
              <iframe src={pdfUrl} title="Owner report preview" className="pdf-preview-iframe" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
