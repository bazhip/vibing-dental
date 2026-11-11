import { PDFDocument, StandardFonts } from 'pdf-lib';
import { safeFont } from './safeFont';

describe('safeFont', () => {
  it('draws text with emoji, arrows and CJK without throwing', async () => {
    const doc = await PDFDocument.create();
    const font = safeFont(await doc.embedFont(StandardFonts.Helvetica));
    const page = doc.addPage();
    expect(() => page.drawText('Biscuit 🐶 → recheck ≤ 2 wks 李', { x: 10, y: 10, size: 12, font })).not.toThrow();
    expect(font.widthOfTextAtSize('≥ 3 mm ✓', 12)).toBeGreaterThan(0);
    await expect(doc.save()).resolves.toBeInstanceOf(Uint8Array);
  });
});
