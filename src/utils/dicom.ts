/**
 * DICOM radiographs → a displayable preview image.
 *
 * The original .dcm is stored untouched (see useAttachments); this module
 * only renders a preview the browser, grid and PDF can show. Supported:
 *
 *  - uncompressed pixel data (implicit/explicit VR little endian, explicit
 *    big endian) — 8/16-bit grayscale (MONOCHROME1/2) and 8-bit RGB;
 *  - baseline JPEG (8-bit), handed to the browser's own decoder.
 *
 * Anything else (JPEG 2000, JPEG-LS, lossless JPEG, RLE, deflate) throws
 * a DicomError with a message fit for the user. Multi-frame files render
 * the first frame.
 *
 * Grayscale is mapped through the modality LUT (rescale slope/intercept)
 * and the file's default window (center/width); with no window in the
 * file the full value range of the frame is used.
 */
import { parseDicom, readEncapsulatedImageFrame, createJPEGBasicOffsetTable } from 'dicom-parser';
import type { DataSet } from 'dicom-parser';

import { DicomError } from './dicomSniff';

export { DicomError };

const TS = {
  implicitLE: '1.2.840.10008.1.2',
  explicitLE: '1.2.840.10008.1.2.1',
  explicitBE: '1.2.840.10008.1.2.2',
  jpegBaseline: '1.2.840.10008.1.2.4.50',
};

export type DecodedDicom =
  | { kind: 'rgba'; width: number; height: number; rgba: Uint8ClampedArray }
  | { kind: 'jpeg'; bytes: Uint8Array };

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

/** Grayscale pixel data → RGBA, via rescale and the linear VOI window
 *  from PS3.3 C.11.2.1.2. Exported for tests. */
export function grayscaleToRgba(p: GrayscaleParams, bytes: Uint8Array): Uint8ClampedArray {
  const n = p.width * p.height;
  const bytesPer = p.bitsAllocated / 8;
  if (bytes.byteLength < n * bytesPer) {
    throw new DicomError('This DICOM file is truncated — the image data is incomplete.');
  }
  const read = sampleReader(p, bytes);
  const values = new Float64Array(n);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = read(i) * p.slope + p.intercept;
    values[i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  let center: number;
  let width: number;
  if (p.windowWidth !== undefined && p.windowCenter !== undefined && p.windowWidth >= 1) {
    center = p.windowCenter;
    width = p.windowWidth;
  } else {
    // No usable window in the file: stretch the frame's own range.
    center = (min + max + 1) / 2;
    width = Math.max(1, max - min + 1);
  }

  const lo = center - 0.5 - (width - 1) / 2;
  const hi = center - 0.5 + (width - 1) / 2;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const x = values[i];
    let y: number;
    if (x <= lo) y = 0;
    else if (x > hi) y = 255;
    else y = width === 1 ? 255 : ((x - (center - 0.5)) / (width - 1) + 0.5) * 255;
    if (p.invert) y = 255 - y;
    const o = i * 4;
    out[o] = out[o + 1] = out[o + 2] = y;
    out[o + 3] = 255;
  }
  return out;
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
    throw new DicomError('This DICOM file is truncated — the image data is incomplete.');
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

/** First value of a multi-valued decimal string (window center/width). */
function firstFloat(ds: DataSet, tag: string): number | undefined {
  const v = ds.floatString(tag, 0);
  return v === undefined || Number.isNaN(v) ? undefined : v;
}

const UNSUPPORTED =
  "This DICOM file uses a compression format the browser can't open. " +
  'Export it from your imaging software as uncompressed DICOM (or as a JPEG/PNG) and try again.';

/** Parse a DICOM file and decode its first frame. Throws DicomError. */
export function decodeDicom(bytes: Uint8Array): DecodedDicom {
  let ds: DataSet;
  try {
    ds = parseDicom(bytes);
  } catch {
    throw new DicomError("Couldn't read that DICOM file — it may be damaged or not a DICOM image.");
  }

  const pixel = ds.elements.x7fe00010;
  if (!pixel) throw new DicomError('That DICOM file has no image in it.');

  const ts = ds.string('x00020010')?.trim() ?? TS.implicitLE;
  const width = ds.uint16('x00280011') ?? 0;
  const height = ds.uint16('x00280010') ?? 0;
  if (!width || !height) throw new DicomError('That DICOM file has no image dimensions.');

  if (ts === TS.jpegBaseline) {
    const fragments = pixel.fragments;
    if (!fragments || fragments.length === 0) throw new DicomError(UNSUPPORTED);
    const table =
      pixel.basicOffsetTable && pixel.basicOffsetTable.length
        ? pixel.basicOffsetTable
        : createJPEGBasicOffsetTable(ds, pixel);
    const frame = readEncapsulatedImageFrame(ds, pixel, 0, table);
    return { kind: 'jpeg', bytes: new Uint8Array(frame) };
  }
  if (ts !== TS.implicitLE && ts !== TS.explicitLE && ts !== TS.explicitBE) {
    throw new DicomError(UNSUPPORTED);
  }

  const samples = ds.uint16('x00280002') ?? 1;
  const bitsAllocated = ds.uint16('x00280100') ?? 16;
  const photometric = (ds.string('x00280004') ?? 'MONOCHROME2').trim().toUpperCase();
  const bytesPerSample = bitsAllocated / 8;
  const frameBytes = width * height * samples * bytesPerSample;
  const start = pixel.dataOffset;
  if (start + frameBytes > bytes.byteLength) {
    throw new DicomError('This DICOM file is truncated — the image data is incomplete.');
  }
  const frame = bytes.subarray(start, start + frameBytes);

  if (samples === 3) {
    if (bitsAllocated !== 8 || photometric !== 'RGB') throw new DicomError(UNSUPPORTED);
    const planar = (ds.uint16('x00280006') ?? 0) === 1;
    return { kind: 'rgba', width, height, rgba: rgbToRgba(width, height, planar, frame) };
  }
  if (samples !== 1 || (bitsAllocated !== 8 && bitsAllocated !== 16)) {
    throw new DicomError(UNSUPPORTED);
  }
  if (photometric !== 'MONOCHROME1' && photometric !== 'MONOCHROME2') {
    throw new DicomError(UNSUPPORTED);
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

/** Browser-only: decode a DICOM file into a PNG (or the embedded JPEG)
 *  Blob suitable for the normal image pipeline. Throws DicomError. */
export async function renderDicomPreview(bytes: Uint8Array): Promise<Blob> {
  const decoded = decodeDicom(bytes);
  if (decoded.kind === 'jpeg') {
    return new Blob([decoded.bytes as BlobPart], { type: 'image/jpeg' });
  }
  const canvas = document.createElement('canvas');
  canvas.width = decoded.width;
  canvas.height = decoded.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new DicomError("Your browser couldn't render that DICOM image.");
  ctx.putImageData(new ImageData(decoded.rgba as Uint8ClampedArray<ArrayBuffer>, decoded.width, decoded.height), 0, 0);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob) throw new DicomError("Your browser couldn't render that DICOM image.");
  return blob;
}
