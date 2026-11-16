/**
 * DICOM radiographs → a displayable preview image (and the raw pixel
 * values a viewer needs to re-window it).
 *
 * The original .dcm is stored untouched (see useAttachments); this module
 * only renders a preview the browser, grid and PDF can show.
 *
 * `decodeDicom` (sync) handles what needs no codec: uncompressed pixel
 * data (implicit/explicit VR little endian, explicit big endian) — 8/16-bit
 * grayscale (MONOCHROME1/2) and 8-bit RGB — and hands baseline JPEG to the
 * browser. Everything else throws a DicomError.
 *
 * The async path (`renderDicomPreview`, `decodeDicomPixels`) also decodes:
 *
 *  - Deflated Explicit VR Little Endian (where DecompressionStream has
 *    'deflate-raw');
 *  - RLE Lossless (plain TS, dicomCodecs/rle);
 *  - JPEG Lossless process 14 / SV1 (jpeg-lossless-decoder-js);
 *  - JPEG-LS lossless and near-lossless (CharLS, WASM);
 *  - JPEG 2000 and HTJ2K (OpenJPEG, WASM);
 *  - Extended JPEG (4.51) when the frame is 8-bit, via the browser;
 *  - YBR_FULL / YBR_FULL_422 colour, converted to RGB.
 *
 * Codecs load on demand with dynamic import(), so neither the main bundle
 * nor this module pulls in a decoder or its .wasm until a file needs it.
 * Multi-frame files render the first frame.
 *
 * Grayscale is mapped through the modality LUT (rescale slope/intercept)
 * and the file's default window (center/width); with no window in the
 * file the full value range of the frame is used.
 */
import {
  parseDicom,
  readEncapsulatedImageFrame,
  readEncapsulatedPixelDataFromFragments,
  createJPEGBasicOffsetTable,
} from 'dicom-parser';
import type { DataSet, Element } from 'dicom-parser';

import { DicomError } from './dicomSniff';
import { decodeRle } from './dicomCodecs/rle';
import type { CodecFrame } from './dicomCodecs/types';
import i18n from '../i18n';

/** Messages shown to the user, in the active language. */
const tm = () => i18n.getFixedT(null, 'media');

export { DicomError };

const TS = {
  implicitLE: '1.2.840.10008.1.2',
  explicitLE: '1.2.840.10008.1.2.1',
  deflatedLE: '1.2.840.10008.1.2.1.99',
  explicitBE: '1.2.840.10008.1.2.2',
  jpegBaseline: '1.2.840.10008.1.2.4.50',
  jpegExtended: '1.2.840.10008.1.2.4.51',
  jpegLossless: '1.2.840.10008.1.2.4.57',
  jpegLosslessSV1: '1.2.840.10008.1.2.4.70',
  jpegLsLossless: '1.2.840.10008.1.2.4.80',
  jpegLsNearLossless: '1.2.840.10008.1.2.4.81',
  j2kLossless: '1.2.840.10008.1.2.4.90',
  j2k: '1.2.840.10008.1.2.4.91',
  htj2kLossless: '1.2.840.10008.1.2.4.201',
  htj2kLosslessRpcl: '1.2.840.10008.1.2.4.202',
  htj2k: '1.2.840.10008.1.2.4.203',
  rle: '1.2.840.10008.1.2.5',
};

const UNCOMPRESSED = new Set([TS.implicitLE, TS.explicitLE, TS.explicitBE, TS.deflatedLE]);
const JPEG_2000 = new Set([TS.j2kLossless, TS.j2k, TS.htj2kLossless, TS.htj2kLosslessRpcl, TS.htj2k]);

export type DecodedDicom =
  | { kind: 'rgba'; width: number; height: number; rgba: Uint8ClampedArray }
  | { kind: 'jpeg'; bytes: Uint8Array };

/** What a viewer needs to show (and, for grayscale, re-window) a frame. */
export type DicomPixels =
  | {
      kind: 'gray';
      width: number;
      height: number;
      /** Pixel values after the modality LUT (rescale slope/intercept). */
      values: Float32Array;
      min: number;
      max: number;
      /** The file's default window, when it has a usable one (width ≥ 1). */
      windowCenter?: number;
      windowWidth?: number;
      /** MONOCHROME1: high values display dark. */
      invert: boolean;
    }
  | { kind: 'rgba'; width: number; height: number; rgba: Uint8ClampedArray };

