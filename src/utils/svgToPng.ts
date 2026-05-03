/**
 * Rasterize the dental diagram SVG to a PNG suitable for embedding in the PDF.
 *
 * The cloned SVG goes through these transforms before rasterization:
 *
 * 1. An inline `<style>` block is injected so the cloned SVG renders the
 *    same fills it does in the app (otherwise paths default to black fill
 *    when loaded standalone, blacking out every tooth).
 * 2. Comment cards (provided by the caller, since they live as plain HTML
 *    over the SVG in the app) are added as native SVG `<g>` blocks of
 *    `<rect>` + `<text>` so they make it into the PDF.
 * 3. The viewBox is preserved from the live SVG so anchored comments and
 *    drag-positioned comments end up in their original spots in the PNG.
 */

export interface CommentForExport {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  text: string;
}

export interface CommentColors {
  bg: string;
  border: string;
  labelColor: string;
  textColor: string;
}

const DEFAULT_COMMENT_COLORS: CommentColors = {
  bg: '#fffaf0',
  border: '#f6e05e',
  labelColor: '#744210',
  textColor: '#2d3748',
};

const COMMENT_FONT_SIZE = 18;
const COMMENT_LINE_HEIGHT = 22;
const COMMENT_PADDING = 8;
const COMMENT_LABEL_HEIGHT = 22;

function approxTextWidth(text: string, fontSize: number): number {
  // Rough average: ~0.55em per char for sans-serif. Good enough for wrapping.
  return text.length * fontSize * 0.55;
}

function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') { lines.push(''); continue; }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (approxTextWidth(candidate, fontSize) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function appendCommentSvg(svg: SVGSVGElement, c: CommentForExport, colors: CommentColors): void {
  const ns = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(ns, 'g');

  const rect = document.createElementNS(ns, 'rect');
  rect.setAttribute('x', String(c.x));
  rect.setAttribute('y', String(c.y));
  rect.setAttribute('width', String(c.w));
  rect.setAttribute('height', String(c.h));
  rect.setAttribute('rx', '6');
  rect.setAttribute('ry', '6');
  rect.setAttribute('fill', colors.bg);
  rect.setAttribute('stroke', colors.border);
  rect.setAttribute('stroke-width', '1');
  group.appendChild(rect);

  if (c.label) {
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(c.x + COMMENT_PADDING));
    label.setAttribute('y', String(c.y + COMMENT_PADDING + COMMENT_FONT_SIZE - 4));
    label.setAttribute('font-family', 'sans-serif');
    label.setAttribute('font-size', String(COMMENT_FONT_SIZE));
    label.setAttribute('font-weight', '600');
    label.setAttribute('fill', colors.labelColor);
    label.textContent = c.label;
    group.appendChild(label);
  }

  if (c.text) {
    const body = document.createElementNS(ns, 'text');
    body.setAttribute('x', String(c.x + COMMENT_PADDING));
    body.setAttribute(
      'y',
      String(c.y + COMMENT_PADDING + COMMENT_LABEL_HEIGHT + COMMENT_FONT_SIZE - 4)
    );
    body.setAttribute('font-family', 'sans-serif');
    body.setAttribute('font-size', String(COMMENT_FONT_SIZE));
    body.setAttribute('fill', colors.textColor);

    const wrapped = wrapText(c.text, c.w - COMMENT_PADDING * 2, COMMENT_FONT_SIZE);
    const maxLines = Math.max(
      0,
      Math.floor((c.h - COMMENT_PADDING * 2 - COMMENT_LABEL_HEIGHT) / COMMENT_LINE_HEIGHT)
    );
    wrapped.slice(0, maxLines).forEach((line, idx) => {
      const tspan = document.createElementNS(ns, 'tspan');
      tspan.setAttribute('x', String(c.x + COMMENT_PADDING));
      tspan.setAttribute('dy', idx === 0 ? '0' : String(COMMENT_LINE_HEIGHT));
      tspan.textContent = line;
      body.appendChild(tspan);
    });
    group.appendChild(body);
  }

  svg.appendChild(group);
}

