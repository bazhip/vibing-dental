import React from 'react';
import { createPdfDownloadLink, LINK_TTL_MINUTES } from '../utils/pdfDownloadLink';
import { IN_APP_BROWSER_MESSAGE } from '../utils/savePdf';
import { toast } from './ui/dialogs';

type LinkState = null | 'preparing' | { url: string; filename: string };

/** In-app browsers: turn a PDF that can't be saved from the page into a
 *  real download link (signed-in accounts), or explain the way out. */
export function useInAppPdfLink() {
  const [state, setState] = React.useState<LinkState>(null);
  const start = React.useCallback(async (blob: Blob, filename: string) => {
    setState('preparing');
    const url = await createPdfDownloadLink(blob, filename);
    if (url) setState({ url, filename });
    else {
      setState(null);
      toast(IN_APP_BROWSER_MESSAGE, { kind: 'error' });
    }
  }, []);
  const reset = React.useCallback(() => setState(null), []);
  return { state, start, reset };
}

export function PdfLinkPanel({ state }: { state: LinkState }) {
  if (!state) return null;
  if (state === 'preparing') {
    return <p className="pdf-preview-hint" role="status">Preparing a download link…</p>;
  }
  const copy = () => {
    navigator.clipboard?.writeText(state.url).then(
      () => toast('Link copied — paste it into Chrome to download.', { kind: 'success' }),
      () => window.prompt('Copy this link and open it in Chrome:', state.url),
    ) ?? window.prompt('Copy this link and open it in Chrome:', state.url);
  };
  return (
    <div className="pdf-preview-link" role="status">
      <a className="pdf-preview-link__open" href={state.url} download={state.filename}>
        Tap to download the PDF
      </a>
      <button type="button" className="pdf-preview-link__copy" onClick={copy}>Copy link</button>
      <p className="pdf-preview-link__note">
        This app’s browser can’t save the PDF directly, so here’s a link that can. It works for {LINK_TTL_MINUTES} minutes — if nothing downloads, copy it into Chrome.
      </p>
    </div>
  );
}
