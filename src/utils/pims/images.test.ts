// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { encodeImagePng, imageHeader, prepareImage, prepareImageTransfer, revalidateImage, renderSavedImage, type ImageStore, type SavedImage } from './images';

const attachment: SavedImage = { id: 'image-1', chart_id: 'chart-1', path: 'owner/chart-1/photo.png', caption: 'Left side', kind: 'xray', original_path: null };
const source = { chart_id: 'chart-1', hash: 'a'.repeat(64), patient_name: 'Milo', patient_number: 'P-1' };
function png(width = 20, height = 10): Blob {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const data = new DataView(bytes.buffer);
  data.setUint32(16, width); data.setUint32(20, height);
  return new Blob([bytes], { type: 'image/png' });
}
function fixture() {
  const store: ImageStore = {
    context: vi.fn(async () => ({ ...source })),
    list: vi.fn(async () => [{ ...attachment }]),
    read: vi.fn(async () => ({ ...attachment })),
    download: vi.fn(async () => png()),
  };
  const decode = vi.fn(async () => ({ width: 20, height: 10 }));
  return { store, decode };
}
describe('saved image preparation', () => {
  it.each(['image/jpeg', 'image/webp'])('converts %s at its original dimensions and releases the bitmap', async (mime) => {
    const bitmap = { width: 20, height: 10, close: vi.fn() };
    const drawImage = vi.fn(); const output = png();
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ({ drawImage })), toBlob: vi.fn((done: (blob: Blob | null) => void) => done(output)) };
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
    try {
      expect(await encodeImagePng(new Blob(['source'], { type: mime }))).toBe(output);
      expect(canvas).toMatchObject({ width: 20, height: 10 });
      expect(drawImage).toHaveBeenCalledExactlyOnceWith(bitmap, 0, 0);
      expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
      expect(bitmap.close).toHaveBeenCalledOnce();
      canvas.toBlob.mockImplementationOnce(done => done(null));
      await expect(encodeImagePng(new Blob(['source'], { type: mime }))).rejects.toMatchObject({ code: 'invalid' });
      expect(bitmap.close).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });
  it('renders reviewed saved bytes as a bounded PNG for the existing image writer', async () => {
    const { store, decode } = fixture();
    const prepared = await prepareImage(store, 'chart-1', 'image-1', decode);
    const encode = vi.fn(async (blob: Blob) => blob);
    const reviewed = await prepareImageTransfer(store, prepared, () => true, decode, encode);
    expect(await renderSavedImage(store, reviewed, () => true, decode)).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(encode).toHaveBeenCalledOnce();
    expect(store.download).toHaveBeenCalledTimes(5);
  });
  it('sends exactly the converted artifact previewed, without converting again', async () => {
    const { store, decode } = fixture();
    const prepared = await prepareImage(store, 'chart-1', 'image-1', decode);
    const bytes = new Uint8Array(await png().arrayBuffer()); bytes[32] = 9;
    const output = new Blob([bytes], { type: 'image/png' });
    const encode = vi.fn(async () => output);
    const reviewed = await prepareImageTransfer(store, prepared, () => true, decode, encode);
    expect(reviewed.transfer.blob).toBe(output);
    expect(reviewed.transfer.contentHash).not.toBe(prepared.contentHash);
    expect(await renderSavedImage(store, reviewed, () => true, decode)).toBe(`data:image/png;base64,${Buffer.from(await output.arrayBuffer()).toString('base64')}`);
    expect(encode).toHaveBeenCalledOnce();
    await expect(renderSavedImage(store, prepared, () => true, decode)).rejects.toMatchObject({ code: 'invalid' });
    await expect(renderSavedImage(store, { ...reviewed, transfer: { ...reviewed.transfer, contentHash: '0'.repeat(64) } }, () => true, decode)).rejects.toMatchObject({ code: 'stale' });
  });
  it('refuses changed source or lost authorization during image conversion', async () => {
    const { store, decode } = fixture();
    const prepared = await prepareImage(store, 'chart-1', 'image-1', decode);
    const encode = vi.fn(async (blob: Blob) => {
      vi.mocked(store.context).mockResolvedValue({ ...source, hash: 'b'.repeat(64) });
      return blob;
    });
    await expect(prepareImageTransfer(store, prepared, () => true, decode, encode)).rejects.toMatchObject({ code: 'stale' });
    await expect(prepareImageTransfer(store, prepared, () => false, decode, encode)).rejects.toMatchObject({ code: 'stale' });
    expect(encode).toHaveBeenCalledOnce();
  });
  it('rejects resized, wrong-format or oversized converted images', async () => {
    const { store, decode } = fixture();
    const prepared = await prepareImage(store, 'chart-1', 'image-1', decode);
    for (const output of [png(10, 10), new Blob(['bad'], { type: 'image/jpeg' }), new Blob([new Uint8Array(2097153)], { type: 'image/png' })]) {
      await expect(prepareImageTransfer(store, prepared, () => true, decode, async () => output)).rejects.toMatchObject({ code: 'invalid' });
    }
  });
  it('downloads only the selected full-size storage object and binds bytes to the saved chart', async () => {
    const { store, decode } = fixture();
    const result = await prepareImage(store, 'chart-1', 'image-1', decode);
    expect(store.download).toHaveBeenCalledExactlyOnceWith('owner/chart-1/photo.png');
    expect(result).toMatchObject({ image: attachment, source, width: 20, height: 10, extension: 'png' });
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(store.context).toHaveBeenCalledTimes(2);
    expect(store.read).toHaveBeenCalledTimes(2);
  });
  it('rejects a source change during download', async () => {
    const { store, decode } = fixture();
    vi.mocked(store.context).mockResolvedValueOnce(source).mockResolvedValue({ ...source, hash: 'b'.repeat(64) });
    await expect(prepareImage(store, 'chart-1', 'image-1', decode)).rejects.toMatchObject({ code: 'stale' });
  });
  it('rejects attachment deletion, relinking or metadata changes during preparation', async () => {
    for (const changed of [null, { ...attachment, chart_id: 'other' }, { ...attachment, caption: 'Different' }]) {
      const { store, decode } = fixture();
      vi.mocked(store.read).mockResolvedValueOnce(attachment).mockResolvedValue(changed);
      await expect(prepareImage(store, 'chart-1', 'image-1', decode)).rejects.toMatchObject({ code: 'stale' });
    }
  });
  it('rejects revoked access after downloading without returning bytes', async () => {
    const { store, decode } = fixture();
    vi.mocked(store.context).mockResolvedValueOnce(source).mockRejectedValue({ code: 'forbidden' });
    await expect(prepareImage(store, 'chart-1', 'image-1', decode)).rejects.toMatchObject({ code: 'forbidden' });
  });
  it('never requests a URL, traversal, thumbnail or original DICOM path', async () => {
    for (const path of ['https://attacker.test/file.png', '../file.png', 'owner/thumb.png', 'owner/original.dcm']) {
      const { store, decode } = fixture();
      vi.mocked(store.read).mockResolvedValue({ ...attachment, path, original_path: path.endsWith('.dcm') ? path : null });
      await expect(prepareImage(store, 'chart-1', 'image-1', decode)).rejects.toMatchObject({ code: 'invalid' });
      expect(store.download).not.toHaveBeenCalled();
    }
  });
  it('marks DICOM-derived previews without downloading the original', async () => {
    const { store, decode } = fixture();
    vi.mocked(store.read).mockResolvedValue({ ...attachment, original_path: 'owner/chart-1/original.dcm' });
    const prepared = await prepareImage(store, 'chart-1', 'image-1', decode);
    expect(prepared.dicomPreview).toBe(true);
    expect(store.download).toHaveBeenCalledExactlyOnceWith(attachment.path);
  });
  it('rejects MIME spoofing, oversized files and excessive dimensions before decode', async () => {
    for (const blob of [new Blob(['<svg/>'], { type: 'image/png' }), new Blob([await png().arrayBuffer()], { type: 'image/jpeg' }), new Blob([new Uint8Array(2097153)], { type: 'image/png' }), png(100000, 100000)]) {
      const { store, decode } = fixture();
      vi.mocked(store.download).mockResolvedValue(blob);
      await expect(prepareImage(store, 'chart-1', 'image-1', decode)).rejects.toMatchObject({ code: 'invalid' });
      expect(decode).not.toHaveBeenCalled();
    }
  });
  it('rejects corrupt decode or dimensions inconsistent with the header', async () => {
    const { store, decode } = fixture();
    decode.mockRejectedValueOnce(new TypeError());
    await expect(prepareImage(store, 'chart-1', 'image-1', decode)).rejects.toMatchObject({ code: 'invalid' });
    decode.mockResolvedValueOnce({ width: 10, height: 20 });
    await expect(prepareImage(store, 'chart-1', 'image-1', decode)).rejects.toMatchObject({ code: 'invalid' });
  });
  it('rechecks content before export and refuses overwritten storage bytes', async () => {
    const { store, decode } = fixture();
    const prepared = await prepareImage(store, 'chart-1', 'image-1', decode);
    expect(await revalidateImage(store, prepared, decode)).toMatchObject({ contentHash: prepared.contentHash });
    const changed = new Uint8Array(await png().arrayBuffer()); changed[32] = 1;
    vi.mocked(store.download).mockResolvedValue(new Blob([changed], { type: 'image/png' }));
    await expect(revalidateImage(store, prepared, decode)).rejects.toMatchObject({ code: 'stale' });
  });
});
describe('bounded image headers', () => {
  it('recognizes JPEG frame dimensions', () => {
    const bytes = new Uint8Array([255,216,255,192,0,17,8,0,10,0,20,3,1,17,0,2,17,0,3,17,0,255,217,0]);
    expect(imageHeader(bytes, 'image/jpeg')).toEqual({ width: 20, height: 10, extension: 'jpg' });
  });
  it('recognizes WebP extended dimensions and rejects animation', () => {
    const bytes = new Uint8Array(30);
    bytes.set(new TextEncoder().encode('RIFF')); bytes[4] = 22;
    bytes.set(new TextEncoder().encode('WEBPVP8X'), 8); bytes[16] = 10;
    bytes[24] = 19; bytes[27] = 9;
    expect(imageHeader(bytes, 'image/webp')).toEqual({ width: 20, height: 10, extension: 'webp' });
    bytes[20] = 2;
    expect(() => imageHeader(bytes, 'image/webp')).toThrow();
  });
});

it('rejects source changes while reviewed PNG bytes are being decoded', async () => {
  const { store, decode } = fixture();
  const prepared = await prepareImage(store, 'chart-1', 'image-1', decode);
  const reviewed = await prepareImageTransfer(store, prepared, () => true, decode);
  let calls = 0;
  decode.mockImplementation(async () => {
    if (++calls === 2) vi.mocked(store.context).mockResolvedValue({ ...source, hash: 'b'.repeat(64) });
    return { width: 20, height: 10 };
  });
  await expect(renderSavedImage(store, reviewed, () => true, decode)).rejects.toMatchObject({ code: 'stale' });
});
