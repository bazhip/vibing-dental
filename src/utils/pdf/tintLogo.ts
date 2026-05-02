import { rgb } from 'pdf-lib';

/**
 * Recolor a (mostly monochrome) PNG so it reads as a tinted card: lighter
 * pixels become a soft tint background and darker pixels become the
 * "ink" color. Used to make the SoCal logo match whatever PDF style is
 * active — light primary-tint card with slate-900 type, sepia card with
 * dark-brown type, etc., echoing the look of the comment boxes.
 *
 * The blend treats per-pixel luminance as the ink amount, lerping from
 * `bg` toward `ink` by that amount. Anti-aliased edges are preserved.
 */
export async function tintLogoPng(
  bytes: ArrayBuffer | Uint8Array,
  bg: ReturnType<typeof rgb>,
  ink: ReturnType<typeof rgb>
): Promise<Uint8Array> {
  const buf = bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : bytes;
  const blob = new Blob([buf as BlobPart], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    const w = canvas.width;
    const h = canvas.height;

    // pdf-lib rgb() values are 0–1; canvas wants 0–255.
    const bgR  = bg.red   * 255, bgG  = bg.green  * 255, bgB  = bg.blue  * 255;
    const inkR = ink.red  * 255, inkG = ink.green * 255, inkB = ink.blue * 255;

    // Sample the corner pixels to figure out what counts as "background"
    // in this image — works regardless of whether the source PNG is
    // dark-ink-on-light-bg or the reverse.
    const cornerIndices = [
      0,
      (w - 1) * 4,
      (h - 1) * w * 4,
      ((h - 1) * w + (w - 1)) * 4,
    ];
    const lumOf = (i: number) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const bgLum =
      cornerIndices.reduce((sum, idx) => sum + lumOf(idx), 0) / cornerIndices.length;

    // The "ink" reference is whichever pixel is FARTHEST from bgLum in
    // luminance — that's the strongest stroke in the logo.
    let maxDist = 0;
    for (let i = 0; i < px.length; i += 4) {
      const dist = Math.abs(lumOf(i) - bgLum);
      if (dist > maxDist) maxDist = dist;
    }
    const denom = Math.max(maxDist, 1);

    // Smoothstep curve on the ink amount: pushes background pixels closer
    // to bg and stroke pixels closer to ink, removing the muddy mid-tones
    // that come out of a linear blend on a low-contrast source PNG.
    const smoothstep = (edge0: number, edge1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    for (let i = 0; i < px.length; i += 4) {
      const dist = Math.abs(lumOf(i) - bgLum);
      const linear = dist / denom;
      // Tuned so the lightest 15% maps to pure bg (no faint smudge across
      // empty space) and the darkest 25% maps to pure ink (crisp strokes).
      const inkAmount = smoothstep(0.15, 0.75, linear);
      px[i]     = bgR  * (1 - inkAmount) + inkR * inkAmount;
      px[i + 1] = bgG  * (1 - inkAmount) + inkG * inkAmount;
      px[i + 2] = bgB  * (1 - inkAmount) + inkB * inkAmount;
      // alpha untouched
    }

    ctx.putImageData(data, 0, 0);
    const outBlob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!outBlob) throw new Error('canvas.toBlob returned null');
    return new Uint8Array(await outBlob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = url;
  });
}
