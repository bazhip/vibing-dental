import { describe, it, expect, vi, beforeEach } from 'vitest';

const writeFile = vi.fn();
const share = vi.fn();
let native = false;

vi.mock('./platform', () => ({ isNativeApp: () => native }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (...a: unknown[]) => writeFile(...a) },
  Directory: { Cache: 'CACHE' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: (...a: unknown[]) => share(...a) } }));
const hapticSuccess = vi.fn();
vi.mock('./haptics', () => ({ hapticSuccess: () => hapticSuccess() }));

import { saveFile, saveChartPdf } from './saveFile';

describe('saveFile', () => {
  beforeEach(() => {
    writeFile.mockReset();
    share.mockReset();
    hapticSuccess.mockReset();
    native = false;
    (URL as any).createObjectURL = vi.fn(() => 'blob:x');
    (URL as any).revokeObjectURL = vi.fn();
  });

  it('web: clicks an anchor with download=filename', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('a.pdf');
      expect(this.href).toBe('blob:x');
    });
    await saveFile(new Uint8Array([1, 2]), 'a.pdf', 'application/pdf');
    expect(click).toHaveBeenCalledTimes(1);
    expect(writeFile).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('native: writes to cache then shares the written uri', async () => {
    native = true;
    writeFile.mockResolvedValue({ uri: 'file:///cache/a.pdf' });
    share.mockResolvedValue({});
    await expect(saveFile(new Uint8Array([104, 105]), 'a.pdf', 'application/pdf')).resolves.toBe(true);
    expect(writeFile).toHaveBeenCalledWith({ path: 'a.pdf', data: 'aGk=', directory: 'CACHE' });
    expect(share).toHaveBeenCalledWith({ files: ['file:///cache/a.pdf'], title: 'a.pdf' });
  });

  it('native: accepts a Blob', async () => {
    native = true;
    writeFile.mockResolvedValue({ uri: 'file:///c/t.txt' });
    share.mockResolvedValue({});
    await saveFile(new Blob(['hi']), 't.txt', 'text/plain');
    expect(writeFile.mock.calls[0][0].data).toBe('aGk=');
  });

  it('native: share cancel resolves quietly', async () => {
    native = true;
    writeFile.mockResolvedValue({ uri: 'file:///c/a.pdf' });
    share.mockRejectedValue(new Error('Share canceled'));
    await expect(saveFile(new Uint8Array([1]), 'a.pdf', 'application/pdf')).resolves.toBe(false);
  });

  it('native: other share errors throw', async () => {
    native = true;
    writeFile.mockResolvedValue({ uri: 'file:///c/a.pdf' });
    share.mockRejectedValue(new Error('boom'));
    await expect(saveFile(new Uint8Array([1]), 'a.pdf', 'application/pdf')).rejects.toThrow('boom');
  });
});

describe('saveChartPdf', () => {
  beforeEach(() => {
    writeFile.mockReset().mockResolvedValue({ uri: 'file:///c/a.pdf' });
    share.mockReset();
    hapticSuccess.mockReset();
    native = true;
  });

  it('buzzes after the PDF is saved', async () => {
    share.mockResolvedValue({});
    await saveChartPdf(new Uint8Array([1]), 'a.pdf');
    expect(share).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it('no buzz when the share sheet is dismissed', async () => {
    share.mockRejectedValue(new Error('Share canceled'));
    await saveChartPdf(new Uint8Array([1]), 'a.pdf');
    expect(hapticSuccess).not.toHaveBeenCalled();
  });

  it('no buzz when saving fails', async () => {
    share.mockRejectedValue(new Error('boom'));
    await expect(saveChartPdf(new Uint8Array([1]), 'a.pdf')).rejects.toThrow('boom');
    expect(hapticSuccess).not.toHaveBeenCalled();
  });
});
