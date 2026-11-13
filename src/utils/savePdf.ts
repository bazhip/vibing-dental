import i18n from '../i18n';

/**
 * Save a generated PDF as a real file download on every browser that
 * allows it — validated on an Android 14 emulator:
 *
 *  - Firefox for Android opened an `application/pdf` blob link in its
 *    PDF viewer instead of saving it ("I get the preview, Download does
 *    nothing"). Typing the download as application/octet-stream (the
 *    .pdf name stays) makes every browser save it rather than show it.
 *  - Chrome for Android saves it and offers to open it.
 *  - Android in-app browsers (WebViews: links opened from Gmail,
 *    Outlook, Facebook, …) drop blob downloads silently. There the PDF
 *    goes to the system share sheet when the WebView supports it; if it
 *    doesn't, the caller explains how to open the page in Chrome.
 */
export type SaveOutcome = 'shared' | 'cancelled' | 'downloaded' | 'unsupported';

/** Android WebView ("; wv)" in the UA) or a known in-app browser —
 *  places where blob downloads are dropped without any error. */
export function isInAppBrowser(ua: string = navigator.userAgent): boolean {
  return /; wv\)/.test(ua) || /\b(FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|GSA\/|MicroMessenger)\b/.test(ua);
}

/** Call straight from the click handler (sharing needs the tap's user
 *  activation), with the PDF bytes already in hand. */
export async function savePdf(blob: Blob, filename: string): Promise<SaveOutcome> {
  if (isInAppBrowser()) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      }
    }
    return 'unsupported';
  }

  // Generic binary so browsers save the file instead of opening their
  // PDF viewer (Firefox for Android otherwise never saves it).
  const download = new Blob([blob], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(download);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later — some mobile browsers fetch the file after click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/** Firefox for Android: it opens every .pdf download in its own viewer
 *  (by design, whatever the file type) — saving is that viewer's
 *  Download button. Verified on Firefox 160 / Android 14. */
export function isFirefoxAndroid(ua: string = navigator.userAgent): boolean {
  return /Android/.test(ua) && /Firefox\//.test(ua);
}

/** A line to show beside the Download button where the browser won't
 *  simply save the file, so nobody is left wondering what happened. */
export function downloadHint(ua: string = navigator.userAgent): string | null {
  if (isFirefoxAndroid(ua)) return i18n.t('hints.firefoxAndroid', { ns: 'pdfui' });
  if (isInAppBrowser(ua)) return i18n.t('hints.inAppBrowser', { ns: 'pdfui' });
  return null;
}

/** Shown when an in-app browser can't save the PDF at all. */
export const inAppBrowserMessage = (): string => i18n.t('hints.inAppBrowserMessage', { ns: 'pdfui' });
