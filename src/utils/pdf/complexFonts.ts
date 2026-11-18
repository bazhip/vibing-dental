import fontkit, { type Font, type GlyphRun } from '@pdf-lib/fontkit';
import bidiFactory from 'bidi-js';
import {
  type PDFDocument, type PDFFont, type PDFPage, PDFHexString,
  beginText, endText, pushGraphicsState, popGraphicsState, setFontAndSize,
  setTextMatrix, showText, setFillingRgbColor, beginMarkedContent, endMarkedContent,
  PDFOperator, PDFOperatorNames, PDFName,
} from 'pdf-lib';

const bidi = bidiFactory();
const ARABIC = /\p{Script=Arabic}/u;
const bytes = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), ch => ch.charCodeAt(0));
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const words = new Intl.Segmenter(undefined, { granularity: 'word' });

type DirectionalRun = { text: string; rtl: boolean };

/** Resolve the full line before choosing fallback fonts, so names and codes
 * retain their order even when the line spans three different writing systems. */
function directionalRuns(text: string): DirectionalRun[] {
  if (!ARABIC.test(text)) return [{ text, rtl: false }];
  // Isolate complete Latin phrases, not individual words (Dr. Lee must stay
  // together). Dates and AVDC identifiers also have LTR semantics in Arabic.
  text = text.replace(/[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}\p{M}/:.%+\-]*(?:[ \t]+[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}\p{M}/:.%+\-]*)*/gu, token => `\u2066${token}\u2069`);
  const embedding = bidi.getEmbeddingLevels(text);
  const mirrored = bidi.getMirroredCharactersMap(text, embedding.levels);
  const indices = bidi.getReorderedIndices(text, embedding);
  const visualIndices = new Map(indices.map((logical, visual) => [logical, visual]));
  const runs: { start: number; end: number; rtl: boolean; visual: number }[] = [];
  for (let start = 0; start < text.length;) {
    let end = start + 1;
    while (end < text.length && embedding.levels[end] === embedding.levels[start]) end++;
    runs.push({ start, end, rtl: !!(embedding.levels[start] & 1), visual: Math.min(...Array.from({ length: end - start }, (_, i) => visualIndices.get(start + i)!)) });
    start = end;
  }
  return runs.sort((a, b) => a.visual - b.visual).map(run => {
    let logical = '';
    for (let index = run.start; index < run.end;) {
      const ch = String.fromCodePoint(text.codePointAt(index)!);
      logical += mirrored.get(index) ?? ch;
      index += ch.length;
    }
    return { text: logical.replace(/[\u2066\u2069]/g, ''), rtl: run.rtl };
  }).filter(run => run.text.length > 0);
}

function shape(font: Font, run: DirectionalRun): GlyphRun {
  // Noto ccmp decomposes dotted letters into shared bases and unencoded dot
  // glyphs, corrupting ToUnicode. Keep complete encoded letters; contextual
  // forms, cursive joining and GPOS mark positioning remain enabled.
  return (font.layout as (text: string, features: { ccmp: boolean }, script?: string, language?: string, direction?: string) => GlyphRun)(run.text, { ccmp: false }, undefined, undefined, run.rtl ? 'rtl' : 'ltr');
}

/** Single-font helper also used to verify bidi and contextual shaping. */
export function bidiLayout(font: Font, text: string): GlyphRun {
  const runs = directionalRuns(text).map(run => shape(font, run));
  return { ...runs[0], glyphs: runs.flatMap(run => run.glyphs), positions: runs.flatMap(run => run.positions) };
}

type SourceFont = {
  font: Font;
  pdf: PDFFont;
  supported: Set<number>;
  encode: (run: GlyphRun) => string;
};
type LoadedFont = Pick<SourceFont, 'font' | 'supported'> & { data: Uint8Array };
export const complexFontSources = {
  cjkRegular: () => import('../../assets/fonts/NotoSansSC-Regular.ttf?url&inline'),
  cjkBold: () => import('../../assets/fonts/NotoSansSC-Bold.ttf?url&inline'),
  arabicRegular: () => import('../../assets/fonts/NotoSansArabic-Regular.ttf?url&inline'),
  arabicBold: () => import('../../assets/fonts/NotoSansArabic-Bold.ttf?url&inline'),
  latinRegular: () => import('../../assets/fonts/LiberationSans-Regular.ttf?url&inline'),
  latinBold: () => import('../../assets/fonts/LiberationSans-Bold.ttf?url&inline'),
};
type FontSource = keyof typeof complexFontSources;
const loadedFonts = new Map<FontSource, LoadedFont>();

type FontRun = { source: SourceFont; shaped: GlyphRun };
type CompositeFont = { sources: SourceFont[]; layout: (text: string) => FontRun[] };
const documents = new WeakMap<PDFDocument, Map<PDFFont, CompositeFont>>();

function compositeLayout(sources: SourceFont[], text: string): FontRun[] {
  return directionalRuns(text).flatMap(direction => {
    const selected: { source: SourceFont; text: string }[] = [];
    const tokens = [...words.segment(direction.text)].flatMap(({ segment }) =>
      sources.some(candidate => [...segment].every(ch => candidate.supported.has(ch.codePointAt(0)!)))
        ? [segment] : [...graphemes.segment(segment)].map(part => part.segment));
    for (const segment of tokens) {
      // Keep combining marks with their base letter whenever one font covers
      // the grapheme. No glyph is discarded when moving between scripts.
      const source = sources.find(candidate => [...segment].every(ch => candidate.supported.has(ch.codePointAt(0)!))) ?? sources[0];
      const previous = selected[selected.length - 1];
      if (previous?.source === source) previous.text += segment;
      else selected.push({ source, text: segment });
    }
    if (direction.rtl) selected.reverse();
    return selected.map(run => ({ source: run.source, shaped: shape(run.source.font, { text: run.text, rtl: direction.rtl }) }));
  });
}

