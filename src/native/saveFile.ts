import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeApp } from './platform';
import { hapticSuccess } from './haptics';

async function toBytes(data: Uint8Array | Blob): Promise<Uint8Array> {
  return data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function downloadViaAnchor(data: Uint8Array | Blob, filename: string, mime: string): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Some browsers (Safari, Firefox) start the download after click()
  // returns; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Save a file: browser download on web, iOS share sheet in the native app.
 *  Resolves true once saved/shared, false when the share sheet was
 *  dismissed (not an error); rejects on real failures. */
export async function saveFile(data: Uint8Array | Blob, filename: string, mime: string): Promise<boolean> {
  if (!isNativeApp()) {
    downloadViaAnchor(data, filename, mime);
    return true;
  }
  const bytes = await toBytes(data);
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: toBase64(bytes),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ files: [uri], title: filename });
  } catch (err) {
    // Dismissing the share sheet is not an error.
    if (err instanceof Error && /cancel/i.test(err.message)) return false;
    throw err;
  } finally {
    // The share sheet has closed (wherever it went has its own copy): don't
    // leave a patient PDF lying in the app's cache.
    await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => undefined);
  }
  return true;
}

/** Save a chart PDF, with a success haptic in the app once it's saved
 *  (not when the share sheet is dismissed or saving fails). */
export async function saveChartPdf(data: Uint8Array | Blob, filename: string): Promise<void> {
  if (await saveFile(data, filename, 'application/pdf')) hapticSuccess();
}
