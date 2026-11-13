import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

/**
 * PDF preview drawn as page images (pdf.js) for browsers that can't show
 * a PDF inside the page — Chrome for Android and Android in-app browsers
 * report `navigator.pdfViewerEnabled === false` and render an empty box
 * with a "PDF" icon; iOS Safari shows only the first page, unscrollable.
 * Everyone else keeps the browser's own viewer (an <iframe>).
 */
export function canShowPdfInline(): boolean {
  const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports a Mac
  return nav.pdfViewerEnabled !== false && !iOS;
}

interface Props {
  /** The PDF to show; re-renders when it changes. */
  blob: Blob;
  title: string;
}

export function PdfPagesPreview({ blob, title }: Props) {
  const { t } = useTranslation('pdfui');
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setError(false);
    (async () => {
      try {
        // Loaded on demand: only the browsers that need it pay for pdf.js.
        // The legacy build: the phones that need this preview often run
        // an older Chrome / WebView (the modern build needs Chrome 122+
        // and failed on Chrome 113 with "Iterator is not defined").
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist/legacy/build/pdf.mjs'),
          import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        destroy = () => { void task.destroy(); };
        const doc = await task.promise;
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssWidth = Math.max(host.clientWidth - 16, 200);
        const pages: HTMLCanvasElement[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = 'pdf-pages-preview__page';
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', i18n.t('pages.pageAria', { ns: 'pdfui', title, n, total: doc.numPages }));
          const ctx = canvas.getContext('2d');
          // eslint-disable-next-line no-restricted-syntax -- dev-only: caught below; the user sees the generic preview error
          if (!ctx) throw new Error('No 2D canvas');
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          pages.push(canvas);
        }
        host.replaceChildren(...pages);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [blob, title]);

  return (
    <div className="pdf-pages-preview" aria-label={title}>
      <div ref={hostRef} className="pdf-pages-preview__pages" />
      {error && <div className="pdf-preview-status pdf-preview-status--error">{t('pages.failed')}</div>}
    </div>
  );
}
