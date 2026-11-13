import { vi, afterEach, beforeEach } from 'vitest';
import { savePdf, isInAppBrowser, downloadHint } from './savePdf';

const blob = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const FIREFOX_ANDROID = 'Mozilla/5.0 (Android 14; Mobile; rv:160.0) Gecko/160.0 Firefox/160.0';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36';

let clicked: HTMLAnchorElement[] = [];
let created: Blob[] = [];
function setDevice(ua: string, share?: (d: ShareData) => Promise<void>, canShare = false) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: share ? () => canShare : undefined, configurable: true });
}

beforeEach(() => {
  clicked = []; created = [];
  URL.createObjectURL = vi.fn((b: Blob) => { created.push(b); return 'blob:test'; }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this); });
});
afterEach(() => vi.restoreAllMocks());

test.each([['Chrome for Android', CHROME_ANDROID], ['Firefox for Android', FIREFOX_ANDROID], ['desktop', 'Mozilla/5.0 (Macintosh) Chrome/130']])(
  '%s gets a real file download, typed so the browser saves it instead of opening its PDF viewer',
  async (_name, ua) => {
    setDevice(ua, vi.fn(async () => {}), true);
    expect(await savePdf(blob, 'fluffy.pdf')).toBe('downloaded');
    expect(clicked[0].download).toBe('fluffy.pdf');
    expect(created[0].type).toBe('application/octet-stream');
    expect(created[0].size).toBe(blob.size);
  },
);

test('in-app browsers that can share files get the share sheet (blob downloads are dropped there)', async () => {
  const share = vi.fn(async () => {});
  setDevice(ANDROID_WEBVIEW, share, true);
  expect(await savePdf(blob, 'fluffy.pdf')).toBe('shared');
  const files = (share.mock.calls[0] as unknown as [ShareData])[0].files!;
  expect(files[0].name).toBe('fluffy.pdf');
  expect(files[0].type).toBe('application/pdf');
  expect(clicked).toHaveLength(0);
});

test('closing the share sheet does nothing more', async () => {
  setDevice(ANDROID_WEBVIEW, async () => { throw new DOMException('cancel', 'AbortError'); }, true);
  expect(await savePdf(blob, 'fluffy.pdf')).toBe('cancelled');
});

test('in-app browsers that can\'t share report it instead of silently doing nothing', async () => {
  setDevice(ANDROID_WEBVIEW);
  expect(await savePdf(blob, 'fluffy.pdf')).toBe('unsupported');
  expect(clicked).toHaveLength(0);
});

test('in-app browser detection', () => {
  expect(isInAppBrowser(ANDROID_WEBVIEW)).toBe(true);
  expect(isInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400]')).toBe(true);
  expect(isInAppBrowser(CHROME_ANDROID)).toBe(false);
  expect(isInAppBrowser(FIREFOX_ANDROID)).toBe(false);
});

test('a heads-up shows only where the browser won\'t simply save the file', () => {
  expect(downloadHint(FIREFOX_ANDROID)).toMatch(/tap Download at the top/);
  expect(downloadHint(ANDROID_WEBVIEW)).toMatch(/open ToothOps in Chrome/);
  expect(downloadHint(CHROME_ANDROID)).toBeNull();
  expect(downloadHint('Mozilla/5.0 (Macintosh) Firefox/140')).toBeNull();
});
