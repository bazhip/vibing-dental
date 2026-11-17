import type { ImageTransferResult } from './imageTransfer';

export type SavedImage = {
  id: string; chart_id: string; path: string; caption: string; kind: 'photo' | 'xray'; original_path: string | null;
};
export type ImageSource = { chart_id: string; hash: string; patient_name: string; patient_number: string };
export type ImageStore = {
  context(chartId: string): Promise<ImageSource>;
  list(chartId: string): Promise<SavedImage[]>;
  read(chartId: string, imageId: string): Promise<SavedImage | null>;
  download(path: string): Promise<Blob>;
};
export type ImageDimensions = { width: number; height: number };
export type ImageDecoder = (blob: Blob) => Promise<ImageDimensions>;
export type PreparedImage = ImageDimensions & {
  image: SavedImage; source: ImageSource; blob: Blob; contentHash: string;
  extension: 'png' | 'jpg' | 'webp'; dicomPreview: boolean;
  transfer?: { blob: Blob; contentHash: string };
};
export type SelectedImageTransfer = {
  chartId: string;
  render: () => Promise<string>;
  dispatch?: (destination: string, alive: () => boolean) => Promise<ImageTransferResult>;
};
export type ImageError = 'invalid' | 'stale' | 'forbidden' | 'schema' | 'unknown' | 'unsupported';
export function imageError(error: unknown): ImageError {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return ['invalid', 'stale', 'forbidden', 'schema', 'unsupported'].includes(String(code)) ? code as ImageError : 'unknown';
}
const invalid = (): never => { throw { code: 'invalid' }; };
const maxBytes = 2 * 1024 * 1024;
function bounded(width: number, height: number): ImageDimensions {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2000 || height > 2000) invalid();
  return { width, height };
}
export function imageHeader(bytes: Uint8Array, mime: string): ImageDimensions & { extension: PreparedImage['extension'] } {
  if (bytes.length < 24 || bytes.length > maxBytes) return invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const matches = (offset: number, values: number[]) => values.every((value, index) => bytes[offset + index] === value);
  const ascii = (offset: number, value: string) => matches(offset, Array.from(value, (letter) => letter.charCodeAt(0)));
  if (mime === 'image/png' && matches(0, [137,80,78,71,13,10,26,10]) && view.getUint32(8) === 13 && ascii(12, 'IHDR')) {
    if (bytes.length < 33) return invalid();
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (ascii(offset + 4, 'acTL')) return invalid();
      if (length > bytes.length - offset - 12) return invalid();
      offset += length + 12;
    }
    return { ...bounded(view.getUint32(16), view.getUint32(20)), extension: 'png' };
  }
  if (mime === 'image/jpeg' && matches(0, [255,216])) {
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset++] !== 255) return invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218 || offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return invalid();
      if ([192,193,194].includes(marker) && length >= 8) return { ...bounded(view.getUint16(offset + 5), view.getUint16(offset + 3)), extension: 'jpg' };
      offset += length;
    }
  }
  if (mime === 'image/webp' && ascii(0, 'RIFF') && ascii(8, 'WEBP') && view.getUint32(4, true) === bytes.length - 8) {
    const uint24 = (offset: number) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;
    if (ascii(12, 'VP8X') && bytes.length >= 30 && view.getUint32(16, true) === 10 && !(bytes[20] & 2)) {
      return { ...bounded(uint24(24) + 1, uint24(27) + 1), extension: 'webp' };
    }
    if (ascii(12, 'VP8L') && bytes.length >= 25 && bytes[20] === 47) {
      const packed = view.getUint32(21, true);
      return { ...bounded((packed & 16383) + 1, ((packed >>> 14) & 16383) + 1), extension: 'webp' };
    }
    if (ascii(12, 'VP8 ') && bytes.length >= 30 && matches(23, [157,1,42])) {
      return { ...bounded(view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383), extension: 'webp' };
    }
  }
  return invalid();
}
export function validSavedImage(value: unknown, chartId: string): value is SavedImage {
  if (!value || typeof value !== 'object') return false;
  const image = value as SavedImage;
  return typeof image.id === 'string' && image.id.length > 0 && image.id.length <= 200 && image.chart_id === chartId
    && typeof image.path === 'string' && image.path.length <= 1024 && /^[\w-]+\/[\w-]+\/[\w-]+\.(png|jpg|jpeg|webp)$/i.test(image.path)
    && image.path.split('/')[1] === chartId && image.path !== image.original_path
    && typeof image.caption === 'string' && image.caption.length <= 10000 && ['photo', 'xray'].includes(image.kind)
    && (image.original_path === null || typeof image.original_path === 'string');
}
function sameImage(left: SavedImage, right: SavedImage | null): boolean {
  return !!right && left.id === right.id && left.chart_id === right.chart_id && left.path === right.path
    && left.caption === right.caption && left.kind === right.kind && left.original_path === right.original_path;
}
function validSource(source: ImageSource, chartId: string): boolean {
  return source?.chart_id === chartId && /^[a-f0-9]{64}$/.test(source.hash)
    && typeof source.patient_name === 'string' && typeof source.patient_number === 'string';
}
function sameSource(left: ImageSource, right: ImageSource): boolean {
  return validSource(right, left.chart_id) && left.hash === right.hash && left.patient_name === right.patient_name && left.patient_number === right.patient_number;
}
export const decodeImage: ImageDecoder = async (blob) => {
  const bitmap = await createImageBitmap(blob);
  try { return bounded(bitmap.width, bitmap.height); } finally { bitmap.close(); }
};
export async function prepareImage(store: ImageStore, chartId: string, imageId: string, decode: ImageDecoder = decodeImage): Promise<PreparedImage> {
  const source = { ...await store.context(chartId) };
  const image = { ...await store.read(chartId, imageId) };
  if (!validSource(source, chartId) || !validSavedImage(image, chartId) || image.id !== imageId) return invalid();
  const blob = await store.download(image.path);
  if (!blob || blob.size > maxBytes || blob.size < 24) return invalid();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const header = imageHeader(bytes, blob.type);
  let decoded: ImageDimensions;
  try { decoded = await decode(blob); } catch { return invalid(); }
  if (decoded.width !== header.width || decoded.height !== header.height) return invalid();
  const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const current = await store.read(chartId, imageId);
  const latest = await store.context(chartId);
  if (!sameImage(image, current) || !sameSource(source, latest)) throw { code: 'stale' };
  return { image, source, blob, contentHash, ...header, dicomPreview: image.original_path !== null };
}
export async function revalidateImage(store: ImageStore, prepared: PreparedImage, decode: ImageDecoder = decodeImage): Promise<PreparedImage> {
  const current = await prepareImage(store, prepared.image.chart_id, prepared.image.id, decode);
  if (!sameSource(prepared.source, current.source) || !sameImage(prepared.image, current.image) || prepared.contentHash !== current.contentHash) throw { code: 'stale' };
  return current;
}

