// Validation and message building for send-owner-report. Pure (no Deno APIs) so
// src/utils/ownerReportEmail.validation.test.ts can import it.

import type { RichParagraph } from './email.ts';

/** Largest report the function will email (Resend allows 40 MB total). */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** A safe attachment filename: no path parts, no CR/LF, ends in .pdf. */
export function sanitizeFilename(name: string): string {
  const base = name
    .replace(/\.pdf$/i, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '_')
    .replace(/_+/g, '_')
    .trim()
    .slice(0, 100);
  return base ? `${base}.pdf` : 'owner_report.pdf';
}

export type DecodedPdf =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; code: 'attachment_invalid' | 'attachment_too_large' };

/** Decode the base64 attachment and check it really is a PDF under the cap. */
export function decodePdf(b64: string): DecodedPdf {
  if (typeof b64 !== 'string' || !b64) return { ok: false, code: 'attachment_invalid' };
  // Size check before decoding, so a huge body costs nothing to reject.
  if (Math.floor((b64.length * 3) / 4) > MAX_PDF_BYTES) return { ok: false, code: 'attachment_too_large' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, code: 'attachment_invalid' };
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    return { ok: false, code: 'attachment_invalid' };
  }
  if (!bin.startsWith('%PDF-')) return { ok: false, code: 'attachment_invalid' };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { ok: true, bytes };
}

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The typed message as email paragraphs: blank lines split paragraphs,
 *  single line breaks (the sign-off) stay line breaks in the HTML. */
export function emailParagraphs(text: string): RichParagraph[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ html: p.split('\n').map(escHtml).join('<br>'), text: p }));
}

/** From header with the practice name quoted (RFC 5322), so a name with a
 *  comma or angle brackets can't break or add to the address. */
export function fromHeader(name: string): string {
  const clean = name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'ToothOps';
  return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" <noreply@toothops.app>`;
}

export interface SenderPractice {
  name?: string;
  client_language?: string;
}

/** Whose name the email goes out under: the chart's practice, but only for
 *  a member of it (a chart's creator who left the practice mustn't email
 *  its clients as that practice); otherwise the caller's own practice. */
export function senderPractice<T extends SenderPractice>(
  chartPractice: T | null,
  callerIsMember: boolean,
  callerPractice: T | null,
): T | null {
  if (chartPractice && callerIsMember && chartPractice.name?.trim()) return chartPractice;
  return callerPractice;
}

/** A confirmation is a precondition, never the source of the destination.
 * Older clients omit it; newer clients must match the saved email exactly. */
export function confirmedRecipientMatches(saved: string, expected: unknown): boolean {
  return expected === undefined || (typeof expected === 'string' && !!expected.trim() && saved.trim() === expected.trim());
}
