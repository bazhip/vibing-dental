/** JPEG-LS (1.2.840.10008.1.2.4.80 / .81) via CharLS compiled to WASM. */
import factory from '@cornerstonejs/codec-charls/decodewasmjs';
import wasmUrl from '@cornerstonejs/codec-charls/decodewasm?url';

import { lazyModule, runDecoder } from './emscripten';
import type { CodecFrame } from './types';

const load = lazyModule(factory, wasmUrl);

/** Fetch and compile the codec. Rejects if the browser can't load it. */
export async function ready(): Promise<void> {
  await load();
}

export async function decode(encoded: Uint8Array): Promise<CodecFrame> {
  const codec = await load();
  return runDecoder(new codec.JpegLSDecoder(), encoded);
}
