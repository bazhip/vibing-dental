import type { ChartSnapshot } from '../../components/PdfPreviewModal';
import { TOOTH_DIAGRAMS } from '../../constants/toothShapes';
import { DEFAULT_PDF_STYLE_ID, resolvePdfStyle } from '../pdf/styles';
import { diagramSvgToPng } from '../svgToPng';

/** Height of the label strip above each diagram, in output pixels. */
export const LABEL_BAND_HEIGHT = 56;
/** Gap around and between the stacked sections, in output pixels. */
export const PICTURE_PADDING = 24;
const LABEL_FONT = '600 32px sans-serif';
const LABEL_COLOR = '#1b2733';
const BACKGROUND = '#ffffff';
const RENDER_SCALE = 2;

type PictureSnapshot = Pick<
  ChartSnapshot,
  'species' | 'preSvg' | 'postSvg' | 'preComments' | 'postComments'
>;

async function decodePng(bytes: Uint8Array): Promise<ImageBitmap | HTMLImageElement> {
  const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Pre-op chart above post-op chart, each under its (already translated)
 * label, on white, as one PNG data URL. Diagrams render exactly as in the
 * PDF (species size, crop bounds, scale 2, default style comment colours).
 */
export async function renderChartPicture(
  snap: PictureSnapshot,
  labels: { pre: string; post: string },
): Promise<string> {
  const { width, height, cropBounds } = TOOTH_DIAGRAMS[snap.species];
  const colors = resolvePdfStyle(DEFAULT_PDF_STYLE_ID).comment;
  const [prePng, postPng] = await Promise.all([
    diagramSvgToPng(snap.preSvg, width, height, snap.preComments, RENDER_SCALE, colors, cropBounds),
    diagramSvgToPng(snap.postSvg, width, height, snap.postComments, RENDER_SCALE, colors, cropBounds),
  ]);
  const [preImg, postImg] = await Promise.all([decodePng(prePng), decodePng(postPng)]);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(preImg.width, postImg.width);
  canvas.height =
    PICTURE_PADDING * 3 + 2 * LABEL_BAND_HEIGHT + preImg.height + postImg.height;
  const ctx = canvas.getContext('2d');
  // eslint-disable-next-line no-restricted-syntax -- dev-only: canvas unsupported, caller reports a translated failure
  if (!ctx) throw new Error('2D canvas unavailable');

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = LABEL_FONT;
  ctx.textBaseline = 'middle';

  let y = PICTURE_PADDING;
  for (const [label, img] of [[labels.pre, preImg], [labels.post, postImg]] as const) {
    ctx.fillText(label, PICTURE_PADDING, y + LABEL_BAND_HEIGHT / 2);
    y += LABEL_BAND_HEIGHT;
    ctx.drawImage(img, Math.round((canvas.width - img.width) / 2), y);
    y += img.height + PICTURE_PADDING;
  }
  return canvas.toDataURL('image/png');
}
