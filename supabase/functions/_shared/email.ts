// Branded transactional email for ToothOps, sent through Resend from
// noreply@toothops.app. Matches the Supabase auth templates in
// supabase/templates (teal button, ToothOps wordmark, footer) so every
// email a practice or invitee receives looks like it comes from one
// product. Always sends an HTML body plus a plain-text alternative.

export const EMAIL_FROM = 'ToothOps <noreply@toothops.app>';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface BrandedEmail {
  /** Hidden preview line most inboxes show beside the subject. */
  preheader: string;
  title: string;
  /** Plain paragraphs (escaped; no HTML). */
  paragraphs: string[];
  button: { label: string; url: string };
  /** Small print under the button (escaped). */
  footnote?: string;
}

export function renderBrandedEmail(e: BrandedEmail): { html: string; text: string } {
  const url = esc(e.button.url);
  const paras = e.paragraphs
    .map((p) => `<p style="margin:0 0 12px;font-size:16px;line-height:1.55;color:#17232e;">${esc(p)}</p>`)
    .join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(e.title)}</title></head>
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
      </td></tr>
      <tr><td style="padding:12px 32px 8px;">
        <a href="${url}" style="display:inline-block;background:#0c6b63;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:12px 22px;border-radius:8px;">${esc(e.button.label)}</a>
      </td></tr>
      <tr><td style="padding:12px 32px 28px;font-size:13px;line-height:1.5;color:#64748b;">
        If the button doesn’t work, copy this link into your browser:<br>
        <a href="${url}" style="color:#0c6b63;word-break:break-all;">${url}</a>
        ${e.footnote ? `<p style="margin:16px 0 0;">${esc(e.footnote)}</p>` : ''}
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">ToothOps · Veterinary dental charting · <a href="https://toothops.app" style="color:#94a3b8;">toothops.app</a></p>
  </td></tr>
</table>
</body></html>`;
  const text = [
    e.title,
    '',
    ...e.paragraphs.flatMap((p) => [p, '']),
    `${e.button.label}: ${e.button.url}`,
    '',
    ...(e.footnote ? [e.footnote, ''] : []),
    '— ToothOps · toothops.app',
  ].join('\n');
  return { html, text };
}

/** Send a branded email through Resend. Returns true on success. */
export async function sendBrandedEmail(apiKey: string, to: string, subject: string, e: BrandedEmail): Promise<boolean> {
  const { html, text } = renderBrandedEmail(e);
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
  }).catch(() => null);
  return !!resp?.ok;
}
