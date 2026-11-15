// Validation for send-owner-report's attachment. Pure (no Deno APIs) so
// src/utils/ownerReportEmail.validation.test.ts can import it.

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
