/**
 * Lightweight parser for the per-species tooth-diagram SVG. We need each
 * tooth as its own subpath (not the original collapsed `<path>`) so the
 * webapp can hover/click individual teeth. The parser splits the giant
 * combined `d=` attribute on `M` commands and asks the browser to compute
 * each subpath's bounding box via a temporary in-DOM `<path>`.
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
  subpaths: SvgSubpath[];
  outlineD: string;
}

const cache = new Map<string, ParsedDiagram>();

export async function loadParsedDiagram(url: string): Promise<ParsedDiagram> {
  const cached = cache.get(url);
  if (cached) return cached;

  const text = await fetch(url).then((r) => r.text());
  // Parse the SVG with DOMParser rather than a regex — a regex for the
  // `d=` attribute breaks if an earlier attribute value contains a `>`.
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const fullD = doc.querySelector('path')?.getAttribute('d');
  if (!fullD) throw new Error(`No path found in ${url}`);

  const subpathStrs = fullD
    .split(/(?=M\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /^M\s/.test(s));

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

  const result: ParsedDiagram = { subpaths, outlineD: fullD };
  cache.set(url, result);
  return result;
}
