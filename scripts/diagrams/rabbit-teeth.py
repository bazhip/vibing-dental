#!/usr/bin/env python3
"""Generate the rabbit occlusal schematic and exactly matching tooth hit paths.

Adult dental formula: 2 x (I 2/1, C 0/0, P 3/2, M 3/3) = 28.
Modified Triadan: upper 01,02,06-11; lower 01,07-11.
Reference: University of Edinburgh Veterinary Dentistry, Basics_print.pdf,
and the occlusal reference supplied with the feature request. Patient right
is viewer left; 102/202 are the small palatal peg incisors. Long interior
incisor lines represent reserve crowns schematically, not additional teeth.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
teeth = []
outlines = []


def path(points):
    # Absolute commands keep paths readable to the shared SVG parser.
    return ' '.join(str(v) for v in points)


def add(triadan, label, kind, cx, cy, rx, ry, contour):
    d = path(contour)
    teeth.append(dict(triadan=triadan, label=label, type=kind, cx=cx, cy=cy,
                      rx=rx, ry=ry, rotation=0, hitShape=dict(d=d, bbox=dict(
                          minX=cx-rx, minY=cy-ry, maxX=cx+rx, maxY=cy+ry))))
    outlines.append(d)


def incisor(q, lower=False, peg=False):
    # Palatal pegs sit behind, and are much smaller than, the main incisors.
    right = q in (1, 4)
    cx = 284 if right else 316
    cy = 914 if lower else (106 if peg else 78)
    rx, ry = (8, 6) if peg else (14, 11)
    # Rounded rectangular crowns with a slightly convex cutting edge.
    add(q*100+(2 if peg else 1), 'I2' if peg else 'I1', 'incisor', cx, cy, rx, ry,
        ['M',cx-rx,cy-ry+4,'Q',cx-rx,cy-ry,cx-6,cy-ry,
         'Q',cx,cy-ry+2,cx+6,cy-ry,'Q',cx+rx,cy-ry,cx+rx,cy-ry+4,
         'L',cx+rx,cy+ry-4,'Q',cx+rx,cy+ry,cx+5,cy+ry,
         'L',cx-5,cy+ry,'Q',cx-rx,cy+ry,cx-rx,cy+ry-4,'Z'])
    if not peg:
        # One central enamel groove on each major incisor crown.
        outlines.append(f'M {cx} {cy-ry+3} Q {cx-2 if right else cx+2} {cy} {cx} {cy+ry-2}')


for q in (1, 2):
    incisor(q)
    incisor(q, peg=True)
for q in (4, 3):
    incisor(q, lower=True)

for upper, right_q, left_q in [(True, 1, 2), (False, 4, 3)]:
    for i, pos in enumerate(range(6 if upper else 7, 12)):
        # Broad upper arcades and narrower mandibular cheek rows. Upper
        # rostral P2 tapers; caudal M3 is smaller than its neighbours.
        cy = 310+i*26 if upper else 698-i*26
        x = (216-i*2) if upper else (227-i*3)
        rx = (12 if i==0 else 17) if upper else 13
        ry = 10 if pos==11 else 11
        for q, cx, sign in [(right_q, x, 1), (left_q, 600-x, -1)]:
            label = f'P{pos-4}' if pos<9 else f'M{pos-8}'
            if upper and pos==6:
                contour=['M',cx,cy-ry,'Q',cx+7,cy-ry,cx+rx,cy+4,
                         'Q',cx+rx,cy+ry,cx,cy+ry,'Q',cx-rx,cy+ry,cx-rx,cy+4,
                         'Q',cx-7,cy-ry,cx,cy-ry,'Z']
            else:
                # Undulating buccal/lingual outline and transverse enamel
                # fold suggest the lophodont grinding surface.
                contour=['M',cx-rx+4,cy-ry,'Q',cx,cy-ry+3,cx+rx-4,cy-ry,
                         'Q',cx+rx,cy-ry,cx+rx,cy-4,'L',cx+rx-3,cy,
                         'L',cx+rx,cy+4,'Q',cx+rx,cy+ry,cx+rx-4,cy+ry,
                         'Q',cx,cy+ry-2,cx-rx+4,cy+ry,
                         'Q',cx-rx,cy+ry,cx-rx,cy+4,'L',cx-rx+3,cy,
                         'L',cx-rx,cy-4,'Q',cx-rx,cy-ry,cx-rx+4,cy-ry,'Z']
            add(q*100+pos,label,'premolar' if pos<9 else 'molar',cx,cy,rx,ry,contour)
            outlines.append(f'M {cx-rx+5} {cy+1} Q {cx-3} {cy-5} {cx+2} {cy+1} Q {cx+5} {cy+5} {cx+rx-5} {cy-1}')

# Sparse skeletal outlines: preserve the long diastema, palatal notch,
# and paired mandibular bodies from the supplied anatomical reference.
# All are open subpaths and cannot become an extra tooth selection target.
scaffold = [
    'M 272 90 C 266 166 245 234 225 281',
    'M 328 90 C 334 166 355 234 375 281',
    'M 264 123 C 251 204 195 261 180 331 C 168 385 169 428 178 463',
    'M 336 123 C 349 204 405 261 420 331 C 432 385 431 428 422 463',
    'M 198 330 C 191 385 192 429 201 462',
    'M 402 330 C 409 385 408 429 399 462',
    'M 226 447 C 231 460 237 471 245 476 L 257 445 C 272 424 272 405 280 390 C 286 378 294 386 300 395 C 306 386 314 378 320 390 C 328 405 328 424 343 445 L 355 476 C 363 471 369 460 374 447',
    'M 281 122 C 279 178 269 239 269 280 C 270 294 279 295 285 282 C 291 246 291 181 290 125',
    'M 319 122 C 321 178 331 239 331 280 C 330 294 321 295 315 282 C 309 246 309 181 310 125',
    'M 189 542 C 200 573 206 600 201 636 C 195 686 220 746 253 790 C 272 817 273 867 275 902',
    'M 411 542 C 400 573 394 600 399 636 C 405 686 380 746 347 790 C 328 817 327 867 325 902',
    'M 228 728 C 240 770 257 802 280 820 C 295 833 293 870 292 901',
    'M 372 728 C 360 770 343 802 320 820 C 305 833 307 870 308 901',
    'M 240 574 C 257 620 253 671 267 702 C 285 745 315 745 333 702 C 347 671 343 620 360 574',
    'M 279 925 Q 300 933 321 925',
]
full_d=' '.join(scaffold+outlines)
svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 1000">
  <!-- Generated by scripts/diagrams/rabbit-teeth.py; adult rabbit, 28 teeth. -->
  <path fill="none" stroke="#34434a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="{full_d}"/>
</svg>
'''
(ROOT/'public/diagrams/rabbit.svg').write_text(svg)
ts='''// Generated by scripts/diagrams/rabbit-teeth.py. Do not edit by hand.
import type { ToothShape } from './toothShapes';

export const RABBIT_TEETH: ToothShape[] = '''+'[\n'+''.join('  '+json.dumps(t, separators=(', ', ': '))+',\n' for t in sorted(teeth,key=lambda t:t['triadan']))+'];\n'
(ROOT/'src/constants/rabbitTeeth.ts').write_text(ts)
