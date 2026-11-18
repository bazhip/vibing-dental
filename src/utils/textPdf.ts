/** Standalone text PDFs: unlike the fixed chart card, reports paginate rather than clip. */
export async function renderClinicalTextPdf(content: string, title: string): Promise<Uint8Array<ArrayBuffer>> {
  const { PDFDocument, StandardFonts } = await import('pdf-lib');
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  try { font.encodeText(content.replace(/\r?\n/g, '')); } catch { throw { code: 'font' }; }
  document.setProducer('ToothOps');
  document.setTitle(title);
  let page = document.addPage([595, 842]), position = 796;
  const line = (value: string) => {
    if (position < 46) {
      if (document.getPageCount() >= 200) throw { code: 'limit' };
      page = document.addPage([595, 842]); position = 796;
    }
    page.drawText(value, { x: 42, y: position, size: 11, font });
    position -= 16;
  };
  for (const paragraph of content.split(/\r?\n/)) {
    let buffer = '';
    for (const character of paragraph) {
      if (font.widthOfTextAtSize(buffer + character, 11) > 511) { line(buffer); buffer = ''; }
      buffer += character;
    }
    line(buffer);
  }
  return new Uint8Array(await document.save());
}
