import { describe, it, expect } from 'vitest';
import { decodeDicom, grayscaleToRgba, rgbToRgba, DicomError } from './dicom';
import { hasDicomMagic, looksLikeDicomName } from './dicomSniff';

// --- Minimal Part 10 writer (explicit VR little endian) for tests -------

type El = { tag: [number, number]; vr: string; value: Uint8Array };

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