export interface GrayscaleParams {
  width: number;
  height: number;
  bitsAllocated: 8 | 16;
  bitsStored: number;
  signed: boolean;
  bigEndian: boolean;
  slope: number;
  intercept: number;
  windowCenter?: number;
  windowWidth?: number;
  invert: boolean;
}

/** Read one stored sample, honouring BitsStored (mask / sign-extend). */
function sampleReader(p: GrayscaleParams, bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const stored = Math.min(p.bitsStored || p.bitsAllocated, p.bitsAllocated);
  const mask = stored >= 32 ? 0xffffffff : (1 << stored) - 1;
  const signBit = 1 << (stored - 1);
  const raw =
    p.bitsAllocated === 8
      ? (i: number) => view.getUint8(i)
      : (i: number) => view.getUint16(i * 2, !p.bigEndian);
  return (i: number) => {
    let v = raw(i) & mask;
    if (p.signed && v & signBit) v -= mask + 1;
    return v;
  };
}

/** Stored samples → modality values (rescale slope/intercept) and their range. */
function modalityValues(p: GrayscaleParams, bytes: Uint8Array) {
  const n = p.width * p.height;
  const bytesPer = p.bitsAllocated / 8;
  if (bytes.byteLength < n * bytesPer) {
    throw new DicomError(tm()('dicom.truncated'));
  }
  const read = sampleReader(p, bytes);
  const values = new Float32Array(n);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    values[i] = read(i) * p.slope + p.intercept;
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { values, min, max };
}

/** The window to show first: the file's, or (with none usable) the
 *  frame's own value range. */
export function defaultWindow(p: {
  min: number;
  max: number;
  windowCenter?: number;
  windowWidth?: number;
}): { center: number; width: number } {
  if (p.windowWidth !== undefined && p.windowCenter !== undefined && p.windowWidth >= 1) {
    return { center: p.windowCenter, width: p.windowWidth };
  }
  return { center: (p.min + p.max + 1) / 2, width: Math.max(1, p.max - p.min + 1) };
}

/** Modality values → opaque gray RGBA through the linear VOI window of
 *  PS3.3 C.11.2.1.2 (a `windowWidth` below 1 counts as 1). */
export function windowToRgba(
  values: ArrayLike<number>,
  width: number,
  height: number,
  center: number,
  windowWidth: number,
  invert: boolean
): Uint8ClampedArray {
  const n = width * height;
  const ww = Math.max(1, windowWidth);
  const lo = center - 0.5 - (ww - 1) / 2;
  const hi = center - 0.5 + (ww - 1) / 2;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const x = values[i];
    let y: number;
    if (x <= lo) y = 0;
    else if (x > hi) y = 255;
    else y = ww === 1 ? 255 : ((x - (center - 0.5)) / (ww - 1) + 0.5) * 255;
    if (invert) y = 255 - y;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = y;
    out[o + 3] = 255;
  }
  return out;
}

/** Grayscale pixel data → RGBA, via rescale and the linear VOI window
 *  from PS3.3 C.11.2.1.2. Exported for tests. */
export function grayscaleToRgba(p: GrayscaleParams, bytes: Uint8Array): Uint8ClampedArray {
  const { values, min, max } = modalityValues(p, bytes);
  const w = defaultWindow({ min, max, windowCenter: p.windowCenter, windowWidth: p.windowWidth });
  return windowToRgba(values, p.width, p.height, w.center, w.width, p.invert);
}

/** 8-bit RGB (interleaved or planar) → RGBA. Exported for tests. */
export function rgbToRgba(
  width: number,
  height: number,
  planar: boolean,
  bytes: Uint8Array
): Uint8ClampedArray {
  const n = width * height;
  if (bytes.byteLength < n * 3) {
    throw new DicomError(tm()('dicom.truncated'));
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (planar) {
      out[o] = bytes[i];
      out[o + 1] = bytes[n + i];
      out[o + 2] = bytes[2 * n + i];
    } else {
      out[o] = bytes[i * 3];
      out[o + 1] = bytes[i * 3 + 1];
      out[o + 2] = bytes[i * 3 + 2];
    }
    out[o + 3] = 255;
  }
  return out;
}

