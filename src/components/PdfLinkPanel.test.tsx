import React from 'react';
import { render, screen } from '@testing-library/react';
import { PdfLinkPanel } from './PdfLinkPanel';
import { canShowPdfInline } from './PdfPagesPreview';

test('the link panel offers a real download link and a copy fallback', () => {
  render(<PdfLinkPanel state={{ url: 'https://x/sign/download.pdf?token=t', filename: 'fluffy.pdf' }} />);
  const link = screen.getByRole('link', { name: 'Tap to download the PDF' });
  expect(link).toHaveAttribute('href', 'https://x/sign/download.pdf?token=t');
  expect(link).toHaveAttribute('download', 'fluffy.pdf');
  expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
});

test('while the link is being made, it says so', () => {
  render(<PdfLinkPanel state="preparing" />);
  expect(screen.getByRole('status')).toHaveTextContent('Preparing a download link');
});

test('page-image preview only where the browser can\'t show PDFs inline', () => {
  const set = (pdfViewerEnabled: boolean | undefined, ua: string) => {
    Object.defineProperty(navigator, 'pdfViewerEnabled', { value: pdfViewerEnabled, configurable: true });
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  };
  set(true, 'Mozilla/5.0 (Macintosh) Chrome/130');
  expect(canShowPdfInline()).toBe(true);
  set(false, 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile');   // Chrome for Android, WebViews
  expect(canShowPdfInline()).toBe(false);
  set(true, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'); // iOS shows page 1 only
  expect(canShowPdfInline()).toBe(false);
  set(true, 'Mozilla/5.0 (Android 14; Mobile; rv:160.0) Firefox/160.0'); // Firefox has pdf.js built in
  expect(canShowPdfInline()).toBe(true);
});
