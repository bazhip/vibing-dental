import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage, StandardFonts } from 'pdf-lib';
import { continuationLines, drawClinicalContinuations } from './continuation';

describe('clinical continuation pages', () => {
  it('wraps maximum-length unbroken field values without losing characters or crossing the page edge', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const value = 'W'.repeat(500);
    const lines = continuationLines(value, font, 9.5, 700);
    expect(lines.join('')).toBe(value);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(font.widthOfTextAtSize(line, 9.5)).toBeLessThanOrEqual(700);
  });

  it('continues a single long note across pages without dropping its end', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const spy = vi.spyOn(PDFPage.prototype, 'drawText');
    drawClinicalContinuations(doc, [{ title: 'Anesthesia', paragraphs: ['Clinical detail '.repeat(2500) + 'END-OF-NOTE'] }], font, bold);
    const printed = spy.mock.calls.map(([text]) => text).join(' ');
    spy.mockRestore();
    expect(printed).toContain('END-OF-NOTE');
    expect(doc.getPageCount()).toBeGreaterThan(2);
    const bytes = await doc.save();
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(doc.getPageCount());
  });
});
