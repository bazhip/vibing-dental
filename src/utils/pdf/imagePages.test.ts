import { PDFDocument, StandardFonts } from 'pdf-lib';
import { drawImagePage, IMAGES_PER_PAGE, type PdfImage } from './sections';

// 2×2 px JPEG — enough for pdf-lib to embed.
const JPEG_B64 = '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAAqADAAQAAAABAAAAAgAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAgACAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A/WD9m/wH4H1L9nj4XajqPh3Trq7uvC2iSzTS2kLySSPYwszuzKSzMSSSTknk17R/wrb4d/8AQraV/wCAMH/xFcF+zF/ybZ8Jv+xS0H/0ghr3GgD/2Q==';
const jpeg = () => Uint8Array.from(atob(JPEG_B64), (c) => c.charCodeAt(0));

async function setup() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([792, 612]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, page, regular, bold };
}

describe('drawImagePage', () => {
  it('lays out four images per page', () => {
    expect(IMAGES_PER_PAGE).toBe(4);
  });

  it('draws a full page of images and survives a missing one', async () => {
    const { doc, page, regular, bold } = await setup();
    const images: PdfImage[] = [
      { jpegBytes: jpeg(), caption: 'Left maxilla', kind: 'photo' },
      { jpegBytes: jpeg(), caption: '', kind: 'xray' },
      { jpegBytes: null, caption: 'Failed fetch', kind: 'photo' },
      { jpegBytes: jpeg(), caption: 'Right mandible', kind: 'xray' },
    ];
    await drawImagePage(doc, page, images, 4, 9, regular, bold);
    const bytes = await doc.save();
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('drops caption characters the standard font cannot encode', async () => {
    const { doc, page, regular, bold } = await setup();
    const images: PdfImage[] = [
      { jpegBytes: jpeg(), caption: 'Fractured 104 🦷 → extract', kind: 'photo' },
    ];
    await expect(drawImagePage(doc, page, images, 0, 1, regular, bold)).resolves.toBeUndefined();
  });

  it('tolerates corrupt image bytes', async () => {
    const { doc, page, regular, bold } = await setup();
    const images: PdfImage[] = [
      { jpegBytes: new Uint8Array([1, 2, 3]), caption: 'Corrupt', kind: 'photo' },
    ];
    await expect(drawImagePage(doc, page, images, 0, 1, regular, bold)).resolves.toBeUndefined();
  });
});
