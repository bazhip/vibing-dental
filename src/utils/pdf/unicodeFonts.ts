import type { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { FontFamilyKey } from './styles';
import { safeFont } from './safeFont';

// Inline data URLs keep fonts inside local JS assets, including the extension.
// Each family is a separate lazy chunk; existing-language PDFs load none of it.
const sources = {
  sans: () => Promise.all([
    import('../../assets/fonts/LiberationSans-Regular.ttf?url&inline'),
    import('../../assets/fonts/LiberationSans-Bold.ttf?url&inline'),
  ]),
  serif: () => Promise.all([
    import('../../assets/fonts/LiberationSerif-Regular.ttf?url&inline'),
    import('../../assets/fonts/LiberationSerif-Bold.ttf?url&inline'),
  ]),
  mono: () => Promise.all([
    import('../../assets/fonts/LiberationMono-Regular.ttf?url&inline'),
    import('../../assets/fonts/LiberationMono-Bold.ttf?url&inline'),
  ]),
};

const bytes = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (ch) => ch.charCodeAt(0));

export async function embedUnicodeFonts(doc: PDFDocument, family: FontFamilyKey) {
  doc.registerFontkit(fontkit);
  const [regular, bold] = await sources[family]();
  return {
    regular: safeFont(await doc.embedFont(bytes(regular.default), { subset: true })),
    bold: safeFont(await doc.embedFont(bytes(bold.default), { subset: true })),
  };
}
