import { confirmedRecipientMatches, decodePdf, emailParagraphs, fromHeader, MAX_PDF_BYTES, sanitizeFilename, senderPractice, type SenderPractice } from '../../supabase/functions/_shared/ownerReportEmail';

describe('owner report email validation', () => {
  it('sanitizes filenames so they cannot inject headers', () => {
    expect(sanitizeFilename('a/b\r\nc.pdf')).toBe('a_b_c.pdf');
    expect(sanitizeFilename('')).toBe('owner_report.pdf');
    expect(sanitizeFilename('rex')).toBe('rex.pdf');
    expect(sanitizeFilename('rex_owner_report_2026-11-14.pdf')).toBe('rex_owner_report_2026-11-14.pdf');
    expect(sanitizeFilename(`${'x'.repeat(300)}.pdf`).length).toBeLessThanOrEqual(104);
  });

  it('accepts a real PDF', () => {
    const r = decodePdf(btoa('%PDF-1.7 x'));
    expect(r.ok).toBe(true);
  });

  it('rejects bytes that are not a PDF', () => {
    expect(decodePdf(btoa('hello'))).toEqual({ ok: false, code: 'attachment_invalid' });
  });

  it('rejects invalid base64', () => {
    expect(decodePdf('!!!')).toEqual({ ok: false, code: 'attachment_invalid' });
    expect(decodePdf('')).toEqual({ ok: false, code: 'attachment_invalid' });
  });

  it('rejects a report over the size cap before decoding it', () => {
    const big = 'A'.repeat(Math.ceil((MAX_PDF_BYTES * 4) / 3) + 8);
    expect(decodePdf(big)).toEqual({ ok: false, code: 'attachment_too_large' });
  });
});

describe('owner report email content', () => {
  it('keeps single line breaks (the sign-off) in the HTML body', () => {
    const paras = emailParagraphs('Hi Sam,\n\nAttached <b>.\n\nThank you,\nElm Vet');
    expect(paras).toHaveLength(3);
    expect(paras[2].html).toBe('Thank you,<br>Elm Vet');
    expect(paras[2].text).toBe('Thank you,\nElm Vet');
    expect(paras[1].html).toBe('Attached &lt;b&gt;.');
  });

  it('quotes the sender name so commas and brackets can’t break the From header', () => {
    expect(fromHeader('Smith, Jones Vet')).toBe('"Smith, Jones Vet" <noreply@toothops.app>');
    expect(fromHeader('A "B" \\ C <x@y>')).toBe('"A \\"B\\" \\\\ C <x@y>" <noreply@toothops.app>');
    expect(fromHeader('Line\r\nBcc: x@y')).toBe('"Line Bcc: x@y" <noreply@toothops.app>');
    expect(fromHeader('   ')).toBe('"ToothOps" <noreply@toothops.app>');
  });

  it('uses the chart’s practice only for a member of it', () => {
    const chartP: SenderPractice = { name: 'Elm Vet', client_language: 'fr' };
    const ownP: SenderPractice = { name: 'Oak Vet', client_language: 'de' };
    expect(senderPractice(chartP, true, ownP)).toBe(chartP);
    expect(senderPractice(chartP, false, ownP)).toBe(ownP);
    expect(senderPractice(null, false, ownP)).toBe(ownP);
    expect(senderPractice({ name: ' ' }, true, ownP)).toBe(ownP);
    expect(senderPractice(null, false, null)).toBeNull();
  });
});

it('rejects a saved owner email that differs from the confirmed recipient', () => {
  expect(confirmedRecipientMatches('new@example.com', 'sam@example.com')).toBe(false);
  expect(confirmedRecipientMatches('sam@example.com', ' sam@example.com ')).toBe(true);
  expect(confirmedRecipientMatches('sam@example.com', '')).toBe(false);
  expect(confirmedRecipientMatches('sam@example.com', null)).toBe(false);
  // Older app clients do not send a precondition; retain their existing contract.
  expect(confirmedRecipientMatches('sam@example.com', undefined)).toBe(true);
});
