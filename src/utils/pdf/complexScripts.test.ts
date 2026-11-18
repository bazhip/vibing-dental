import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { bidiLayout } from './complexFonts';
import { embedPdfFonts } from './fonts';
import { wrapToWidth } from './draw';
import { pdfSafe } from '../ownerReportPdf';

const samples = { zh: '患者：小白，主人：张伟。牙齿 108，AVDC PD3。', ar: 'محمد أحمد — علاج (AVDC PD3) 108 بتاريخ 2026-11-18 — Dr. Lee Sam Rivera' };

describe('searchable Chinese and Arabic PDFs', () => {
  test.each(['zh', 'ar'] as const)('%s has real glyphs and extracts mixed clinical text', async (lng) => {
    const doc = await PDFDocument.create();
    const { regular, bold } = await embedPdfFonts(doc, lng);
    const sample = `${samples[lng]} 张伟 محمد Ștefan Łukasz 108 T/FX`;
    for (const font of [regular, bold]) {
      for (const ch of sample) expect(font.getCharacterSet(), ch).toContain(ch.codePointAt(0));
      expect(font.encodeText(sample).asString().match(/.{4}/g)).not.toContain('0000');
      doc.addPage([1200, 600]).drawText(sample, { font, x: 30, y: 300, size: 14 });
    }
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const saved = await doc.save();
    // Extraction alone does not validate outlines. Odd loca offsets in the
    // upstream variable font used to produce missing/corrupt subset glyphs.
    const reloaded = await PDFDocument.load(saved);
    for (const [, object] of reloaded.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) continue;
      const reference = object.get(PDFName.of('FontFile2'));
      if (!reference) continue;
      const stream = reloaded.context.lookup(reference);
      expect(stream).toBeInstanceOf(PDFRawStream);
      if (!(stream instanceof PDFRawStream)) continue;
      const subset = fontkit.create(decodePDFRawStream(stream).decode());
      for (let glyph = 0; glyph < subset.numGlyphs; glyph++) expect(() => subset.getGlyph(glyph).path.toSVG()).not.toThrow();
    }
    const pdf = await getDocument({ data: saved }).promise;
    try {
      for (let n = 1; n <= 2; n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        const extracted = content.items.map(item => 'str' in item ? item.str : '').join('');
        for (const word of (lng === 'ar' ? ['محمد', 'أحمد', 'علاج', 'AVDC', '108', '2026-11-18', 'AVDC PD3', 'Dr. Lee Sam Rivera'] : ['小白', '张伟', '108', 'AVDC'])) expect(extracted).toContain(word);
        for (const name of ['张伟', 'محمد', 'Ștefan', 'Łukasz', '108', 'T/FX']) expect(extracted).toContain(name);
        expect(extracted).not.toMatch(/[\u0000-\u001f]/);
      }
    } finally { await pdf.destroy(); }
  });

  test('Arabic positions mirrored brackets and Latin phrases correctly', async () => {
    const { default: url } = await import('../../assets/fonts/NotoSansArabic-Regular.ttf?url&inline');
    const data = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), ch => ch.charCodeAt(0));
    const font = fontkit.create(data);
    const visual = bidiLayout(font, 'علاج (AVDC PD3) 108 — Dr. Lee Sam Rivera').glyphs.map(glyph => String.fromCodePoint(...glyph.codePoints)).join('');
    expect(visual).toContain('(AVDC PD3)');
    expect(visual).toContain('Dr. Lee Sam Rivera');
  });

  test.each(['zh', 'ar'] as const)('%s catalogs use supported glyphs', async (lng) => {
    const doc = await PDFDocument.create();
    const { regular } = await embedPdfFonts(doc, lng);
    const supported = new Set(regular.getCharacterSet());
    const catalogs = import.meta.glob('../../locales/{zh,ar}/{pdf,report}.json', { eager: true, import: 'default' });
    const strings = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
    const missing = new Set<string>();
    for (const [path, catalog] of Object.entries(catalogs)) {
      if (!path.includes(`/${lng}/`)) continue;
      for (const text of strings(catalog)) for (const ch of text) {
        if (!/\s/u.test(ch) && ch !== '✕' && !supported.has(ch.codePointAt(0)!)) missing.add(ch);
      }
    }
    expect([...missing]).toEqual([]);
  });

  test('owner-report sanitization preserves CJK and Arabic', () => {
    for (const sample of Object.values(samples)) expect(pdfSafe(sample)).toBe(sample);
  });

  test('Chinese wraps without spaces while retaining all text', async () => {
    const doc = await PDFDocument.create();
    const { regular } = await embedPdfFonts(doc, 'zh');
    const text = '这是一段没有空格的牙科检查结果牙齿108需要自动换行AVDC以避免越过页面边界';
    const lines = wrapToWidth(text, regular, 12, 80);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe(text);
    expect(lines.some(line => line.includes('108'))).toBe(true);
    expect(lines.some(line => line.includes('AVDC'))).toBe(true);
    for (const line of lines) expect(regular.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(80);
  });
  test('Chinese text with an oversized Latin token still fits every line', async () => {
    const doc = await PDFDocument.create();
    const { regular } = await embedPdfFonts(doc, 'zh');
    const text = '患者AVDC超长姓名' + 'Alexandria'.repeat(12) + '牙齿108';
    const lines = wrapToWidth(text, regular, 12, 80);
    expect(lines.join('')).toBe(text);
    expect(lines.some(line => line.includes('AVDC'))).toBe(true);
    expect(lines.some(line => line.includes('108'))).toBe(true);
    for (const line of lines) expect(regular.widthOfTextAtSize(line, 12)).toBeLessThanOrEqual(80);
  });

});
