// Type declarations for the decoder packages, which ship none (or point
// at a missing file). Only the members this app uses are declared.

declare module 'jpeg-lossless-decoder-js' {
  export class Decoder {
    constructor(buffer?: ArrayBuffer, numBytes?: number);
    frame: { dimX: number; dimY: number; numComp: number; precision: number };
    decode(buffer: ArrayBuffer, offset: number, length: number, numBytes?: number): Uint8Array | Uint16Array;
  }
}

/** The emscripten module object shared by the cornerstone codecs. */
interface EmscriptenCodecOptions {
  locateFile?: (path: string, prefix: string) => string;
  wasmBinary?: ArrayBuffer | Uint8Array;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}

interface EmscriptenFrameInfo {
  width: number;
  height: number;
  bitsPerSample: number;
  componentCount: number;
  isSigned?: boolean;
}

interface EmscriptenDecoder {
  getEncodedBuffer(length: number): Uint8Array;
  getDecodedBuffer(): Uint8Array;
  decode(): void;
  getFrameInfo(): EmscriptenFrameInfo;
  delete(): void;
}

declare module '@cornerstonejs/codec-charls/decodewasmjs' {
  const factory: (options?: EmscriptenCodecOptions) => Promise<{ JpegLSDecoder: new () => EmscriptenDecoder }>;
  export default factory;
}

declare module '@cornerstonejs/codec-openjpeg/decodewasmjs' {
  const factory: (options?: EmscriptenCodecOptions) => Promise<{ J2KDecoder: new () => EmscriptenDecoder }>;
  export default factory;
}