const EMBEDDED_STYLES = `
  .tooth-diagram__outline { fill: #1a202c; stroke: none; }
  .tooth-group__missing-fill { fill: #1a202c; }
  .tooth-group__hover { fill: transparent; }
`;

export interface DiagramCropBounds {
  /** Y in diagram coordinates above which everything is decorative
   *  whitespace and should be cropped out. Defaults to 0 (no crop). */
  minY?: number;
  /** Y in diagram coordinates below which everything is decorative
   *  whitespace. Defaults to `diagramHeight` (no crop). */
  maxY?: number;
}

export async function diagramSvgToPng(
  svgEl: SVGSVGElement,
  diagramWidth: number,
  diagramHeight: number,
  comments: CommentForExport[] = [],
  outputScale = 2,
  commentColors: CommentColors = DEFAULT_COMMENT_COLORS,
  crop: DiagramCropBounds = {}
): Promise<Uint8Array> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // Inject styles so paths render with the same fills the live app applies via
  // an external stylesheet.
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = EMBEDDED_STYLES;
  clone.insertBefore(style, clone.firstChild);

  // Comments live outside the SVG in the app — append them as native SVG
  // groups here so the rasterized PNG carries them.
  for (const c of comments) {
    appendCommentSvg(clone, c, commentColors);
  }

  // The output viewBox is the diagram's content extent (optionally
  // tightened via the `crop` bounds — used to slice off decorative
  // whitespace above the maxilla / below the mandible) unioned with
  // any out-of-bounds comments. We intentionally don't trust
  // svgEl.getBBox() — when the diagram is in a hidden tab at export
  // time it can return partial bounds and the rasterized PNG ends up
  // missing the mandible.
  let minX = 0;
  let minY = crop.minY ?? 0;
  let maxX = diagramWidth;
  let maxY = crop.maxY ?? diagramHeight;
  for (const c of comments) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }
  const pad = 6;
  minX -= pad; minY -= pad;
  maxX += pad; maxY += pad;
  const vw = maxX - minX;
  const vh = maxY - minY;
  clone.setAttribute('viewBox', `${minX} ${minY} ${vw} ${vh}`);
  clone.setAttribute('width', String(vw));
  clone.setAttribute('height', String(vh));
  clone.style.background = 'white';

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (err) => reject(err);
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = vw * outputScale;
    canvas.height = vh * outputScale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Dynamic content-bbox crop. Scan for non-white pixels and tighten
    // the output PNG to that bounding box. This removes the blank
    // margins that come from the source SVG's declared width being
    // wider than the actual tooth content, AND auto-handles asymmetric
    // comment placement (left-only / right-only / both gutters).
    const cropped = cropToContentBBox(canvas, ctx, outputScale);

    const blob = await new Promise<Blob | null>((resolve) =>
      cropped.toBlob(resolve, 'image/png')
    );
    if (!blob) throw new Error('canvas.toBlob returned null');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/**
 * Crop a canvas to its non-white content bounding box (with small
 * padding). Returns a new canvas — leaves the input untouched.
 *
 * Threshold is intentionally generous (≥250 on every channel counts as
 * "blank") so faint anti-aliasing artifacts at the edges don't extend
 * the bbox by a pixel or two.
 */
function cropToContentBBox(
  src: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  outputScale: number
): HTMLCanvasElement {
  const { width: w, height: h } = src;
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const BLANK = 250;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2], a = px[i + 3];
      // Treat near-white opaque pixels as blank too — the canvas was
      // pre-filled white, so transparent corners read as white as well.
      if (a > 0 && (r < BLANK || g < BLANK || b < BLANK)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    // No content found — return the original.
    return src;
  }
  const pad = 8 * outputScale;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const octx = out.getContext('2d');
  if (!octx) return src;
  octx.fillStyle = 'white';
  octx.fillRect(0, 0, cw, ch);
  octx.drawImage(src, -minX, -minY);
  return out;
}
