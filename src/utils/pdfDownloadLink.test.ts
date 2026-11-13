import { vi, beforeEach } from 'vitest';

const upload = vi.fn();
const createSignedUrl = vi.fn();
const getSession = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: { auth: { getSession: () => getSession() }, storage: { from: (b: string) => ({ upload: (...a: unknown[]) => upload(b, ...a), createSignedUrl: (...a: unknown[]) => createSignedUrl(b, ...a) }) } },
  cloudEnabled: true,
}));
import { createPdfDownloadLink, LINK_TTL_MINUTES } from './pdfDownloadLink';

const blob = new Blob(['%PDF'], { type: 'application/pdf' });
beforeEach(() => { upload.mockReset(); createSignedUrl.mockReset(); getSession.mockReset(); });

test('uploads to the user\'s own folder (one file, overwritten) and returns a short-lived link that downloads under the chart\'s name', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  upload.mockResolvedValue({ error: null });
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/sign/exports/u1/download.pdf?token=t&download=fluffy.pdf' }, error: null });
  expect(await createPdfDownloadLink(blob, 'fluffy.pdf')).toMatch(/^https:\/\//);
  expect(upload).toHaveBeenCalledWith('exports', 'u1/download.pdf', blob, { contentType: 'application/pdf', upsert: true });
  expect(createSignedUrl).toHaveBeenCalledWith('exports', 'u1/download.pdf', LINK_TTL_MINUTES * 60, { download: 'fluffy.pdf' });
});

test('no signed-in account (trial) → no link, nothing uploaded', async () => {
  getSession.mockResolvedValue({ data: { session: null } });
  expect(await createPdfDownloadLink(blob, 'fluffy.pdf')).toBeNull();
  expect(upload).not.toHaveBeenCalled();
});

test('a failed upload → no link', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  upload.mockResolvedValue({ error: new Error('bucket not found') });
  expect(await createPdfDownloadLink(blob, 'fluffy.pdf')).toBeNull();
  expect(createSignedUrl).not.toHaveBeenCalled();
});
