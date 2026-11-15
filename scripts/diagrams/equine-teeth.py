"""Generate src/constants/equineTeeth.ts from public/diagrams/equine.svg.

equine.svg is the Adobe Stock equine dental chart (AdobeStock_100107071)
reduced to its black outline + teeth layers (labels, numbers, leader
lines, legend and colour fills removed), merged into one absolute
M/C/L/Z path scaled 2x — the format parseSvg.ts reads.

Several tooth outlines in that artwork are open (split in halves, or
borrowing an edge from the neighbouring tooth), which the subpath
auto-matcher in ToothDiagram can't use as a fill/hit area. This script
joins each tooth's outer outline pieces into one closed hitShape.

    python3 scripts/diagrams/equine-teeth.py
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SVG = ROOT / 'public/diagrams/equine.svg'
OUT = ROOT / 'src/constants/equineTeeth.ts'
AXIS = 241.35  # left/right mirror axis of the drawing

# Approximate centres of the patient's right-side teeth (1xx upper, 4xx
# lower); the left side mirrors them. Only used to assign outline pieces.
RIGHT = {
    101: (217.8, 43), 102: (175.7, 46), 103: (150.0, 74), 104: (165.0, 181),
    105: (157.3, 305), 106: (128.6, 356), 107: (118.9, 412), 108: (116.5, 461),
    109: (116.2, 504), 110: (112.0, 549), 111: (106.6, 594),
    411: (109.8, 674), 410: (115.9, 721), 409: (120.0, 767), 408: (135.2, 811),
    407: (154.8, 856), 406: (169.3, 902), 405: (184.4, 946), 404: (177.8, 1130),
    403: (175.7, 1188), 402: (191.4, 1222), 401: (223.5, 1232),
}
LABELS = {1: ('I1', 'incisor'), 2: ('I2', 'incisor'), 3: ('I3', 'incisor'),
          4: ('C', 'canine'), 5: ('P1', 'premolar'), 6: ('P2', 'premolar'),
          7: ('P3', 'premolar'), 8: ('P4', 'premolar'), 9: ('M1', 'molar'),
          10: ('M2', 'molar'), 11: ('M3', 'molar')}

def anchors():
    a = dict(RIGHT)
    for t, (x, y) in RIGHT.items():
        q = t // 100
        a[(2 if q == 1 else 3) * 100 + t % 100] = (2 * AXIS - x, y)
    return a

def parse(d):
    out = []
    for s in re.split(r'(?=M )', d):
        s = s.strip()
        if not s:
            continue
        closed = s.endswith('Z')
        toks = re.findall(r'[MCLZ]|-?\d+(?:\.\d+)?', s)
        i, segs, start = 0, [], None
        while i < len(toks):
            c = toks[i]; i += 1
            if c == 'Z':
                continue
            n = {'M': 2, 'L': 2, 'C': 6}[c]
            v = [float(x) for x in toks[i:i + n]]; i += n
            while i < len(toks) and toks[i] not in 'MCLZ':
                # implicit repeat of the same command
                segs.append((c if c != 'M' else 'L', v)) if start else None
                v = [float(x) for x in toks[i:i + n]]; i += n
            if c == 'M':
                start = (v[0], v[1])
            else:
                segs.append((c, v))
        pts = [start] + [(v[k], v[k + 1]) for _, v in segs for k in range(0, len(v), 2)]
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        out.append(dict(start=start, segs=segs, closed=closed,
                        box=(min(xs), min(ys), max(xs), max(ys))))
    return out

def end(f):
    return (f['segs'][-1][1][-2], f['segs'][-1][1][-1])

def reverse(f):
    pts = [f['start']]
    for _, v in f['segs']:
        pts.append((v[-2], v[-1]))
    segs = []
    for k in range(len(f['segs']) - 1, -1, -1):
        c, v = f['segs'][k]
        p0 = pts[k]
        if c == 'C':
            segs.append(('C', [v[2], v[3], v[0], v[1], p0[0], p0[1]]))
        else:
            segs.append(('L', [p0[0], p0[1]]))
    return dict(f, start=pts[-1], segs=segs)

def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5

def contained(box, boxes, m=1.5):
    if not boxes:
        return False
    u = (min(b[0] for b in boxes), min(b[1] for b in boxes),
         max(b[2] for b in boxes), max(b[3] for b in boxes))
    return box[0] >= u[0] - m and box[1] >= u[1] - m and box[2] <= u[2] + m and box[3] <= u[3] + m

def size(f):
    b = f['box']; return max(b[2] - b[0], b[3] - b[1])

def fmt(n):
    return f'{n:.2f}'.rstrip('0').rstrip('.')

def build():
    d = re.search(r' d="([^"]+)"', SVG.read_text()).group(1)
    frags = parse(d)
    anc = anchors()
    groups = {t: [] for t in anc}
    for f in frags:
        if size(f) > 90:
            continue  # jaw / palate lines
        b = f['box']; c = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
        t, dd = min(((t, dist(c, p)) for t, p in anc.items()), key=lambda x: x[1])
        if dd <= 45:
            groups[t].append(f)
    teeth = []
    for t in sorted(anc, key=lambda t: (t // 100 in (1, 2), t)):
        fs = [f for f in groups[t] if size(f) >= 5]
        outer = [f for f in fs if not contained(f['box'], [g['box'] for g in fs if g is not f])]
        if not outer:
            sys.exit(f'no outline for {t}')
        # Closed outline wins outright; otherwise chain the open pieces.
        closed = [f for f in outer if f['closed']]
        if closed:
            chain = [max(closed, key=size)]
        else:
            rest = sorted(outer, key=size, reverse=True)
            chain = [rest.pop(0)]
            while rest:
                cur = end(chain[-1])
                best = min(rest, key=lambda f: min(dist(cur, f['start']), dist(cur, end(f))))
                rest.remove(best)
                chain.append(best if dist(cur, best['start']) <= dist(cur, end(best)) else reverse(best))
        parts = []
        for k, f in enumerate(chain):
            parts.append(('M ' if k == 0 else 'L ') + f'{fmt(f["start"][0])} {fmt(f["start"][1])}')
            for c, v in f['segs']:
                parts.append(c + ' ' + ' '.join(fmt(x) for x in v))
        parts.append('Z')
        xs = [x for f in chain for x in [f['box'][0], f['box'][2]]]
        ys = [y for f in chain for y in [f['box'][1], f['box'][3]]]
        box = (min(xs), min(ys), max(xs), max(ys))
        label, kind = LABELS[t % 100]
        teeth.append((t, label, kind, box, ' '.join(parts), len(chain)))
    return teeth

def main():
    teeth = build()
    lines = [
        '// Generated by scripts/diagrams/equine-teeth.py from public/diagrams/equine.svg.',
        '// Do not edit by hand; rerun the script.',
        "import type { ToothShape } from './toothShapes';",
        '',
        'export const EQUINE_TEETH: ToothShape[] = [',
    ]
    for t, label, kind, b, d, n in teeth:
        cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        rx, ry = (b[2] - b[0]) / 2, (b[3] - b[1]) / 2
        lines.append(
            f"  {{ triadan: {t}, label: '{label}', type: '{kind}', cx: {fmt(cx)}, cy: {fmt(cy)}, "
            f"rx: {fmt(rx)}, ry: {fmt(ry)}, rotation: 0, hitShape: {{ d: '{d}', "
            f"bbox: {{ minX: {fmt(b[0])}, minY: {fmt(b[1])}, maxX: {fmt(b[2])}, maxY: {fmt(b[3])} }} }} }},")
        print(f'{t}: {n} piece(s) box=({b[0]:.0f},{b[1]:.0f})-({b[2]:.0f},{b[3]:.0f})', file=sys.stderr)
    lines.append('];')
    OUT.write_text('\n'.join(lines) + '\n')

if __name__ == '__main__':
    main()
