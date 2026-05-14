/**
 * Lightweight parser for the per-species tooth-diagram SVG. We need each
 * tooth as its own subpath (not the original collapsed `<path>`) so the
 * webapp can hover/click individual teeth. The parser splits the giant
 * combined `d=` attribute on `M` commands and asks the browser to compute
 * each subpath's bounding box via a temporary in-DOM `<path>`.
 *
 * The SVG may have additional `<path>` elements after the first one —
 * these are treated as "hit shape" overrides: their subpaths are still
 * parsed so the per-tooth matcher can use them as outer outlines, but
 * `outlineD` only includes the first path so the visual rendering stays
 * exactly as the SVG draws it. That lets a user open the SVG in a
 * vector editor, draw a clean closed loop around an awkward tooth
 * (where the original outline path doesn't cleanly enclose it), and
 * have the app pick that up for hover/click without redrawing the
 * tooth visually.
 *
 * Results are cached per URL because the source SVGs never change at
 * runtime, and getBBox() is a layout-forcing call.
 */

export interface SvgSubpath {
  d: string;
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ParsedDiagram {
  /** All subpaths from all `<path>` elements, used by the per-tooth
   *  matcher. */
  subpaths: SvgSubpath[];
  /** d attribute for the visual outline render — only the first
   *  `<path>` element. Any extra paths in the SVG are treated as
   *  hit-detection overrides and not drawn here. */
  outlineD: string;
}

const cache = new Map<string, ParsedDiagram>();

export async function loadParsedDiagram(url: string): Promise<ParsedDiagram> {
  const cached = cache.get(url);
  if (cached) return cached;

  const text = await fetch(url).then((r) => r.text());
  // Capture every <path d="..."> in the file.
  const pathDs: string[] = [];
  const pathRe = /<path[^>]*\sd="([^"]+)"/g;
  let dm: RegExpExecArray | null;
  while ((dm = pathRe.exec(text)) !== null) pathDs.push(dm[1]);
  if (pathDs.length === 0) throw new Error(`No path found in ${url}`);

  // outlineD is only path 0 — keeps the visual rendering identical
  // even if the user adds hit-only paths in a vector editor.
  const outlineD = pathDs[0];

  // Subpaths come from every path. They're split on `M` (Move-To).
  // Vector editors emit uppercase M when starting a new subpath, so we
  // stick to that; lowercase `m` inside a path stays attached to its
  // current subpath as a relative move.
  const subpathStrs: string[] = [];
  for (const d of pathDs) {
    const parts = d
      .split(/(?=M\s)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /^M\s/.test(s));
    subpathStrs.push(...parts);
  }

  // Render each subpath into an off-screen SVG just long enough to ask
  // for getBBox(). Cleaner than implementing path-bbox math ourselves.
  const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tempSvg.style.position = 'absolute';
  tempSvg.style.visibility = 'hidden';
  tempSvg.style.width = '0';
  tempSvg.style.height = '0';
  document.body.appendChild(tempSvg);

  const subpaths: SvgSubpath[] = [];
  try {
    for (const d of subpathStrs) {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      tempSvg.appendChild(p);
      const bb = p.getBBox();
      subpaths.push({
        d,
        minX: bb.x,
        minY: bb.y,
        maxX: bb.x + bb.width,
        maxY: bb.y + bb.height,
        cx: bb.x + bb.width / 2,
        cy: bb.y + bb.height / 2,
      });
    }
  } finally {
    document.body.removeChild(tempSvg);
  }

  const result: ParsedDiagram = { subpaths, outlineD };
  cache.set(url, result);
  return result;
}
