/**
 * Shared glue for the cornerstone WASM codecs (CharLS, OpenJPEG). Each
 * codec module imports its own emscripten factory and `?url` wasm, so the
 * JS glue and the .wasm only load when a file needs that codec.
 */
import type { CodecFrame } from './types';

const quiet = () => {};

type Factory<M> = (options?: EmscriptenCodecOptions) => Promise<M>;

/** Instantiate an emscripten module once; a failed load is retried next time. */
export function lazyModule<M>(factory: Factory<M> | { default: Factory<M> }, wasmUrl: string) {
  // CJS interop: depending on the bundler the default import may be the
  // factory itself or the module object wrapping it.
  const make = typeof factory === 'function' ? factory : factory.default;
  let pending: Promise<M> | undefined;
  return () => {
    pending ??= make({ locateFile: () => wasmUrl, print: quiet, printErr: quiet }).catch((err: unknown) => {
      pending = undefined;
      throw err;
    });
    return pending;
  };
}

/** Run one decode on a fresh decoder and copy the result out of the WASM heap. */
export function runDecoder(decoder: EmscriptenDecoder, encoded: Uint8Array): CodecFrame {
  try {
    decoder.getEncodedBuffer(encoded.length).set(encoded);
    decoder.decode();
    const info = decoder.getFrameInfo();
    const decoded = decoder.getDecodedBuffer();
    const data = new Uint8Array(decoded.length);
    data.set(decoded);
    return {
      width: info.width,
      height: info.height,
      components: info.componentCount,
      bytesPerSample: info.bitsPerSample > 8 ? 2 : 1,
      bitsPerSample: info.bitsPerSample,
      signed: info.isSigned,
      data,
    };
  } finally {
    decoder.delete();
  }
}
