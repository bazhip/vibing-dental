/**
 * Fetch an image URL (e.g. a signed attachment URL) and re-encode it as a
 * JPEG no larger than `maxEdge` on its longest side, on a white matte so
 * transparent PNGs don't go black. Returns null on any failure — callers
 * decide whether a missing image is fatal.
 */
export async function fetchAsJpeg(
  url: string,
  maxEdge: number,
  quality = 0.82
): Promise<Uint8Array | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality)
    );
    return jpeg ? new Uint8Array(await jpeg.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