export async function encodeImagePng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    bounded(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return invalid();
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject({ code: 'invalid' }), 'image/png'));
  } finally { bitmap.close(); }
}

export async function prepareImageTransfer(store: ImageStore, prepared: PreparedImage, alive: () => boolean,
  decode: ImageDecoder = decodeImage, encode: (blob: Blob) => Promise<Blob> = encodeImagePng): Promise<PreparedImage & { transfer: { blob: Blob; contentHash: string } }> {
  const guard = () => { if (!alive()) throw { code: 'stale' }; };
  guard();
  const current = await revalidateImage(store, prepared, decode);
  guard();
  const png = await encode(current.blob);
  guard();
  if (png.size > maxBytes || png.type !== 'image/png') return invalid();
  const bytes = new Uint8Array(await png.arrayBuffer());
  const header = imageHeader(bytes, png.type);
  const decoded = await decode(png);
  if (header.width !== current.width || header.height !== current.height || decoded.width !== header.width || decoded.height !== header.height) return invalid();
  await revalidateImage(store, prepared, decode);
  guard();
  const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  guard();
  return { ...current, transfer: { blob: png, contentHash } };
}

export async function renderSavedImage(store: ImageStore, prepared: PreparedImage, alive: () => boolean,
  decode: ImageDecoder = decodeImage): Promise<string> {
  if (!alive()) throw { code: 'stale' };
  if (!prepared.transfer || prepared.transfer.blob.type !== 'image/png' || prepared.transfer.blob.size > maxBytes) return invalid();
  const transfer = { ...prepared.transfer };
  await revalidateImage(store, prepared, decode);
  const bytes = new Uint8Array(await transfer.blob.arrayBuffer());
  const header = imageHeader(bytes, transfer.blob.type);
  const decoded = await decode(transfer.blob);
  if (header.width !== prepared.width || header.height !== prepared.height || decoded.width !== header.width || decoded.height !== header.height) return invalid();
  const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (!alive() || transfer.contentHash !== contentHash) throw { code: 'stale' };
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}