/** pdf-lib assumes one font per drawText and discards GPOS offsets. Render
 * each chosen embedded glyph at its shaped position, retaining real text and
 * ToUnicode maps rather than replacing unsupported names with .notdef glyphs. */
function installCompositeText(doc: PDFDocument, pdfFont: PDFFont, composite: CompositeFont) {
  let fonts = documents.get(doc);
  if (!fonts) {
    fonts = new Map();
    documents.set(doc, fonts);
    const patch = (page: PDFPage) => {
      const draw = page.drawText.bind(page);
      const keys = new Map<PDFFont, PDFName>();
      page.drawText = (text, options) => {
        const composite = options?.font && documents.get(doc)!.get(options.font);
        if (!composite) return draw(text, options);
        const primary = composite.sources[0];
        if (!ARABIC.test(text) && [...text].every(ch => primary.supported.has(ch.codePointAt(0)!))) {
          return draw(text, { ...options, font: primary.pdf });
        }
        const size = options?.size ?? 12;
        const color = options?.color;
        page.pushOperators(pushGraphicsState(), PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
          PDFName.of('Span'), doc.context.obj({ ActualText: PDFHexString.fromText(text) }).toString(),
        ]));
        if (color?.type === 'RGB') page.pushOperators(setFillingRgbColor(color.red, color.green, color.blue));
        let x = options?.x ?? 0;
        const y = options?.y ?? 0;
        for (const { source, shaped } of composite.layout(text)) {
          const encoded = source.encode(shaped);
          let key = keys.get(source.pdf);
          if (!key) {
            key = page.node.newFontDictionary(source.pdf.name, source.pdf.ref);
            keys.set(source.pdf, key);
          }
          const scale = size / source.font.unitsPerEm;
          // Run boundaries keep extraction engines from applying their own
          // bidi algorithm across a Latin date and neighbouring Arabic words.
          page.pushOperators(beginMarkedContent('Span'), beginText(), setFontAndSize(key, size));
          shaped.positions.forEach((position, i) => {
            page.pushOperators(
              setTextMatrix(1, 0, 0, 1, x + position.xOffset * scale, y + position.yOffset * scale),
              showText(PDFHexString.of(encoded.slice(i * 4, i * 4 + 4))),
            );
            x += position.xAdvance * scale;
          });
          page.pushOperators(endText(), endMarkedContent());
        }
        page.pushOperators(endMarkedContent(), popGraphicsState());
      };
      return page;
    };
    for (const page of doc.getPages()) patch(page);
    const addPage = doc.addPage.bind(doc);
    doc.addPage = (...args) => patch(addPage(...args));
  }
  fonts.set(pdfFont, composite);
}

export async function embedComplexFonts(doc: PDFDocument, lng: string, content?: string) {
  // Production builders supply all rendered content. A plain Arabic report
  // must not download the two large CJK assets merely to prepare fallback.
  // Callers without content retain the complete mixed-script repertoire.
  const needsCjk = lng === 'zh' || content === undefined || /\p{Script=Han}/u.test(content);
  const needsArabic = lng === 'ar' || content === undefined || ARABIC.test(content);
  const selected: FontSource[] = [
    ...(needsCjk ? ['cjkRegular', 'cjkBold'] as const : []),
    ...(needsArabic ? ['arabicRegular', 'arabicBold'] as const : []),
    'latinRegular', 'latinBold',
  ];
  const modules = await Promise.all(selected.map(async name => ({ name, module: await complexFontSources[name]() })));
  const embedded = new Map<FontSource, SourceFont>();
  for (const { name, module } of modules) {
    let loaded = loadedFonts.get(name);
    if (!loaded) {
      const data = bytes(module.default);
      const font = fontkit.create(data);
      loaded = { data, font, supported: new Set(font.characterSet) };
      loadedFonts.set(name, loaded);
    }
    const { data, font, supported } = loaded;
    let encodingRun: GlyphRun | undefined;
    const facade = Object.create(font) as Font;
    facade.layout = text => encodingRun ?? bidiLayout(font, text);
    doc.registerFontkit({ create: () => facade });
    const pdf = await doc.embedFont(data, { subset: true });
    embedded.set(name, { font, pdf, supported, encode: run => {
      // The renderer already resolved the font and bidi direction. Pass those
      // exact glyphs to pdf-lib's subset encoder without a second shaping pass.
      encodingRun = run;
      try { return pdf.encodeText('').asString(); }
      finally { encodingRun = undefined; }
    } });
  }
  const composite = (weight: 'Regular' | 'Bold') => {
    const families = lng === 'ar' ? ['arabic', 'latin', 'cjk'] : ['cjk', 'latin', 'arabic'];
    const sources = families.flatMap(family => {
      const source = embedded.get(`${family}${weight}` as FontSource);
      return source ? [source] : [];
    });
    const font = Object.create(sources[0].pdf) as PDFFont;
    const layout = (text: string) => compositeLayout(sources, text);
    const supported = [...new Set(sources.flatMap(source => [...source.supported]))];
    font.getCharacterSet = () => supported;
    font.widthOfTextAtSize = (text, size) => layout(text).reduce((total, run) => total + run.shaped.positions.reduce((sum, position) => sum + position.xAdvance, 0) * size / run.source.font.unitsPerEm, 0);
    // Existing sanitizers probe encoding for individual characters. Page text
    // always passes through the document's composite renderer above.
    font.encodeText = text => PDFHexString.of(layout(text).map(run => run.source.encode(run.shaped)).join(''));
    installCompositeText(doc, font, { sources, layout });
    return font;
  };
  return { regular: composite('Regular'), bold: composite('Bold') };
}
