import type { PDFFont } from 'pdf-lib';

/** Readable stand-ins for common characters the standard PDF fonts
 *  (WinAnsi) can't encode. */
const REPLACEMENTS: Record<string, string> = {
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>',
  '≤': '<=', '≥': '>=', '≠': '!=', '±': '+/-',
  '✓': 'v', '✔': 'v', '✕': 'x', '✗': 'x', '✘': 'x',
  '−': '-', '‒': '-', '―': '-',
  ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
};

/**
 * Make a standard font tolerate any text: characters it can't encode are
 * swapped for a readable equivalent or dropped, instead of throwing and
 * sinking the whole PDF (an emoji in a patient name used to fail the
 * preview). Patches the font instance's encodeText / widthOfTextAtSize,
 * so every drawText and measurement on it is covered.
 */
export function safeFont(font: PDFFont): PDFFont {
  const marked = font as PDFFont & { __safe?: boolean };
  if (marked.__safe) return font;
  const encode = font.encodeText.bind(font);
  const width = font.widthOfTextAtSize.bind(font);
  const cache = new Map<string, boolean>();
  const encodable = (ch: string) => {
    let ok = cache.get(ch);
    if (ok === undefined) {
      try { encode(ch); ok = true; } catch { ok = false; }
      cache.set(ch, ok);
    }
    return ok;
  };
  const clean = (text: string): string => {
    let out = '';
    for (const ch of text ?? '') {
      if (ch === '\n' || encodable(ch)) { out += ch; continue; }
      const sub = REPLACEMENTS[ch];
      if (sub !== undefined) {
        for (const c of sub) if (encodable(c)) out += c;
      }
    }
    return out;
  };
  font.encodeText = ((text: string) => encode(clean(text))) as PDFFont['encodeText'];
  font.widthOfTextAtSize = ((text: string, size: number) => width(clean(text), size)) as PDFFont['widthOfTextAtSize'];
  marked.__safe = true;
  return font;
}
