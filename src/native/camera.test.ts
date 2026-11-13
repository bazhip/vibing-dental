import { describe, it, expect, vi, beforeEach } from 'vitest';

const getPhoto = vi.fn();
vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: (...a: unknown[]) => getPhoto(...a) },
  CameraSource: { Camera: 'CAMERA' },
  CameraResultType: { Uri: 'uri' },
}));

import { takePhoto } from './camera';

describe('takePhoto', () => {
  beforeEach(() => {
    getPhoto.mockReset();
    vi.restoreAllMocks();
  });

  it('returns a jpeg File from the captured webPath', async () => {
    getPhoto.mockResolvedValue({ webPath: 'capacitor://localhost/_capacitor_file_/x.jpeg' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['abc'], { type: 'image/jpeg' }) });
    vi.stubGlobal('fetch', fetchMock);
    const file = await takePhoto();
    expect(getPhoto).toHaveBeenCalledWith({ source: 'CAMERA', resultType: 'uri', quality: 90 });
    expect(fetchMock).toHaveBeenCalledWith('capacitor://localhost/_capacitor_file_/x.jpeg');
    expect(file).toBeInstanceOf(File);
    expect(file!.type).toBe('image/jpeg');
    expect(file!.name).toMatch(/^photo-\d+\.jpeg$/);
  });

  it('throws when the camera returns no file path', async () => {
    getPhoto.mockResolvedValue({});
    await expect(takePhoto()).rejects.toThrow(/photo/i);
  });

  it('throws when the photo cannot be read back', async () => {
    getPhoto.mockResolvedValue({ webPath: 'capacitor://localhost/_capacitor_file_/x.jpeg' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, blob: async () => new Blob([]) }));
    await expect(takePhoto()).rejects.toThrow(/photo/i);
  });

  it('returns null when the user cancels', async () => {
    getPhoto.mockRejectedValue(new Error('User cancelled photos app'));
    expect(await takePhoto()).toBeNull();
  });

  it('rethrows other errors', async () => {
    getPhoto.mockRejectedValue(new Error('Camera access denied'));
    await expect(takePhoto()).rejects.toThrow('denied');
  });
});
