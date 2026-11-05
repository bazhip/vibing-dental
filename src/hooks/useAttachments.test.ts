import { encodeUnderLimit, MAX_UPLOAD_BYTES } from './useAttachments';

// Fake encoder: output size scales with pixel area and quality, like JPEG.
const fakeEncoder = (fullSizeBytes: number) => {
  const calls: Array<[number, number]> = [];
  const encode = async (scale: number, quality: number) => {
    calls.push([scale, quality]);
    return new Blob([new Uint8Array(Math.round(fullSizeBytes * scale * scale * quality))]);
  };
  return { encode, calls };
};

describe('encodeUnderLimit', () => {
  it('caps uploads at 2 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
  });

  it('stops at the first quality that fits', async () => {
    const { encode, calls } = fakeEncoder(3 * 1024 * 1024); // 0.65 → ~1.95 MB
    const blob = await encodeUnderLimit(encode, MAX_UPLOAD_BYTES);
    expect(blob!.size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(calls).toEqual([[1, 0.85], [1, 0.75], [1, 0.65]]);
  });

  it('shrinks dimensions when quality alone is not enough', async () => {
    const { encode, calls } = fakeEncoder(20 * 1024 * 1024);
    const blob = await encodeUnderLimit(encode, MAX_UPLOAD_BYTES);
    expect(blob!.size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    expect(calls.at(-1)![0]).toBeLessThan(1);
  });

  it('returns null when an encode fails', async () => {
    expect(await encodeUnderLimit(async () => null, MAX_UPLOAD_BYTES)).toBeNull();
  });
});

import { thumbPathFor } from './useAttachments';

describe('thumbPathFor', () => {
  it('sits next to the original with a .thumb.jpg suffix', () => {
    expect(thumbPathFor('u1/c1/abc.png')).toBe('u1/c1/abc.thumb.jpg');
    expect(thumbPathFor('u1/c1/abc.jpg')).toBe('u1/c1/abc.thumb.jpg');
  });
});
