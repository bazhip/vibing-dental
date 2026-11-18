import { PDFPage, type PDFFont } from 'pdf-lib';
import { buildOwnerReportModel } from './ownerReport';
import { defaultTemplate } from './ownerReportConfig';
import { sampleOwnerReportSnapshot } from './ownerReportSample';
import { buildOwnerReportPdfBytes } from './ownerReportPdf';

test('a long Romanian practice name and report title occupy separate header space', async () => {
  const header: { text: string; x: number; y: number; size: number; font: PDFFont }[] = [];
  let collecting = true;
  const draw = PDFPage.prototype.drawText;
  const line = PDFPage.prototype.drawLine;
  const textSpy = vi.spyOn(PDFPage.prototype, 'drawText').mockImplementation(function (this: PDFPage, text, opts) {
    if (collecting && opts?.font) header.push({ text, x: opts.x!, y: opts.y!, size: opts.size!, font: opts.font });
    return draw.call(this, text, opts);
  });
  const lineSpy = vi.spyOn(PDFPage.prototype, 'drawLine').mockImplementation(function (this: PDFPage, opts) {
    collecting = false;
    return line.call(this, opts);
  });
  try {
    await buildOwnerReportPdfBytes(buildOwnerReportModel(sampleOwnerReportSnapshot('ro'), { template: defaultTemplate('ro') }), {
      practiceName: 'Cabinet de stomatologie veterinară și chirurgie maxilo-facială',
      doctorName: 'Dr. Alexandra Ștefănescu-Kovács', logoUrl: '',
    }, []);
    expect(header.some((run) => run.text.includes('stomatologice'))).toBe(true);
    for (let i = 0; i < header.length; i++) {
      const a = header[i];
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.font.widthOfTextAtSize(a.text, a.size)).toBeLessThanOrEqual(612);
      for (const b of header.slice(i + 1)) {
        if (Math.abs(a.y - b.y) < Math.min(a.size, b.size)) {
          const left = a.x < b.x ? a : b, right = left === a ? b : a;
          expect(left.x + left.font.widthOfTextAtSize(left.text, left.size)).toBeLessThan(right.x);
        }
      }
    }
  } finally {
    textSpy.mockRestore(); lineSpy.mockRestore();
  }
});
