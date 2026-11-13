import React from 'react';
import { useTranslation } from 'react-i18next';
import { createPdfDownloadLink, LINK_TTL_MINUTES } from '../utils/pdfDownloadLink';
import { inAppBrowserMessage } from '../utils/savePdf';
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
      toast(inAppBrowserMessage(), { kind: 'error' });
    }
  }, []);
  const reset = React.useCallback(() => setState(null), []);
  return { state, start, reset };
}

export function PdfLinkPanel({ state }: { state: LinkState }) {
  const { t } = useTranslation('pdfui');
  if (!state) return null;
  if (state === 'preparing') {
    return <p className="pdf-preview-hint" role="status">{t('link.preparing')}</p>;
  }
  const copy = () => {
    const prompt = () => window.prompt(t('link.copyPrompt'), state.url);
    navigator.clipboard?.writeText(state.url).then(
      () => toast(t('link.copied'), { kind: 'success' }),
      prompt,
    ) ?? prompt();
  };
  return (
    <div className="pdf-preview-link" role="status">
      <a className="pdf-preview-link__open" href={state.url} download={state.filename}>
        {t('link.open')}
      </a>
      <button type="button" className="pdf-preview-link__copy" onClick={copy}>{t('link.copy')}</button>
      <p className="pdf-preview-link__note">
        {t('link.note', { minutes: LINK_TTL_MINUTES })}
      </p>
    </div>
  );
}
