import { isRtlText } from './pdf/draw';
import { embedPdfFonts } from './pdf/fonts';

/** Standalone text PDFs paginate long notes. Passing a document language enables Unicode fonts. */
export async function renderClinicalTextPdf(content: string, title: string, language?: string): Promise<Uint8Array<ArrayBuffer>> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const document = await PDFDocument.create();
  const text = language ? content.replace(/\t/g, '    ') : content;
  const rtl = language?.split('-')[0] === 'ar';
  const combined = `${title}\n${text}`;
  const fontLocale = rtl ? 'ar'
    : language?.split('-')[0] === 'zh' || /\p{Script=Han}/u.test(combined) ? 'zh'
      : /\p{Script=Arabic}/u.test(combined) ? 'ar' : 'ro';
  const font = language
    ? (await embedPdfFonts(document, fontLocale, 'sans', combined)).regular
    : await document.embedFont(StandardFonts.Helvetica);
  if (language) {
    const supported = new Set(font.getCharacterSet());
    for (const character of text) {
      if (!/[\r\n\p{Cf}]/u.test(character) && !supported.has(character.codePointAt(0)!)) throw { code: 'font' };
    }
  } else {
    try { font.encodeText(text.replace(/\r?\n/g, '')); } catch { throw { code: 'font' }; }
  }
  document.setProducer('ToothOps');
  document.setTitle(title);
  let page = document.addPage([595, 842]), position = 796;
  const segmenter = language ? new Intl.Segmenter(language, { granularity: 'grapheme' }) : undefined;
  const line = (value: string) => {
    if (position < 46) {
      if (document.getPageCount() >= 200) throw { code: 'limit' };
      page = document.addPage([595, 842]); position = 796;
    }
    const x = language && (rtl || isRtlText(value)) ? 553 - font.widthOfTextAtSize(value, 11) : 42;
    page.drawText(value, { x, y: position, size: 11, font });
    position -= 16;
  };
  for (const paragraph of text.split(/\r?\n/)) {
    let buffer = '';
    const characters = segmenter ? segmenter.segment(paragraph) : paragraph;
    for (const chunk of characters) {
      const character = typeof chunk === 'string' ? chunk : chunk.segment;
      if (font.widthOfTextAtSize(buffer + character, 11) > 511) { line(buffer); buffer = ''; }
      buffer += character;
    }
    line(buffer);
  }
  return new Uint8Array(await document.save());
}
