import { decodePdf, MAX_PDF_BYTES, sanitizeFilename } from '../../supabase/functions/_shared/ownerReportEmail';

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
