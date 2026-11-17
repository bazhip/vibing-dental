/** JPEG 2000 (1.2.840.10008.1.2.4.90 / .91) and HTJ2K (.4.201–.203) via
 *  OpenJPEG compiled to WASM. OpenJPEG ≥ 2.5 decodes HT code-blocks too,
 *  and undoes the RCT/ICT colour transform itself. */
import factory from '@cornerstonejs/codec-openjpeg/decodewasmjs';
import wasmUrl from '@cornerstonejs/codec-openjpeg/decodewasm?url';

import { lazyModule, runDecoder } from './emscripten';
import type { CodecFrame } from './types';

const load = lazyModule(factory, wasmUrl);

/** Fetch and compile the codec. Rejects if the browser can't load it. */
export async function ready(): Promise<void> {
  await load();
}

export async function decode(encoded: Uint8Array): Promise<CodecFrame> {
  const codec = await load();
  return runDecoder(new codec.J2KDecoder(), encoded);
}
