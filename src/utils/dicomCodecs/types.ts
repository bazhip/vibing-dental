/** A decoded frame as the codecs hand it back: interleaved samples,
 *  little-endian when two bytes wide. */
export interface CodecFrame {
  width: number;
  height: number;
  components: number;
  /** Bytes per sample in `data` (1 or 2). */
  bytesPerSample: 1 | 2;
  /** Significant bits per sample, as the codestream declares them. */
  bitsPerSample: number;
  /** True when the codestream says the samples are signed. */
  signed?: boolean;
  data: Uint8Array;
}
