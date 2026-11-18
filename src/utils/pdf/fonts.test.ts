import { PDFDocument } from 'pdf-lib';
import { embedPdfFonts } from './fonts';

describe('Hungarian and Romanian PDF fonts', () => {
  test.each(['sans', 'serif', 'mono'] as const)('%s retains every new-language diacritic', async (family) => {
    const doc = await PDFDocument.create();
    const { regular, bold } = await embedPdfFonts(doc, 'hu', family);
    const text = 'Árvíztűrő tükörfúrógép; Îngrijire și extracție. Ăă Ââ Îî Șș Țț Őő Űű';
    for (const font of [regular, bold]) {
      // safeFont must not silently drop characters: every source character
      // needs a real glyph and must contribute to the encoded string.
      const supported = font.getCharacterSet();
      for (const ch of text) expect(supported, ch).toContain(ch.codePointAt(0));
      doc.addPage().drawText(text, { x: 20, y: 100, size: 12, font });
    }
    const saved = await doc.save();
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf = await getDocument({ data: saved, useSystemFonts: true }).promise;
    try {
      const content = await (await pdf.getPage(1)).getTextContent();
      const extracted = content.items.map((item) => 'str' in item ? item.str : '').join('');
      expect(extracted).toBe(text);
    } finally {
      await pdf.destroy();
    }
  });
});
