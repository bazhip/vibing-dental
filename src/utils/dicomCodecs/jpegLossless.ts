/** JPEG Lossless, process 14 (1.2.840.10008.1.2.4.57 / .70), in plain JS. */
import { Decoder } from 'jpeg-lossless-decoder-js';

import type { CodecFrame } from './types';

/** Nothing to fetch: the decoder is plain JS. */
export async function ready(): Promise<void> {}

/** `bytesPerSample` forces the output width (BitsAllocated / 8); colour
 *  is only decoded at one byte per sample. */
export async function decode(encoded: Uint8Array, bytesPerSample: 1 | 2): Promise<CodecFrame> {
  const decoder = new Decoder();
  const out = decoder.decode(encoded.buffer as ArrayBuffer, encoded.byteOffset, encoded.byteLength, bytesPerSample);
  const { dimX, dimY, numComp, precision } = decoder.frame;
  const sampleBytes = out instanceof Uint16Array ? 2 : 1;
  return {
    width: dimX,
    height: dimY,
    components: numComp,
    bytesPerSample: sampleBytes,
    bitsPerSample: precision,
    data: new Uint8Array(out.buffer, out.byteOffset, out.byteLength),
  };
}
