import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { deflateRawSync } from 'node:zlib';
import { parseDicom } from 'dicom-parser';
import {
  decodeDicom,
  decodeDicomPixels,
  firstEncapsulatedFrame,
  grayscaleToRgba,
  pixelsToRgba,
  rgbToRgba,
  windowToRgba,
  ybr422ToRgba,
  ybrFullToRgba,
  DicomError,
} from './dicom';
import type { DicomPixels } from './dicom';
import { decodeRle } from './dicomCodecs/rle';
import { hasDicomMagic, looksLikeDicomName } from './dicomSniff';

// The WASM codecs locate their .wasm through a Vite `?url` import, which in
// the browser is a URL to fetch. Under Node, emscripten reads the file from
// disk, so point those imports at the real files.
const require = createRequire(import.meta.url);
vi.mock('@cornerstonejs/codec-charls/decodewasm?url', () => ({
  default: require.resolve('@cornerstonejs/codec-charls/decodewasm'),
}));
vi.mock('@cornerstonejs/codec-openjpeg/decodewasm?url', () => ({
  default: require.resolve('@cornerstonejs/codec-openjpeg/decodewasm'),
}));

// --- Minimal Part 10 writer (explicit VR little endian) for tests -------

type El = { tag: [number, number]; vr: string; value: Uint8Array; raw?: Uint8Array };

const enc = new TextEncoder();
function str(tag: [number, number], vr: string, s: string): El {
  const padded = s.length % 2 ? s + (vr === 'UI' ? '\0' : ' ') : s;
  return { tag, vr, value: enc.encode(padded) };
}
function us(tag: [number, number], v: number, littleEndian = true): El {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, littleEndian);
  return { tag, vr: 'US', value: b };
}
function ob(tag: [number, number], vr: string, value: Uint8Array): El {
  return { tag, vr, value };
}