/** One full-range YCbCr pixel (PS3.3 C.7.6.3.1.2) into `out` at `o`. */
function putYbr(out: Uint8ClampedArray, o: number, y: number, cb: number, cr: number) {
  out[o] = y + 1.402 * (cr - 128);
  out[o + 1] = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
  out[o + 2] = y + 1.772 * (cb - 128);
  out[o + 3] = 255;
}

/** 8-bit YBR_FULL (interleaved or planar) → RGBA. Exported for tests. */
export function ybrFullToRgba(
  width: number,
  height: number,
  planar: boolean,
  bytes: Uint8Array
): Uint8ClampedArray {
  const n = width * height;
  if (bytes.byteLength < n * 3) throw new DicomError(tm()('dicom.truncated'));
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (planar) putYbr(out, i * 4, bytes[i], bytes[n + i], bytes[2 * n + i]);
    else putYbr(out, i * 4, bytes[i * 3], bytes[i * 3 + 1], bytes[i * 3 + 2]);
  }
  return out;
}

/** Uncompressed 8-bit YBR_FULL_422 (Y Y Cb Cr per horizontal pixel pair)
 *  → RGBA. Exported for tests. */
export function ybr422ToRgba(width: number, height: number, bytes: Uint8Array): Uint8ClampedArray {
  const pairs = Math.ceil(width / 2);
  if (bytes.byteLength < pairs * height * 4) throw new DicomError(tm()('dicom.truncated'));
  const out = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let p = 0; p < pairs; p++) {
      const s = (row * pairs + p) * 4;
      const cb = bytes[s + 2];
      const cr = bytes[s + 3];
      const x = p * 2;
      putYbr(out, (row * width + x) * 4, bytes[s], cb, cr);
      if (x + 1 < width) putYbr(out, (row * width + x + 1) * 4, bytes[s + 1], cb, cr);
    }
  }
  return out;
}

/** First value of a multi-valued decimal string (window center/width). */
function firstFloat(ds: DataSet, tag: string): number | undefined {
  const v = ds.floatString(tag, 0);
  return v === undefined || Number.isNaN(v) ? undefined : v;
}

/** Parse a DICOM file and decode its first frame, without loading any
 *  codec (uncompressed, or baseline JPEG for the browser). The async
 *  functions below cover the compressed formats. Throws DicomError. */
export function decodeDicom(bytes: Uint8Array): DecodedDicom {
  let ds: DataSet;
  try {
    ds = parseDicom(bytes);
  } catch {
    throw new DicomError(tm()('dicom.unreadable'));
  }

  const pixel = ds.elements.x7fe00010;
  if (!pixel) throw new DicomError(tm()('dicom.noImage'));

  const ts = ds.string('x00020010')?.trim() ?? TS.implicitLE;
  const width = ds.uint16('x00280011') ?? 0;
  const height = ds.uint16('x00280010') ?? 0;
  if (!width || !height) throw new DicomError(tm()('dicom.noDimensions'));

  if (ts === TS.jpegBaseline) {
    const fragments = pixel.fragments;
    if (!fragments || fragments.length === 0) throw new DicomError(tm()('dicom.unsupported'));
    const table =
      pixel.basicOffsetTable && pixel.basicOffsetTable.length
        ? pixel.basicOffsetTable
        : createJPEGBasicOffsetTable(ds, pixel);
    const frame = readEncapsulatedImageFrame(ds, pixel, 0, table);
    return { kind: 'jpeg', bytes: new Uint8Array(frame) };
  }
  if (ts !== TS.implicitLE && ts !== TS.explicitLE && ts !== TS.explicitBE) {
    throw new DicomError(tm()('dicom.unsupported'));
  }

  const samples = ds.uint16('x00280002') ?? 1;
  const bitsAllocated = ds.uint16('x00280100') ?? 16;
  const photometric = (ds.string('x00280004') ?? 'MONOCHROME2').trim().toUpperCase();
  const bytesPerSample = bitsAllocated / 8;
  const frameBytes = width * height * samples * bytesPerSample;
  const start = pixel.dataOffset;
  if (start + frameBytes > bytes.byteLength) {
    throw new DicomError(tm()('dicom.truncated'));
  }
  const frame = bytes.subarray(start, start + frameBytes);

  if (samples === 3) {
    if (bitsAllocated !== 8 || photometric !== 'RGB') throw new DicomError(tm()('dicom.unsupported'));
    const planar = (ds.uint16('x00280006') ?? 0) === 1;
    return { kind: 'rgba', width, height, rgba: rgbToRgba(width, height, planar, frame) };
  }
  if (samples !== 1 || (bitsAllocated !== 8 && bitsAllocated !== 16)) {
    throw new DicomError(tm()('dicom.unsupported'));
  }
  if (photometric !== 'MONOCHROME1' && photometric !== 'MONOCHROME2') {
    throw new DicomError(tm()('dicom.unsupported'));
  }

  const rgba = grayscaleToRgba(
    {
      width,
      height,
      bitsAllocated: bitsAllocated as 8 | 16,
      bitsStored: ds.uint16('x00280101') ?? bitsAllocated,
      signed: (ds.uint16('x00280103') ?? 0) === 1,
      bigEndian: ts === TS.explicitBE,
      slope: firstFloat(ds, 'x00281053') ?? 1,
      intercept: firstFloat(ds, 'x00281052') ?? 0,
      windowCenter: firstFloat(ds, 'x00281050'),
      windowWidth: firstFloat(ds, 'x00281051'),
      invert: photometric === 'MONOCHROME1',
    },
    frame
  );
  return { kind: 'rgba', width, height, rgba };
}

