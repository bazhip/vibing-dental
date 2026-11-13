// Branded transactional email for ToothOps, sent through Resend from
// noreply@toothops.app. Matches the Supabase auth templates in
// supabase/templates (teal button, ToothOps wordmark, footer) so every
// email a practice or invitee receives looks like it comes from one
// product. Always sends an HTML body plus a plain-text alternative.
// The caller passes the recipient's language: it sets <html lang> and the
// layout's own text (fallback-link line, footer tagline).

import { emailLanguage, emailT } from './emailStrings.ts';

export const EMAIL_FROM = 'ToothOps <noreply@toothops.app>';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A paragraph already rendered by the caller: trusted HTML plus its plain-text form. */
export interface RichParagraph {
  html: string;
  text: string;
}

export interface BrandedEmail {
  /** Hidden preview line most inboxes show beside the subject. */
  preheader: string;
  title: string;
  /** Plain paragraphs (escaped; no HTML), or prebuilt RichParagraphs. */
  paragraphs: (string | RichParagraph)[];
  /** A one-time code shown large under the paragraphs (escaped). */
  code?: string;
  /** Omitted for emails with nothing to click (codes, security notices). */
  button?: { label: string; url: string };
  /** Small print under the button (escaped). */
  footnote?: string;
}

export function renderBrandedEmail(e: BrandedEmail, lng = 'en'): { html: string; text: string } {
  const lang = emailLanguage(lng);
  const paras = e.paragraphs
    .map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#17232e;">${typeof p === 'string' ? esc(p) : p.html}</p>`)
    .join('');
  const code = e.code
    ? `
      <tr><td style="padding:4px 32px 8px;">
        <div style="display:inline-block;font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:0.2em;color:#17232e;background:#f4f6f7;border:1px solid #e2e8f0;border-radius:8px;padding:10px 18px;">${esc(e.code)}</div>
      </td></tr>`
    : '';
  const url = e.button ? esc(e.button.url) : '';
  const action = e.button
    ? `
      <tr><td style="padding:12px 32px 8px;">
        <a href="${url}" style="display:inline-block;background:#0c6b63;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 22px;border-radius:8px;">${esc(e.button.label)}</a>
      </td></tr>
      <tr><td style="padding:12px 32px 28px;font-size:13px;line-height:1.5;color:#64748b;">
        ${esc(emailT(lang, 'layout.linkFallback'))}<br>
        <a href="${url}" style="color:#0c6b63;word-break:break-all;">${url}</a>
        ${e.footnote ? `<p style="margin:16px 0 0;">${esc(e.footnote)}</p>` : ''}
      </td></tr>`
    : `
      <tr><td style="padding:4px 32px 28px;font-size:13px;line-height:1.5;color:#64748b;">
        ${e.footnote ? `<p style="margin:0;">${esc(e.footnote)}</p>` : ''}
      </td></tr>`;
  const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(e.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17232e;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(e.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
      <tr><td style="padding:28px 32px 8px;">
        <div style="font-size:20px;font-weight:700;color:#0c6b63;letter-spacing:-0.01em;">ToothOps</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#17232e;">${esc(e.title)}</h1>
        ${paras}
      </td></tr>${code}${action}
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">ToothOps · ${esc(emailT(lang, 'layout.tagline'))} · <a href="https://toothops.app" style="color:#94a3b8;">toothops.app</a></p>
  </td></tr>
</table>
</body></html>`;
  const text = [
    e.title,
    '',
    ...e.paragraphs.flatMap((p) => [typeof p === 'string' ? p : p.text, '']),
    ...(e.code ? [e.code, ''] : []),
    ...(e.button ? [`${e.button.label}: ${e.button.url}`, ''] : []),
    ...(e.footnote ? [e.footnote, ''] : []),
    '— ToothOps · toothops.app',
  ].join('\n');
  return { html, text };
}

/** Send a branded email through Resend. Returns true on success. */
export function sendBrandedEmail(apiKey: string, to: string, subject: string, e: BrandedEmail, lng = 'en'): Promise<boolean> {
  return sendEmail(apiKey, { to, subject, ...renderBrandedEmail(e, lng) });
}

/**
 * Send an already-rendered email through Resend. Returns true on success.
 * `idempotencyKey` makes Resend drop a repeat of the same send (e.g. a retried webhook).
 */
export async function sendEmail(
  apiKey: string,
  m: { to: string; subject: string; html: string; text: string },
  opts: { idempotencyKey?: string } = {},
): Promise<boolean> {
  const { to, subject, html, text } = m;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(4000),
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
  }).catch(() => null);
  return !!resp?.ok;
}
