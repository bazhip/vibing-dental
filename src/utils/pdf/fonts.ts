import type { PDFDocument } from 'pdf-lib';
import { FONT_MAP, type FontFamilyKey } from './styles';
import { safeFont } from './safeFont';

/** Keep the established PDF fonts for existing languages. Hungarian and
 * Romanian need glyphs absent from WinAnsi, so lazily embed metric-compatible
 * Liberation fonts (SIL OFL, bundled locally for offline exports). */
export async function embedPdfFonts(doc: PDFDocument, lng: string, family: FontFamilyKey = 'sans') {
  if (lng === 'hu' || lng === 'ro') {
    const { embedUnicodeFonts } = await import('./unicodeFonts');
    return embedUnicodeFonts(doc, family);
  }
  const ids = FONT_MAP[family];
  return {
    regular: safeFont(await doc.embedFont(ids.regular)),
    bold: safeFont(await doc.embedFont(ids.bold)),
  };
}