// --- Async path: compressed transfer syntaxes ----------------------------

/** The image attributes of a parsed file. */
interface ImageHeader {
  ds: DataSet;
  pixel: Element;
  ts: string;
  width: number;
  height: number;
  samples: number;
  bitsAllocated: number;
  bitsStored: number;
  signed: boolean;
  photometric: string;
  planar: boolean;
  frames: number;
  slope: number;
  intercept: number;
  windowCenter?: number;
  windowWidth?: number;
}

/** A decoded (or uncompressed) first frame, before display mapping. */
interface RawFrame {
  data: Uint8Array;
  width: number;
  height: number;
  samples: number;
  bitsAllocated: number;
  bitsStored: number;
  signed: boolean;
  bigEndian: boolean;
  planar: boolean;
  /** Photometric interpretation of `data` (after any codec colour transform). */
  photometric: string;
}

/** A frame of baseline (or 8-bit extended) JPEG, for the browser to decode. */
type BrowserJpeg = { kind: 'jpeg'; bytes: Uint8Array };

/** Inflate raw deflate data with the platform's DecompressionStream. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  let stream: DecompressionStream;
  try {
    stream = new DecompressionStream('deflate-raw');
  } catch {
    throw new DicomError(tm()('dicom.unsupported'));
  }
  const writer = stream.writable.getWriter();
  // Errors surface on the reader; these promises only need handling.
  writer.write(data as Uint8Array<ArrayBuffer>).catch(() => {});
  writer.close().catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    throw new DicomError(tm()('dicom.unreadable'));
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** dicom-parser types the inflater as returning void, but it parses the
 *  byte array the inflater returns (header bytes + inflated body). */
type Inflater = (arr: Uint8Array, position: number) => void;

/** parseDicom, inflating a Deflated Explicit VR LE body first. */
async function parseDicomAsync(bytes: Uint8Array): Promise<DataSet> {
  let deflateAt = -1;
  const needsInflating = {};
  try {
    return parseDicom(bytes, {
      inflater: (_arr: Uint8Array, position: number) => {
        deflateAt = position;
        throw needsInflating;
      },
    });
  } catch {
    if (deflateAt < 0) throw new DicomError(tm()('dicom.unreadable'));
  }
  const inflated = await inflateRaw(bytes.subarray(deflateAt));
  const full = new Uint8Array(deflateAt + inflated.byteLength);
  full.set(bytes.subarray(0, deflateAt));
  full.set(inflated, deflateAt);
  try {
    return parseDicom(bytes, { inflater: (() => full) as unknown as Inflater });
  } catch {
    throw new DicomError(tm()('dicom.unreadable'));
  }
}

