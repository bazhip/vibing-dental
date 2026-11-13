import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeApp } from './platform';

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
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Save a file: browser download on web, iOS share sheet in the native app. */
export async function saveFile(data: Uint8Array | Blob, filename: string, mime: string): Promise<void> {
  if (!isNativeApp()) {
    downloadViaAnchor(data, filename, mime);
    return;
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
    if (err instanceof Error && /cancel/i.test(err.message)) return;
    throw err;
  }
}
