/**
 * Lightweight DICOM detection, kept apart from the decoder (utils/dicom)
 * so the upload path can recognise a .dcm without pulling dicom-parser
 * into the main bundle. The decoder loads on demand.
 */

import { LocalizedError } from './apiErrors';

/** Messages are translated when thrown (see utils/dicom.ts). */
export class DicomError extends LocalizedError {}

export const DICOM_MIME = 'application/dicom';

/** Part 10 files carry "DICM" after a 128-byte preamble. */
export function hasDicomMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 132 &&
    bytes[128] === 0x44 && // D
    bytes[129] === 0x49 && // I
    bytes[130] === 0x43 && // C
    bytes[131] === 0x4d // M
  );
}

/** Cheap check from the picker's metadata (name / MIME). Sensor software
 *  often exports bare names with no extension, so callers should also
 *  sniff the bytes with hasDicomMagic. */
export function looksLikeDicomName(file: { name: string; type: string }): boolean {
  return file.type === DICOM_MIME || /\.(dcm|dicom)$/i.test(file.name);
}