function readHeader(ds: DataSet): ImageHeader {
  const pixel = ds.elements.x7fe00010;
  if (!pixel) throw new DicomError(tm()('dicom.noImage'));
  const width = ds.uint16('x00280011') ?? 0;
  const height = ds.uint16('x00280010') ?? 0;
  if (!width || !height) throw new DicomError(tm()('dicom.noDimensions'));
  const bitsAllocated = ds.uint16('x00280100') ?? 16;
  const wc = firstFloat(ds, 'x00281050');
  const ww = firstFloat(ds, 'x00281051');
  const usableWindow = wc !== undefined && ww !== undefined && ww >= 1;
  return {
    ds,
    pixel,
    ts: ds.string('x00020010')?.trim() ?? TS.implicitLE,
    width,
    height,
    samples: ds.uint16('x00280002') ?? 1,
    bitsAllocated,
    bitsStored: ds.uint16('x00280101') ?? bitsAllocated,
    signed: (ds.uint16('x00280103') ?? 0) === 1,
    photometric: (ds.string('x00280004') ?? 'MONOCHROME2').trim().toUpperCase(),
    planar: (ds.uint16('x00280006') ?? 0) === 1,
    frames: Math.max(1, ds.intString('x00280008') ?? 1),
    slope: firstFloat(ds, 'x00281053') ?? 1,
    intercept: firstFloat(ds, 'x00281052') ?? 0,
    windowCenter: usableWindow ? wc : undefined,
    windowWidth: usableWindow ? ww : undefined,
  };
}

/** The encoded bytes of the first frame of encapsulated pixel data: by the
 *  basic offset table when there is one; otherwise every fragment for a
 *  single-frame image, one fragment per frame when the counts match (and
 *  always for RLE, which mandates it), or split at end-of-image markers
 *  (JPEG, JPEG-LS and JPEG 2000 codestreams all end in FFD9).
 *  Exported for tests. */
export function firstEncapsulatedFrame(ds: DataSet, pixel: Element, frames: number, rle = false): Uint8Array {
  const fragments = pixel.fragments;
  if (!fragments || fragments.length === 0) throw new DicomError(tm()('dicom.noImage'));
  try {
    let frame;
    if (pixel.basicOffsetTable && pixel.basicOffsetTable.length) {
      frame = readEncapsulatedImageFrame(ds, pixel, 0);
    } else if (frames <= 1) {
      frame = readEncapsulatedPixelDataFromFragments(ds, pixel, 0, fragments.length);
    } else if (rle || fragments.length === frames) {
      frame = readEncapsulatedPixelDataFromFragments(ds, pixel, 0, 1);
    } else {
      frame = readEncapsulatedImageFrame(ds, pixel, 0, createJPEGBasicOffsetTable(ds, pixel));
    }
    return new Uint8Array(frame.buffer, frame.byteOffset, frame.byteLength);
  } catch {
    throw new DicomError(tm()('dicom.unreadable'));
  }
}

/** Sample precision of a JPEG frame (from its SOFn marker), 0 if not found. */
function jpegPrecision(frame: Uint8Array): number {
  let p = 2; // past SOI
  while (p + 4 < frame.length) {
    if (frame[p] !== 0xff) return 0;
    const marker = frame[p + 1];
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return frame[p + 4];
    }
    p += 2 + ((frame[p + 2] << 8) | frame[p + 3]);
  }
  return 0;
}

type Codec = {
  ready(): Promise<void>;
  decode(encoded: Uint8Array, bytesPerSample: 1 | 2): Promise<CodecFrame>;
};

/** Load a codec chunk and decode one frame. A codec that won't load is the
 *  browser's problem ('render'); data it can't decode means a damaged file
 *  ('unreadable'). */
async function runCodec(load: () => Promise<Codec>, encoded: Uint8Array, h: ImageHeader): Promise<RawFrame> {
  let codec: Codec;
  try {
    codec = await load();
    await codec.ready();
  } catch {
    throw new DicomError(tm()('dicom.render'));
  }
  let out: CodecFrame;
  try {
    out = await codec.decode(encoded, h.bitsAllocated > 8 ? 2 : 1);
  } catch (err) {
    if (err instanceof DicomError) throw err;
    throw new DicomError(tm()('dicom.unreadable'));
  }
  if (
    !out.width ||
    !out.height ||
    out.data.byteLength < out.width * out.height * out.components * out.bytesPerSample
  ) {
    throw new DicomError(tm()('dicom.unreadable'));
  }
  return {
    data: out.data,
    width: out.width,
    height: out.height,
    samples: out.components,
    bitsAllocated: out.bytesPerSample * 8,
    // The codestream's precision is more reliable than BitsStored.
    bitsStored: Math.min(out.bitsPerSample || h.bitsStored, out.bytesPerSample * 8),
    signed: h.signed || !!out.signed,
    bigEndian: false,
    planar: false,
    // Codecs hand back full-resolution interleaved components (4:2:2 is
    // upsampled) and JPEG 2000 undoes its own RCT/ICT colour transform.
    photometric:
      h.photometric === 'YBR_FULL_422'
        ? 'YBR_FULL'
        : h.photometric === 'YBR_RCT' || h.photometric === 'YBR_ICT'
          ? 'RGB'
          : h.photometric,
  };
}

