import React from 'react';
import {
  buildDentalChartPDFBytes,
  PDF_STYLES,
  DEFAULT_PDF_STYLE_ID,
} from '../utils/pdfGenerator';
import { diagramSvgToPng, CommentForExport } from '../utils/svgToPng';
import { TOOTH_DIAGRAMS } from '../constants/toothShapes';
import { useBoard } from './BoardSwitcher';
import {
  PatientInfo,
  ToothData,
  Species,
  Logo,
  ToothMarks,
  DiagramComment,
  DiagramStroke,
} from '../types';

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
}

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** Returns the chart snapshot — captured fresh each time the modal opens. */
  snapshot: ChartSnapshot | null;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({ open, onClose, snapshot }) => {
  const { board } = useBoard();
  // Default the PDF style to the active UI theme so the preview opens
  // in matching chrome. The user can still pick a different style in
  // the modal's sidebar — that override stays for this session.
  const initialStyleId = PDF_STYLES.some((s) => s.id === board.id)
    ? board.id
    : DEFAULT_PDF_STYLE_ID;
  const [styleId, setStyleId] = React.useState<string>(initialStyleId);
  // When the modal opens (or the active theme changes), realign the
  // selected style to whatever the UI is currently showing.
  React.useEffect(() => {
    if (open) setStyleId(initialStyleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, board.id]);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);

  // Move focus into the dialog on open so keyboard / screen-reader users
  // land inside it rather than back on the trigger.
  React.useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open || !snapshot) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setGenerating(true);
    setError(null);

    (async () => {
      try {
        const style = PDF_STYLES.find((s) => s.id === styleId) ?? PDF_STYLES[0];
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
          styleId
        );
        if (cancelled) return;
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError('Couldn\'t build the preview. See console for details.');
        }
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, snapshot, styleId]);

  const handleDownload = () => {
    if (!pdfUrl || !snapshot) return;
    const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const { patientInfo } = snapshot;
    const filename = `${sanitize(patientInfo.patientName) || 'chart'}_${sanitize(patientInfo.patientNumber) || 'pid'}_${patientInfo.date}.pdf`;
    const a = document.createElement('a');
    a.href = pdfUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (!open) return null;

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
            <h2 id="pdf-preview-title">Preview &amp; Download</h2>
            <p>Pick a style — the preview re-renders live.</p>
          </div>
          <button ref={closeButtonRef} type="button" className="pdf-preview-close" onClick={onClose} aria-label="Close preview">
            ×
          </button>
        </header>
        <div className="pdf-preview-body">
          <aside className="pdf-preview-styles">
            <ul role="radiogroup" aria-label="PDF style">
              {PDF_STYLES.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={s.id === styleId}
                    className={`pdf-preview-style${s.id === styleId ? ' pdf-preview-style--active' : ''}`}
                    onClick={() => setStyleId(s.id)}
                  >
                    <strong>{s.name}</strong>
                    <span>{s.description}</span>
                  </button>
                </li>
              ))}
            </ul>
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
            {generating && (
              <div className="pdf-preview-status">Generating preview…</div>
            )}
            {error && !generating && (
              <div className="pdf-preview-status pdf-preview-status--error">{error}</div>
            )}
            {pdfUrl && !error && (
              <iframe
                key={styleId}
                src={pdfUrl}
                title="PDF preview"
                className="pdf-preview-iframe"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
