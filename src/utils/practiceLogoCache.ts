import { readJson, removeKey, writeJson } from './storage';

const KEY = 'practice.logo';
const VERSION = 1;
const MAX_IMAGE_BYTES = 256 * 1024;
const MAX_URL_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 32;
const IMAGE_PREFIX = /^data:image\/(png|jpeg);base64,/;

interface CachedLogo { userId: string; path: string; dataUrl: string }

export function readPracticeLogo(userId: string): CachedLogo | null {
  const entry = readJson<CachedLogo | null>(KEY, VERSION, null);
  return entry?.userId === userId && typeof entry.path === 'string' &&
    typeof entry.dataUrl === 'string' && entry.dataUrl.length <= MAX_URL_LENGTH &&
    IMAGE_PREFIX.test(entry.dataUrl) ? entry : null;
}

export function cachePracticeLogo(userId: string, path: string, dataUrl: string): void {
  if (IMAGE_PREFIX.test(dataUrl) && dataUrl.length <= MAX_URL_LENGTH) {
    writeJson(KEY, VERSION, { userId, path, dataUrl });
  }
}

export function clearPracticeLogoCache(userId?: string): void {
  if (!userId || readPracticeLogo(userId)) removeKey(KEY, VERSION);
}

export async function logoDataUrl(blob: Blob): Promise<string> {
  if (!blob.size || blob.size > MAX_IMAGE_BYTES || !['image/png', 'image/jpeg'].includes(blob.type)) return '';
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reader.onabort = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

/** Decode locally for PDF exports. The page's connect-src policy applies
 * to fetch(), including fetches of data URLs. */
export async function loadPracticeLogoBytes(url: string): Promise<ArrayBuffer | null> {
  const prefix = IMAGE_PREFIX.exec(url)?.[0];
  if (prefix) return Uint8Array.from(atob(url.slice(prefix.length)), byte => byte.charCodeAt(0)).buffer;
  const response = await fetch(url);
  return response.ok ? response.arrayBuffer() : null;
}