async function decodeFirstFrame(h: ImageHeader): Promise<RawFrame | BrowserJpeg> {
  const { ds, pixel, ts } = h;

  if (UNCOMPRESSED.has(ts)) {
    const frameBytes =
      h.samples === 3 && h.photometric === 'YBR_FULL_422'
        ? Math.ceil(h.width / 2) * h.height * 4
        : h.width * h.height * h.samples * Math.ceil(h.bitsAllocated / 8);
    const start = pixel.dataOffset;
    // A deflated file's offsets point into the inflated copy.
    const all = ds.byteArray;
    if (pixel.fragments || start + frameBytes > all.byteLength) {
      throw new DicomError(tm()('dicom.truncated'));
    }
    return {
      data: all.subarray(start, start + frameBytes),
      width: h.width,
      height: h.height,
      samples: h.samples,
      bitsAllocated: h.bitsAllocated,
      bitsStored: h.bitsStored,
      signed: h.signed,
      bigEndian: ts === TS.explicitBE,
      planar: h.planar,
      photometric: h.photometric,
    };
  }

  if (ts === TS.rle) {
    if (h.bitsAllocated !== 8 && h.bitsAllocated !== 16) throw new DicomError(tm()('dicom.unsupported'));
    const encoded = firstEncapsulatedFrame(ds, pixel, h.frames, true);
    const data = decodeRle(encoded, h.width, h.height, h.samples, h.bitsAllocated === 16 ? 2 : 1);
    if (!data) throw new DicomError(tm()('dicom.unreadable'));
    return {
      data,
      width: h.width,
      height: h.height,
      samples: h.samples,
      bitsAllocated: h.bitsAllocated,
      bitsStored: h.bitsStored,
      signed: h.signed,
      bigEndian: false,
      planar: true,
      photometric: h.photometric,
    };
  }

  if (ts === TS.jpegBaseline) {
    return { kind: 'jpeg', bytes: firstEncapsulatedFrame(ds, pixel, h.frames) };
  }
  if (ts === TS.jpegExtended) {
    // Process 2 (8-bit) is something browsers decode; process 4 (12-bit) isn't.
    const encoded = firstEncapsulatedFrame(ds, pixel, h.frames);
    if (jpegPrecision(encoded) !== 8) throw new DicomError(tm()('dicom.unsupported'));
    return { kind: 'jpeg', bytes: encoded };
  }
  if (ts === TS.jpegLossless || ts === TS.jpegLosslessSV1) {
    return runCodec(() => import('./dicomCodecs/jpegLossless'), firstEncapsulatedFrame(ds, pixel, h.frames), h);
  }
  if (ts === TS.jpegLsLossless || ts === TS.jpegLsNearLossless) {
    return runCodec(() => import('./dicomCodecs/jpegLs'), firstEncapsulatedFrame(ds, pixel, h.frames), h);
  }
  if (JPEG_2000.has(ts)) {
    return runCodec(() => import('./dicomCodecs/jpeg2000'), firstEncapsulatedFrame(ds, pixel, h.frames), h);
  }
  throw new DicomError(tm()('dicom.unsupported'));
}

