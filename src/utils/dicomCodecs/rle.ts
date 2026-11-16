/**
 * RLE Lossless (1.2.840.10008.1.2.5), DICOM PS3.5 Annex G.
 *
 * A frame is a 64-byte header (segment count, then up to 15 segment
 * offsets) followed by PackBits-encoded segments: one per byte of each
 * sample, most significant byte first, sample planes in order.
 */

/** Decode one RLE frame into planar samples (all of sample 0, then
 *  sample 1, …), each little-endian when two bytes wide. Returns null
 *  when the header doesn't describe this image. Short segments leave
 *  the rest of their plane zero. */
export function decodeRle(
  frame: Uint8Array,
  width: number,
  height: number,
  samples: number,
  bytesPerSample: 1 | 2
): Uint8Array | null {
  if (frame.byteLength < 64) return null;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const segments = view.getUint32(0, true);
  if (segments !== samples * bytesPerSample || segments > 15) return null;
  const offsets: number[] = [];
  for (let s = 0; s < segments; s++) offsets.push(view.getUint32(4 + s * 4, true));
  for (let s = 0; s < segments; s++) {
    if (offsets[s] < 64 || offsets[s] > frame.byteLength) return null;
  }

  const n = width * height;
  const out = new Uint8Array(n * samples * bytesPerSample);
  for (let s = 0; s < segments; s++) {
    const sample = Math.floor(s / bytesPerSample);
    // Segment 0 of a sample is its most significant byte.
    const byteInSample = bytesPerSample - 1 - (s % bytesPerSample);
    const base = sample * n * bytesPerSample + byteInSample;
    const end = s + 1 < segments ? Math.min(offsets[s + 1], frame.byteLength) : frame.byteLength;
    let p = offsets[s];
    let i = 0;
    while (p < end && i < n) {
      const header = frame[p++];
      if (header < 128) {
        // Literal run of header + 1 bytes.
        const count = Math.min(header + 1, n - i, end - p);
        for (let k = 0; k < count; k++) out[base + (i + k) * bytesPerSample] = frame[p + k];
        p += header + 1;
        i += count;
      } else if (header > 128) {
        // Replicate the next byte 257 - header times.
        if (p >= end) break;
        const value = frame[p++];
        const count = Math.min(257 - header, n - i);
        for (let k = 0; k < count; k++) out[base + (i + k) * bytesPerSample] = value;
        i += count;
      }
      // 128 is a no-op.
    }
  }
  return out;
}
