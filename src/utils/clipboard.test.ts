import { vi } from 'vitest';
import { copyRichText } from './clipboard';

class FakeClipboardItem {
  constructor(public items: Record<string, Blob>) {}
  get types() { return Object.keys(this.items); }
}

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const realItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

describe('copyRichText', () => {
  afterEach(() => {
    if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard);
    else delete (navigator as { clipboard?: unknown }).clipboard;
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = realItem;
    vi.restoreAllMocks();
  });

  it('writes html and plain text as one clipboard item', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    setClipboard({ write, writeText: vi.fn() });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeClipboardItem;
    await expect(copyRichText('<p>a</p>', 'a', 'Copy')).resolves.toBe('rich');
    const [items] = write.mock.calls[0];
    expect(items).toHaveLength(1);
    expect(items[0].types.sort()).toEqual(['text/html', 'text/plain']);
  });

  it('falls back to plain text when ClipboardItem is missing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ write: vi.fn(), writeText });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = undefined;
    await expect(copyRichText('<p>a</p>', 'a', 'Copy')).resolves.toBe('plain');
    expect(writeText).toHaveBeenCalledWith('a');
  });

  it('falls back to plain text when the rich write is rejected', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ write: vi.fn().mockRejectedValue(new Error('denied')), writeText });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = FakeClipboardItem;
    await expect(copyRichText('<p>a</p>', 'a', 'Copy')).resolves.toBe('plain');
    expect(writeText).toHaveBeenCalledWith('a');
  });

  it('shows a prompt with the text when there is no clipboard', async () => {
    setClipboard(undefined);
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    await expect(copyRichText('<p>a</p>', 'a', 'Copy this')).resolves.toBe('prompt');
    expect(prompt).toHaveBeenCalledWith('Copy this', 'a');
  });
});