/** Decoded samples → what the viewer shows. */
function rawToPixels(h: ImageHeader, raw: RawFrame): DicomPixels {
  const { width, height } = raw;
  if (raw.samples === 1) {
    if (raw.bitsAllocated !== 8 && raw.bitsAllocated !== 16) throw new DicomError(tm()('dicom.unsupported'));
    if (raw.photometric !== 'MONOCHROME1' && raw.photometric !== 'MONOCHROME2') {
      throw new DicomError(tm()('dicom.unsupported'));
    }
    const { values, min, max } = modalityValues(
      {
        width,
        height,
        bitsAllocated: raw.bitsAllocated as 8 | 16,
        bitsStored: raw.bitsStored,
        signed: raw.signed,
        bigEndian: raw.bigEndian,
        slope: h.slope,
        intercept: h.intercept,
        invert: false,
      },
      raw.data
    );
    return {
      kind: 'gray',
      width,
      height,
      values,
      min,
      max,
      windowCenter: h.windowCenter,
      windowWidth: h.windowWidth,
      invert: raw.photometric === 'MONOCHROME1',
    };
  }
  if (raw.samples !== 3 || raw.bitsAllocated !== 8) throw new DicomError(tm()('dicom.unsupported'));
  switch (raw.photometric) {
    case 'RGB':
    case 'YBR_RCT':
    case 'YBR_ICT':
      return { kind: 'rgba', width, height, rgba: rgbToRgba(width, height, raw.planar, raw.data) };
    case 'YBR_FULL':
      return { kind: 'rgba', width, height, rgba: ybrFullToRgba(width, height, raw.planar, raw.data) };
    case 'YBR_FULL_422':
      return { kind: 'rgba', width, height, rgba: ybr422ToRgba(width, height, raw.data) };
    default:
      throw new DicomError(tm()('dicom.unsupported'));
  }
}

/** Browser-only: let the browser decode a JPEG frame to RGBA. */
async function browserJpegToRgba(bytes: Uint8Array) {
  if (typeof createImageBitmap !== 'function') throw new DicomError(tm()('dicom.render'));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/jpeg' }));
  } catch {
    throw new DicomError(tm()('dicom.unreadable'));
  }
  try {
    const { width, height } = bitmap;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new DicomError(tm()('dicom.render'));
    ctx.drawImage(bitmap, 0, 0);
    return { width, height, rgba: ctx.getImageData(0, 0, width, height).data };
  } finally {
    bitmap.close();
  }
}

async function frameToPixels(h: ImageHeader, frame: RawFrame | BrowserJpeg): Promise<DicomPixels> {
  if (!('kind' in frame)) return rawToPixels(h, frame);
  const { width, height, rgba } = await browserJpegToRgba(frame.bytes);
  if (h.samples !== 1) return { kind: 'rgba', width, height, rgba };
  // Grayscale JPEG: keep the values so the viewer can still window them.
  const n = width * height;
  const values = new Float32Array(n);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    values[i] = rgba[i * 4] * h.slope + h.intercept;
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    kind: 'gray',
    width,
    height,
    values,
    min,
    max,
    windowCenter: h.windowCenter,
    windowWidth: h.windowWidth,
    invert: h.photometric === 'MONOCHROME1',
  };
}

/** Decode the first frame of a DICOM file into what a viewer needs:
 *  modality values plus the file's window for grayscale, RGBA for colour.
 *  Loads codecs on demand; baseline JPEG needs a browser. Throws DicomError. */
export async function decodeDicomPixels(bytes: Uint8Array): Promise<DicomPixels> {
  const h = readHeader(await parseDicomAsync(bytes));
  return frameToPixels(h, await decodeFirstFrame(h));
}

/** DicomPixels → RGBA, grayscale at its default window. */
export function pixelsToRgba(px: DicomPixels): Uint8ClampedArray {
  if (px.kind === 'rgba') return px.rgba;
  const w = defaultWindow(px);
  return windowToRgba(px.values, px.width, px.height, w.center, w.width, px.invert);
}

/** Browser-only: decode a DICOM file into a PNG (or the embedded JPEG)
 *  Blob suitable for the normal image pipeline. Throws DicomError. */
export async function renderDicomPreview(bytes: Uint8Array): Promise<Blob> {
  const h = readHeader(await parseDicomAsync(bytes));
  const frame = await decodeFirstFrame(h);
  if ('kind' in frame) {
    return new Blob([frame.bytes as BlobPart], { type: 'image/jpeg' });
  }
  const px = rawToPixels(h, frame);
  const canvas = document.createElement('canvas');
  canvas.width = px.width;
  canvas.height = px.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new DicomError(tm()('dicom.render'));
  ctx.putImageData(new ImageData(pixelsToRgba(px) as Uint8ClampedArray<ArrayBuffer>, px.width, px.height), 0, 0);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new DicomError(tm()('dicom.render'));
  return blob;
}