function element(e: El, littleEndian = true): Uint8Array {
  if (e.raw) return e.raw;
  const long = ['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].includes(e.vr);
  const head = new Uint8Array(long ? 12 : 8);
  const dv = new DataView(head.buffer);
  dv.setUint16(0, e.tag[0], littleEndian);
  dv.setUint16(2, e.tag[1], littleEndian);
  head[4] = e.vr.charCodeAt(0);
  head[5] = e.vr.charCodeAt(1);
  if (long) dv.setUint32(8, e.value.length, littleEndian);
  else dv.setUint16(6, e.value.length, littleEndian);
  return concat([head, e.value]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function part10(ts: string, body: El[]): Uint8Array {
  const preamble = new Uint8Array(128);
  const magic = enc.encode('DICM');
  const meta = element(str([0x0002, 0x0010], 'UI', ts));
  const groupLen = new Uint8Array(4);
  new DataView(groupLen.buffer).setUint32(0, meta.length, true);
  const metaLen = element(ob([0x0002, 0x0000], 'UL', groupLen));
  const littleEndian = ts !== '1.2.840.10008.1.2.2';
  return concat([preamble, magic, metaLen, meta, ...body.map((e) => element(e, littleEndian))]);
}

function u16(values: number[], littleEndian = true): Uint8Array {
  const b = new Uint8Array(values.length * 2);
  const dv = new DataView(b.buffer);
  values.forEach((v, i) => dv.setUint16(i * 2, v & 0xffff, littleEndian));
  return b;
}

const gray = (rgba: Uint8ClampedArray) => Array.from(rgba).filter((_, i) => i % 4 === 0);

// --- Tests ---------------------------------------------------------------

describe('sniffing', () => {
  it('recognises the DICM magic after the preamble', () => {
    expect(hasDicomMagic(part10('1.2.840.10008.1.2.1', []))).toBe(true);
    expect(hasDicomMagic(new Uint8Array(200))).toBe(false);
    expect(hasDicomMagic(new Uint8Array(10))).toBe(false);
  });

  it('recognises DICOM by extension or MIME', () => {
    expect(looksLikeDicomName({ name: 'IMG0001.DCM', type: '' })).toBe(true);
    expect(looksLikeDicomName({ name: 'scan.dicom', type: '' })).toBe(true);
    expect(looksLikeDicomName({ name: 'scan', type: 'application/dicom' })).toBe(true);
    expect(looksLikeDicomName({ name: 'photo.jpg', type: 'image/jpeg' })).toBe(false);
  });
});

describe('grayscaleToRgba', () => {
  const base = {
    width: 4,
    height: 1,
    bitsAllocated: 16 as const,
    bitsStored: 12,
    signed: false,
    bigEndian: false,
    slope: 1,
    intercept: 0,
    invert: false,
  };

  it('stretches the full range when the file has no window', () => {
    const out = grayscaleToRgba(base, u16([0, 1365, 2730, 4095]));
    expect(gray(out)).toEqual([0, 85, 170, 255]);
    expect(out[3]).toBe(255); // opaque
  });

  it('applies the file window (center/width), clamping outside it', () => {
    const out = grayscaleToRgba({ ...base, windowCenter: 2048, windowWidth: 1000 }, u16([0, 1548, 2048, 4095]));
    const g = gray(out);
    expect(g[0]).toBe(0);
    expect(g[1]).toBeLessThanOrEqual(1);
    expect(g[2]).toBeGreaterThan(125);
    expect(g[2]).toBeLessThan(130);
    expect(g[3]).toBe(255);
  });

  it('inverts MONOCHROME1', () => {
    const out = grayscaleToRgba({ ...base, invert: true }, u16([0, 4095, 0, 4095]));
    expect(gray(out)).toEqual([255, 0, 255, 0]);
  });

  it('masks bits above BitsStored', () => {
    // High nibble is overlay junk; only the low 12 bits are the pixel.
    const out = grayscaleToRgba(base, u16([0xf000, 0xf000 | 4095, 0, 4095]));
    expect(gray(out)).toEqual([0, 255, 0, 255]);
  });

  it('sign-extends signed pixels and applies rescale', () => {
    const out = grayscaleToRgba(
      { ...base, bitsStored: 16, signed: true, slope: 1, intercept: 1000 },
      u16([-1000, 0, 1000, 3000])
    );
    // values 0, 1000, 2000, 4000 → evenly spaced endpoints
    const g = gray(out);
    expect(g[0]).toBe(0);
    expect(g[3]).toBe(255);
    expect(g[1]).toBeLessThan(g[2]);
  });

  it('reads 8-bit pixels', () => {
    const out = grayscaleToRgba({ ...base, bitsAllocated: 8, bitsStored: 8 }, new Uint8Array([0, 255, 0, 255]));
    expect(gray(out)).toEqual([0, 255, 0, 255]);
  });

  it('rejects truncated pixel data', () => {
    expect(() => grayscaleToRgba(base, new Uint8Array(3))).toThrow(DicomError);
  });
});

describe('rgbToRgba', () => {
  it('handles interleaved and planar layouts', () => {
    expect(Array.from(rgbToRgba(2, 1, false, new Uint8Array([1, 2, 3, 4, 5, 6])))).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
    expect(Array.from(rgbToRgba(2, 1, true, new Uint8Array([1, 4, 2, 5, 3, 6])))).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });
});

describe('decodeDicom', () => {
  const imageTags = (le = true) => [
    us([0x0028, 0x0002], 1, le),
    str([0x0028, 0x0004], 'CS', 'MONOCHROME2'),
    us([0x0028, 0x0010], 1, le), // rows
    us([0x0028, 0x0011], 4, le), // columns
    us([0x0028, 0x0100], 16, le),
    us([0x0028, 0x0101], 12, le),
    us([0x0028, 0x0103], 0, le),
  ];

  it('decodes an uncompressed 16-bit radiograph (explicit LE)', () => {
    const file = part10('1.2.840.10008.1.2.1', [
      ...imageTags(),
      ob([0x7fe0, 0x0010], 'OW', u16([0, 1365, 2730, 4095])),
    ]);
    const out = decodeDicom(file);
    expect(out.kind).toBe('rgba');
    if (out.kind !== 'rgba') return;
    expect([out.width, out.height]).toEqual([4, 1]);
    expect(gray(out.rgba)).toEqual([0, 85, 170, 255]);
  });

  it('decodes explicit big endian', () => {
    const file = part10('1.2.840.10008.1.2.2', [
      ...imageTags(false),
      ob([0x7fe0, 0x0010], 'OW', u16([0, 1365, 2730, 4095], false)),
    ]);
    const out = decodeDicom(file);
    if (out.kind !== 'rgba') throw new Error('expected rgba');
    expect(gray(out.rgba)).toEqual([0, 85, 170, 255]);
  });

  it('uses the window from the file', () => {
    const file = part10('1.2.840.10008.1.2.1', [
      ...imageTags(),
      str([0x0028, 0x1050], 'DS', '100\\200'),
      str([0x0028, 0x1051], 'DS', '2\\50'),
      ob([0x7fe0, 0x0010], 'OW', u16([0, 99, 101, 4095])),
    ]);
    const out = decodeDicom(file);
    if (out.kind !== 'rgba') throw new Error('expected rgba');
    expect(gray(out.rgba)).toEqual([0, 0, 255, 255]);
  });

  it('refuses compressed transfer syntaxes it cannot render', () => {
    const file = part10('1.2.840.10008.1.2.4.90', [
      ...imageTags(),
      ob([0x7fe0, 0x0010], 'OW', u16([0, 0, 0, 0])),
    ]);
    expect(() => decodeDicom(file)).toThrow(/compression format/);
  });

  it('refuses a file with no image', () => {
    expect(() => decodeDicom(part10('1.2.840.10008.1.2.1', imageTags()))).toThrow(/no image/);
  });

  it('refuses files that are not DICOM', () => {
    expect(() => decodeDicom(new Uint8Array(300))).toThrow(DicomError);
  });

  it('refuses truncated pixel data', () => {
    const file = part10('1.2.840.10008.1.2.1', [
      ...imageTags(),
      ob([0x7fe0, 0x0010], 'OW', u16([0, 1])),
    ]);
    expect(() => decodeDicom(file)).toThrow(DicomError);
  });
});

// --- Compressed transfer syntaxes ---------------------------------------

const TS_RLE = '1.2.840.10008.1.2.5';

function u32(v: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v, true);
  return b;
}

/** Encapsulated Pixel Data: a basic offset table item, one item per
 *  fragment, then the sequence delimiter. */
function encapsulated(fragments: Uint8Array[], offsets: number[] = []): El {
  const item = (data: Uint8Array) => {
    const padded = data.length % 2 ? concat([data, new Uint8Array(1)]) : data;
    const head = new Uint8Array(8);
    const dv = new DataView(head.buffer);
    dv.setUint16(0, 0xfffe, true);
    dv.setUint16(2, 0xe000, true);
    dv.setUint32(4, padded.length, true);
    return concat([head, padded]);
  };
  const head = new Uint8Array(12);
  const dv = new DataView(head.buffer);
  dv.setUint16(0, 0x7fe0, true);
  dv.setUint16(2, 0x0010, true);
  head[4] = 0x4f; // O
  head[5] = 0x42; // B
  dv.setUint32(8, 0xffffffff, true);
  const delimiter = new Uint8Array(8);
  new DataView(delimiter.buffer).setUint16(0, 0xfffe, true);
  new DataView(delimiter.buffer).setUint16(2, 0xe0dd, true);
  const bot = concat(offsets.map(u32));
  return { tag: [0x7fe0, 0x0010], vr: 'OB', value: new Uint8Array(), raw: concat([head, item(bot), ...fragments.map(item), delimiter]) };
}

/** PackBits (PS3.5 G.3.1): replicate runs of 2+, literals otherwise. */
function packBits(bytes: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    let run = 1;
    while (i + run < bytes.length && bytes[i + run] === bytes[i] && run < 128) run++;
    if (run >= 2) {
      out.push(257 - run, bytes[i]);
      i += run;
      continue;
    }
    const literal: number[] = [];
    while (i < bytes.length && literal.length < 128 && !(i + 1 < bytes.length && bytes[i] === bytes[i + 1])) {
      literal.push(bytes[i++]);
    }
    out.push(literal.length - 1, ...literal);
  }
  return out;
}

/** An RLE frame from already-encoded segments. */
function rleFrame(segments: number[][]): Uint8Array {
  const header = new Uint8Array(64);
  const dv = new DataView(header.buffer);
  dv.setUint32(0, segments.length, true);
  let offset = 64;
  const bodies = segments.map((s, i) => {
    dv.setUint32(4 + i * 4, offset, true);
    const body = new Uint8Array(s.length + (s.length % 2));
    body.set(s);
    offset += body.length;
    return body;
  });
  return concat([header, ...bodies]);
}

/** RLE-encode 16-bit samples: high-byte segment, then low-byte segment. */
function rle16(values: number[]): Uint8Array {
  return rleFrame([packBits(values.map((v) => (v >> 8) & 0xff)), packBits(values.map((v) => v & 0xff))]);
}

const grayTags = (columns: number, rows: number, bits: 8 | 16, stored: number = bits, extra: El[] = []) => [
  us([0x0028, 0x0002], 1),
  str([0x0028, 0x0004], 'CS', 'MONOCHROME2'),
  us([0x0028, 0x0010], rows),
  us([0x0028, 0x0011], columns),
  us([0x0028, 0x0100], bits),
  us([0x0028, 0x0101], stored),
  us([0x0028, 0x0103], 0),
  ...extra,
];

const colorTags = (columns: number, rows: number, photometric: string, planar = 0) => [
  us([0x0028, 0x0002], 3),
  str([0x0028, 0x0004], 'CS', photometric),
  us([0x0028, 0x0006], planar),
  us([0x0028, 0x0010], rows),
  us([0x0028, 0x0011], columns),
  us([0x0028, 0x0100], 8),
  us([0x0028, 0x0101], 8),
  us([0x0028, 0x0103], 0),
];

function grayValues(px: DicomPixels): number[] {
  if (px.kind !== 'gray') throw new Error('expected gray');
  return Array.from(px.values);
}

function rgbOf(px: DicomPixels): number[] {
  if (px.kind !== 'rgba') throw new Error('expected rgba');
  return Array.from(px.rgba).filter((_, i) => i % 4 !== 3);
}

describe('windowToRgba', () => {
  it('maps the window linearly and clamps outside it', () => {
    // center 100, width 101 → lo = 49.5, hi = 149.5
    const out = gray(windowToRgba([0, 49.5, 50, 99.5, 100, 149.5, 150, 1e6], 8, 1, 100, 101, false));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
    expect(out[2]).toBe(1); // (50 - 99.5) / 100 + 0.5 = 0.005 → 1.275
    expect(out[3]).toBe(128); // 0.5 → 127.5
    expect(out[5]).toBe(255);
    expect(out[6]).toBe(255);
    expect(out[7]).toBe(255);
  });

  it('treats width 1 as a threshold at the center', () => {
    // PS3.3 C.11.2.1.2: x <= c - 0.5 → 0, otherwise full scale.
    expect(gray(windowToRgba([9, 10, 11], 3, 1, 10, 1, false))).toEqual([0, 255, 255]);
    expect(gray(windowToRgba([9, 9.5, 10], 3, 1, 10, 0, false))).toEqual([0, 0, 255]);
  });

  it('inverts and writes opaque gray pixels', () => {
    const out = windowToRgba([0, 255], 2, 1, 128, 256, true);
    expect(Array.from(out)).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });

  it('agrees with grayscaleToRgba at the default window', () => {
    const values = [0, 1365, 2730, 4095];
    expect(gray(windowToRgba(values, 4, 1, (0 + 4095 + 1) / 2, 4096, false))).toEqual([0, 85, 170, 255]);
  });
});

describe('colour conversion', () => {
  it('converts YBR_FULL (interleaved and planar)', () => {
    // Pure gray, then red: Y 76, Cb 85, Cr 255.
    const inter = ybrFullToRgba(2, 1, false, new Uint8Array([128, 128, 128, 76, 85, 255]));
    expect(Array.from(inter.slice(0, 4))).toEqual([128, 128, 128, 255]);
    expect(inter[4]).toBeGreaterThan(250);
    expect(inter[5]).toBeLessThan(5);
    expect(inter[6]).toBeLessThan(5);
    const planar = ybrFullToRgba(2, 1, true, new Uint8Array([128, 76, 128, 85, 128, 255]));
    expect(Array.from(planar)).toEqual(Array.from(inter));
  });

  it('converts uncompressed YBR_FULL_422 (Y Y Cb Cr)', () => {
    const out = ybr422ToRgba(3, 1, new Uint8Array([10, 20, 128, 128, 30, 0, 128, 128]));
    expect(gray(out)).toEqual([10, 20, 30]);
    expect(Array.from(out.slice(4, 8))).toEqual([20, 20, 20, 255]);
  });
});

describe('decodeRle', () => {
  it('decodes a hand-encoded 8-bit segment (replicate and literal runs)', () => {
    // 0xFE: repeat the next byte 3 times; 0x01: copy the next 2 bytes.
    const frame = rleFrame([[0xfe, 5, 0x01, 1, 2]]);
    expect(Array.from(decodeRle(frame, 5, 1, 1, 1)!)).toEqual([5, 5, 5, 1, 2]);
  });

  it('decodes 16-bit samples from high- and low-byte segments', () => {
    const frame = rleFrame([
      [0xff, 0x01, 0x00, 0xff], // MSBs 01 01 ff
      [0xff, 0x02, 0x00, 0xff], // LSBs 02 02 ff
    ]);
    const out = decodeRle(frame, 3, 1, 1, 2)!;
    expect(Array.from(new Uint16Array(out.buffer))).toEqual([0x0102, 0x0102, 0xffff]);
  });

  it('round-trips longer runs through PackBits', () => {
    const values = [...Array(300).fill(7), ...Array.from({ length: 200 }, (_, i) => (i * 37) & 0xff)];
    expect(Array.from(decodeRle(rleFrame([packBits(values)]), 500, 1, 1, 1)!)).toEqual(values);
  });

  it('returns planes for colour and skips no-op headers', () => {
    const frame = rleFrame([[0x80, 0x00, 1], [0x00, 2], [0x00, 3]]);
    expect(Array.from(decodeRle(frame, 1, 1, 3, 1)!)).toEqual([1, 2, 3]);
  });

  it('rejects a header that does not match the image', () => {
    expect(decodeRle(rleFrame([[0x00, 1]]), 1, 1, 1, 2)).toBeNull();
    expect(decodeRle(new Uint8Array(10), 1, 1, 1, 1)).toBeNull();
  });
});

describe('firstEncapsulatedFrame', () => {
  const parse = (fragments: Uint8Array[], offsets: number[] = [], frames = 1) => {
    const ds = parseDicom(
      part10(TS_RLE, [
        ...grayTags(1, 1, 8),
        ...(frames > 1 ? [str([0x0028, 0x0008], 'IS', String(frames))] : []),
        encapsulated(fragments, offsets),
      ])
    );
    return { ds, pixel: ds.elements.x7fe00010 };
  };
  const a = new Uint8Array([1, 2, 3, 4]);
  const b = new Uint8Array([5, 6]);
  const c = new Uint8Array([7, 8]);

  it('joins every fragment of a single-frame image', () => {
    const { ds, pixel } = parse([a, b]);
    expect(Array.from(firstEncapsulatedFrame(ds, pixel, 1))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('follows the basic offset table', () => {
    // Frame 0 = a + b (12 + 10 bytes of items), frame 1 = c.
    const { ds, pixel } = parse([a, b, c], [0, 22], 2);
    expect(Array.from(firstEncapsulatedFrame(ds, pixel, 2))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('takes one fragment per frame without a table', () => {
    const { ds, pixel } = parse([a, b], [], 2);
    expect(Array.from(firstEncapsulatedFrame(ds, pixel, 2))).toEqual([1, 2, 3, 4]);
    const rle = parse([a, b, c], [], 2);
    expect(Array.from(firstEncapsulatedFrame(rle.ds, rle.pixel, 2, true))).toEqual([1, 2, 3, 4]);
  });

  it('splits JPEG fragments at end-of-image markers', () => {
    const j1 = new Uint8Array([0xff, 0xd8, 1, 2]);
    const j2 = new Uint8Array([3, 4, 0xff, 0xd9]);
    const j3 = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const { ds, pixel } = parse([j1, j2, j3], [], 2);
    expect(Array.from(firstEncapsulatedFrame(ds, pixel, 2))).toEqual([0xff, 0xd8, 1, 2, 3, 4, 0xff, 0xd9]);
  });
});

describe('decodeDicomPixels', () => {
  it('returns modality values and the file window for uncompressed data', async () => {
    const file = part10('1.2.840.10008.1.2.1', [
      ...grayTags(4, 1, 16, 12, [
        str([0x0028, 0x1050], 'DS', '100'),
        str([0x0028, 0x1051], 'DS', '50'),
        str([0x0028, 0x1052], 'DS', '-10'),
        str([0x0028, 0x1053], 'DS', '2'),
      ]),
      ob([0x7fe0, 0x0010], 'OW', u16([0, 1, 2, 4095])),
    ]);
    const px = await decodeDicomPixels(file);
    expect(px).toMatchObject({ kind: 'gray', width: 4, height: 1, min: -10, max: 8180, windowCenter: 100, windowWidth: 50, invert: false });
    expect(grayValues(px)).toEqual([-10, -8, -6, 8180]);
  });

  it('matches decodeDicom for uncompressed data at the default window', async () => {
    const file = part10('1.2.840.10008.1.2.1', [...grayTags(4, 1, 16, 12), ob([0x7fe0, 0x0010], 'OW', u16([0, 1365, 2730, 4095]))]);
    const sync = decodeDicom(file);
    if (sync.kind !== 'rgba') throw new Error('expected rgba');
    expect(Array.from(pixelsToRgba(await decodeDicomPixels(file)))).toEqual(Array.from(sync.rgba));
  });

  it('drops an unusable window', async () => {
    const file = part10('1.2.840.10008.1.2.1', [
      ...grayTags(2, 1, 8, 8, [str([0x0028, 0x1050], 'DS', '100'), str([0x0028, 0x1051], 'DS', '0')]),
      ob([0x7fe0, 0x0010], 'OB', new Uint8Array([0, 255])),
    ]);
    const px = await decodeDicomPixels(file);
    expect(px.kind === 'gray' && px.windowWidth).toBe(undefined);
  });

  it('decodes RLE Lossless (16-bit, MONOCHROME1)', async () => {
    const values = [0, 0, 0, 4095, 4095, 100, 200, 300];
    const file = part10(TS_RLE, [
      us([0x0028, 0x0002], 1),
      str([0x0028, 0x0004], 'CS', 'MONOCHROME1'),
      us([0x0028, 0x0010], 2),
      us([0x0028, 0x0011], 4),
      us([0x0028, 0x0100], 16),
      us([0x0028, 0x0101], 12),
      us([0x0028, 0x0103], 0),
      encapsulated([rle16(values)]),
    ]);
    const px = await decodeDicomPixels(file);
    expect(grayValues(px)).toEqual(values);
    expect(px.kind === 'gray' && px.invert).toBe(true);
    // decodeDicom (sync) still refuses it.
    expect(() => decodeDicom(file)).toThrow(DicomError);
  });

  it('decodes signed 16-bit RLE', async () => {
    const values = [-1000, 0, 1000, 3000];
    const file = part10(TS_RLE, [
      ...grayTags(4, 1, 16, 16).map((e) => (e.tag[1] === 0x0103 ? us([0x0028, 0x0103], 1) : e)),
      encapsulated([rle16(values.map((v) => v & 0xffff))]),
    ]);
    expect(grayValues(await decodeDicomPixels(file))).toEqual(values);
  });

  it('decodes the first frame of multi-frame 8-bit RLE', async () => {
    const file = part10(TS_RLE, [
      ...grayTags(3, 1, 8, 8, [str([0x0028, 0x0008], 'IS', '2')]),
      encapsulated([rleFrame([packBits([1, 2, 3])]), rleFrame([packBits([9, 9, 9])])]),
    ]);
    expect(grayValues(await decodeDicomPixels(file))).toEqual([1, 2, 3]);
  });

  it('decodes RLE colour (RGB planes and YBR_FULL)', async () => {
    const rgb = part10(TS_RLE, [...colorTags(2, 1, 'RGB'), encapsulated([rleFrame([packBits([255, 0]), packBits([0, 255]), packBits([0, 0])])])]);
    expect(rgbOf(await decodeDicomPixels(rgb))).toEqual([255, 0, 0, 0, 255, 0]);
    const ybr = part10(TS_RLE, [...colorTags(1, 1, 'YBR_FULL'), encapsulated([rleFrame([[0, 90], [0, 128], [0, 128]])])]);
    expect(rgbOf(await decodeDicomPixels(ybr))).toEqual([90, 90, 90]);
  });

  it('decodes uncompressed YBR_FULL_422', async () => {
    const file = part10('1.2.840.10008.1.2.1', [...colorTags(2, 1, 'YBR_FULL_422'), ob([0x7fe0, 0x0010], 'OB', new Uint8Array([10, 20, 128, 128]))]);
    expect(rgbOf(await decodeDicomPixels(file))).toEqual([10, 10, 10, 20, 20, 20]);
  });

  it('decodes Deflated Explicit VR Little Endian', async () => {
    const body = concat([...grayTags(4, 1, 16, 12), ob([0x7fe0, 0x0010], 'OW', u16([0, 1, 2, 3]))].map((e) => element(e)));
    const head = part10('1.2.840.10008.1.2.1.99', []);
    const file = concat([head, new Uint8Array(deflateRawSync(body))]);
    expect(grayValues(await decodeDicomPixels(file))).toEqual([0, 1, 2, 3]);
  });

  it('rejects a damaged deflated body', async () => {
    const file = concat([part10('1.2.840.10008.1.2.1.99', []), new Uint8Array([0xff, 0xff, 0xff, 0xff])]);
    await expect(decodeDicomPixels(file)).rejects.toThrow(DicomError);
  });

  it('refuses 12-bit extended JPEG and unknown transfer syntaxes', async () => {
    // SOI, SOF1 with precision 12.
    const sof1 = new Uint8Array([0xff, 0xd8, 0xff, 0xc1, 0x00, 0x0b, 12, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xd9]);
    const ext = part10('1.2.840.10008.1.2.4.51', [...grayTags(1, 1, 16, 12), encapsulated([sof1])]);
    await expect(decodeDicomPixels(ext)).rejects.toThrow(/compression format/);
    const mpeg = part10('1.2.840.10008.1.2.4.100', [...grayTags(1, 1, 8), encapsulated([new Uint8Array(2)])]);
    await expect(decodeDicomPixels(mpeg)).rejects.toThrow(/compression format/);
  });

  it('reports a file with no image or no dimensions', async () => {
    await expect(decodeDicomPixels(part10('1.2.840.10008.1.2.1', grayTags(1, 1, 8)))).rejects.toThrow(/no image/);
    await expect(decodeDicomPixels(new Uint8Array(300))).rejects.toThrow(DicomError);
  });
});

// --- JPEG Lossless (process 14, first-order prediction) ------------------

/** A minimal lossless JPEG encoder: one component, predictor 1 (SV1,
 *  as in 1.2.840.10008.1.2.4.70), one Huffman table with every SSSS
 *  category coded in 5 bits. */
function losslessJpeg(values: number[], width: number, height: number, precision: number): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  // DHT: class 0 / id 0, seventeen 5-bit codes for SSSS 0..16.
  const bits = Array(16).fill(0);
  bits[4] = 17;
  const symbols = Array.from({ length: 17 }, (_, i) => i);
  out.push(0xff, 0xc4, 0, 2 + 1 + 16 + 17, 0x00, ...bits, ...symbols);
  // SOF3
  out.push(0xff, 0xc3, 0, 11, precision, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0);
  // SOS: predictor 1, point transform 0.
  out.push(0xff, 0xda, 0, 8, 1, 1, 0x00, 1, 0, 0);

  let acc = 0;
  let nbits = 0;
  const put = (code: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      acc = (acc << 1) | ((code >> i) & 1);
      nbits++;
      if (nbits === 8) {
        out.push(acc);
        if (acc === 0xff) out.push(0);
        acc = 0;
        nbits = 0;
      }
    }
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const pred = x === 0 && y === 0 ? 1 << (precision - 1) : x === 0 ? values[i - width] : values[i - 1];
      const diff = values[i] - pred;
      const ssss = diff === 0 ? 0 : 32 - Math.clz32(Math.abs(diff));
      put(ssss, 5);
      if (ssss > 0) put(diff > 0 ? diff : diff + (1 << ssss) - 1, ssss);
    }
  }
  if (nbits) put(0x7f, 8 - nbits); // pad with 1-bits
  out.push(0xff, 0xd9);
  return new Uint8Array(out);
}

describe('JPEG Lossless', () => {
  it('decodes a 12-bit image (SV1, 1.2.840.10008.1.2.4.70)', async () => {
    const values = [0, 4095, 2048, 7, 100, 100, 101, 99, 3000, 12, 0, 255];
    const file = part10('1.2.840.10008.1.2.4.70', [...grayTags(4, 3, 16, 12), encapsulated([losslessJpeg(values, 4, 3, 12)])]);
    const px = await decodeDicomPixels(file);
    expect([px.width, px.height]).toEqual([4, 3]);
    expect(grayValues(px)).toEqual(values);
  });

  it('decodes an 8-bit image (1.2.840.10008.1.2.4.57)', async () => {
    const values = [0, 255, 128, 64, 1, 2];
    const file = part10('1.2.840.10008.1.2.4.57', [...grayTags(3, 2, 8), encapsulated([losslessJpeg(values, 3, 2, 8)])]);
    expect(grayValues(await decodeDicomPixels(file))).toEqual(values);
  });

  it('reports a damaged stream as unreadable', async () => {
    const file = part10('1.2.840.10008.1.2.4.70', [...grayTags(2, 1, 16, 12), encapsulated([new Uint8Array([1, 2, 3, 4])])]);
    await expect(decodeDicomPixels(file)).rejects.toThrow(/damaged/);
  });
});

// --- WASM codecs (real CharLS / OpenJPEG; encoded with their full builds) --

type Encoder = {
  getDecodedBuffer(info: object): Uint8Array;
  getEncodedBuffer(): Uint8Array;
  encode(): void;
  setDecompositions?(n: number): void;
};
type Factory = (opts?: object) => Promise<Record<string, new () => Encoder>>;
const encoders = new Map<string, ReturnType<Factory>>();

async function encodeWith(pkg: string, cls: string, samples: Uint8Array, info: object): Promise<Uint8Array> {
  // emscripten adopts the options object as its Module: one fresh object per instance.
  if (!encoders.has(pkg)) encoders.set(pkg, (require(pkg) as Factory)({ print: () => {}, printErr: () => {} }));
  const codec = await encoders.get(pkg)!;
  const encoder = new codec[cls]();
  encoder.setDecompositions?.(0);
  encoder.getDecodedBuffer(info).set(samples);
  encoder.encode();
  return encoder.getEncodedBuffer().slice();
}

const gray12 = [0, 100, 4095, 7, 8, 2000];
const gray12Bytes = new Uint8Array(new Uint16Array(gray12).buffer);
const gray12Info = { width: 3, height: 2, bitsPerSample: 12, componentCount: 1, isSigned: false, isUsingColorTransform: false };
const rgb = [255, 0, 0, 0, 255, 0, 0, 0, 255, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const rgbInfo = { width: 3, height: 2, bitsPerSample: 8, componentCount: 3, isSigned: false, isUsingColorTransform: true };

describe('JPEG-LS (CharLS)', () => {
  it('decodes 12-bit grayscale', async () => {
    const encoded = await encodeWith('@cornerstonejs/codec-charls/wasmjs', 'JpegLSEncoder', gray12Bytes, gray12Info);
    const file = part10('1.2.840.10008.1.2.4.80', [...grayTags(3, 2, 16, 12), encapsulated([encoded])]);
    expect(grayValues(await decodeDicomPixels(file))).toEqual(gray12);
  });

  it('decodes RGB', async () => {
    const encoded = await encodeWith('@cornerstonejs/codec-charls/wasmjs', 'JpegLSEncoder', new Uint8Array(rgb), rgbInfo);
    const file = part10('1.2.840.10008.1.2.4.81', [...colorTags(3, 2, 'RGB'), encapsulated([encoded])]);
    expect(rgbOf(await decodeDicomPixels(file))).toEqual(rgb);
  });
});

describe('JPEG 2000 / HTJ2K (OpenJPEG)', () => {
  it('decodes 12-bit grayscale J2K', async () => {
    const encoded = await encodeWith('@cornerstonejs/codec-openjpeg/wasmjs', 'J2KEncoder', gray12Bytes, gray12Info);
    const file = part10('1.2.840.10008.1.2.4.90', [...grayTags(3, 2, 16, 12), encapsulated([encoded])]);
    expect(grayValues(await decodeDicomPixels(file))).toEqual(gray12);
  });

  it('decodes signed 16-bit J2K', async () => {
    const values = [-1000, 0, 1000, 3000];
    const encoded = await encodeWith('@cornerstonejs/codec-openjpeg/wasmjs', 'J2KEncoder', new Uint8Array(new Int16Array(values).buffer), {
      width: 2,
      height: 2,
      bitsPerSample: 16,
      componentCount: 1,
      isSigned: true,
      isUsingColorTransform: false,
    });
    const file = part10('1.2.840.10008.1.2.4.91', [
      ...grayTags(2, 2, 16, 16).map((e) => (e.tag[1] === 0x0103 ? us([0x0028, 0x0103], 1) : e)),
      encapsulated([encoded]),
    ]);
    expect(grayValues(await decodeDicomPixels(file))).toEqual(values);
  });

  it('decodes YBR_RCT colour to RGB (the codec undoes the transform)', async () => {
    const encoded = await encodeWith('@cornerstonejs/codec-openjpeg/wasmjs', 'J2KEncoder', new Uint8Array(rgb), rgbInfo);
    const file = part10('1.2.840.10008.1.2.4.90', [...colorTags(3, 2, 'YBR_RCT'), encapsulated([encoded])]);
    expect(rgbOf(await decodeDicomPixels(file))).toEqual(rgb);
  });

  it('decodes HTJ2K', async () => {
    // gray12 encoded by OpenJPH 0.31 (HTJ2KEncoder, default 5 decompositions); the
    // CAP marker (FF50) marks HT code-blocks.
    const encoded = Uint8Array.from(
      atob(
        '/0//UQApQAAAAAADAAAAAgAAAAAAAAAAAAAAAwAAAAIAAAAAAAAAAAABCwEB/1AACAACAAAABv9SAAwAAgABAAUEBEAB/1wAEyBocHBwcHBwcHBwcHBwaGho/2QAFwABT3BlbkpQSCBWZXIgMC4zMS4wLv+QAAoAAAAAAD0AAf+TwAJg0/kDB3QAAAAAwAEwxvcDh3QAwAJoAE8ACUB/+wMHdADEU8oAwjQAbgKHdAD/2Q=='
      ),
      (c) => c.charCodeAt(0)
    );
    const file = part10('1.2.840.10008.1.2.4.201', [...grayTags(3, 2, 16, 12), encapsulated([encoded])]);
    expect(grayValues(await decodeDicomPixels(file))).toEqual(gray12);
  });

  it('reports a damaged codestream as unreadable', async () => {
    const file = part10('1.2.840.10008.1.2.4.90', [...grayTags(2, 1, 16, 12), encapsulated([new Uint8Array([0xff, 0x4f, 0, 0])])]);
    await expect(decodeDicomPixels(file)).rejects.toThrow(/damaged/);
  });
});
