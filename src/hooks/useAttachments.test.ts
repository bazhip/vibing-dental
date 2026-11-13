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

import { thumbPathFor, isDicomFile } from './useAttachments';

describe('thumbPathFor', () => {
  it('sits next to the original with a .thumb.jpg suffix', () => {
    expect(thumbPathFor('u1/c1/abc.png')).toBe('u1/c1/abc.thumb.jpg');
    expect(thumbPathFor('u1/c1/abc.jpg')).toBe('u1/c1/abc.thumb.jpg');
  });
});

describe('isDicomFile', () => {
  const dicomBytes = () => {
    const b = new Uint8Array(200);
    b.set([0x44, 0x49, 0x43, 0x4d], 128); // "DICM"
    return b;
  };

  it('accepts .dcm by name and application/dicom by type', async () => {
    expect(await isDicomFile(new File([new Uint8Array(10)], 'IMG.DCM'))).toBe(true);
    expect(await isDicomFile(new File([new Uint8Array(10)], 'x', { type: 'application/dicom' }))).toBe(true);
  });

  it('sniffs extensionless sensor exports by the DICM magic', async () => {
    expect(await isDicomFile(new File([dicomBytes()], 'IM000001'))).toBe(true);
    expect(await isDicomFile(new File([new Uint8Array(200)], 'IM000001'))).toBe(false);
  });

  it('never treats a typed image as DICOM', async () => {
    expect(await isDicomFile(new File([dicomBytes()], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false);
  });
});

import { uploadRejection } from './useAttachments';

describe('uploadRejection', () => {
  const ok = { dicom: false, type: 'image/png', size: 1000, count: 0, maxImages: 10, dicomEnabled: false, native: false };

  it('accepts a valid image', () => {
    expect(uploadRejection(ok)).toBeNull();
  });

  it('states the image limit as a plain fact on both platforms', () => {
    expect(uploadRejection({ ...ok, count: 10 })).toBe('This chart has reached its 10-image limit.');
    expect(uploadRejection({ ...ok, count: 10, native: true })).toBe('This chart has reached its 10-image limit.');
  });

  it('DICOM without access: plan wording on the web, a neutral fact in the app', () => {
    expect(uploadRejection({ ...ok, dicom: true })).toBe(
      'DICOM uploads are included on paid plans. Export the radiograph as a JPEG or PNG to add it on the free plan.'
    );
    const app = uploadRejection({ ...ok, dicom: true, native: true });
    expect(app).toBe("DICOM uploads aren't available on this account. Export the radiograph as a JPEG or PNG to add it.");
    expect(app).not.toMatch(/plan/i);
  });
});
