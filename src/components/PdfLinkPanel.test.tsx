import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { toast } from './ui/dialogs';
vi.mock('./ui/dialogs', () => ({ toast: vi.fn() }));
import { useInAppPdfLink } from './PdfLinkPanel';
import { createPdfDownloadLink } from '../utils/pdfDownloadLink';

vi.mock('../utils/pdfDownloadLink', () => ({ createPdfDownloadLink: vi.fn(), LINK_TTL_MINUTES: 10 }));

it('reset cancels an old link even when its upload finishes after a new link', async () => {
  let finishOld!: (url: string) => void;
  vi.mocked(createPdfDownloadLink).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce('https://example.test/new');
  const { result } = renderHook(() => useInAppPdfLink());
  let old!: Promise<void>;
  act(() => { old = result.current.start(new Blob(['old']), 'old.pdf'); });
  act(() => { result.current.reset(); });
  await act(async () => { await result.current.start(new Blob(['new']), 'new.pdf'); });
  await act(async () => { finishOld('https://example.test/old'); await old; });
  expect(result.current.state).toEqual({ url: 'https://example.test/new', filename: 'new.pdf' });
});

it('unmount cancels a pending link failure without showing an unrelated toast', async () => {
  let finish!: (url: null) => void;
  vi.mocked(createPdfDownloadLink).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, unmount } = renderHook(() => useInAppPdfLink());
  let pending!: Promise<void>;
  act(() => { pending = result.current.start(new Blob(['old']), 'old.pdf'); });
  unmount();
  await act(async () => { finish(null); await pending; });
  expect(toast).not.toHaveBeenCalled();
});
