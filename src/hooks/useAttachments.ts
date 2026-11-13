import React from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { DICOM_MIME, DicomError, hasDicomMagic, looksLikeDicomName } from '../utils/dicomSniff';
import { isNativeApp } from '../native/platform';
import i18n from '../i18n';

/**
 * Photos and radiographs pinned to the active chart. Files live in the
 * private `attachments` storage bucket (owner-folder-scoped); this hook
 * lists/uploads/updates/deletes the rows and hands back short-lived
 * signed URLs for display. Cloud-only — trial/standalone charts have no
 * account to scope storage to, so the Imaging section hides itself.
 *
 * DICOM radiographs (paid plans only): the original .dcm is stored
 * untouched at `original_path`, and `path` holds a rendered PNG/JPEG
 * preview — so the grid, PDF and owner report never need to know the
 * image came from DICOM.
 */

export type AttachmentKind = 'photo' | 'xray';

export interface Attachment {
  id: string;
  chartId: string;
  path: string;
  caption: string;
  kind: AttachmentKind;
  toothTriadan: number | null;
  createdAt: string;
  /** Signed URL of the full image; refreshed on load, may expire. */
  url: string;
  /** Signed URL of the small grid thumbnail. Falls back to `url` for
   *  images uploaded before thumbnails existed. */
  thumbUrl: string;
  /** Storage path of the original DICOM file, when uploaded as DICOM. */
  originalPath: string | null;
  /** Signed download URL of the original DICOM file ('' if none). */
  originalUrl: string;
}

export interface UseAttachmentsReturn {
  enabled: boolean;
  loaded: boolean;
  items: Attachment[];
  /** Max images allowed on one chart (UI shows the count against it). */
  maxImages: number;
  /** Whether DICOM uploads are allowed on the current plan. */
  dicomEnabled: boolean;
  upload: (file: File, kind: AttachmentKind, caption: string) => Promise<void>;
  updateCaption: (id: string, caption: string) => Promise<void>;
  /** Relabel an image as a photo or a radiograph. */
  updateKind: (id: string, kind: AttachmentKind) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

// Upload limits. Kept together and easy to relocate: when per-practice
// tuning is needed, these become columns on `practices` set from the
// admin panel and read here via practiceId. For now they're sensible
// fixed defaults.
const ATTACHMENT_LIMITS = {
  /** Absolute reject ceiling for the ORIGINAL file (before shrinking).
   *  Also the cap on stored DICOM originals, which are never shrunk —
   *  keep the bucket's file_size_limit at least this large. */
  hardMaxBytes: 40 * 1024 * 1024,
  /** Nothing larger than this is ever uploaded — keeps storage and
   *  egress inside the Supabase free tier as long as possible. */
  maxUploadBytes: 2 * 1024 * 1024,
  /** Longest edge of every stored image — plenty for photos and rads,
   *  and the PDF prints at most ~5in wide. */
  maxDimension: 2000,
  /** Longest edge of the grid thumbnail (≈200 CSS px at 2× density). */
  thumbDimension: 400,
  /** Max images pinned to a single chart. */
  maxPerChart: 30,
};

export const MAX_UPLOAD_BYTES = ATTACHMENT_LIMITS.maxUploadBytes;

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Why an upload can't go ahead, or null when it can. In the iOS app the
 * DICOM message states the fact without plan wording (the app sells
 * nothing); the web keeps its free/paid-plan explanation.
 */
export function uploadRejection(u: {
  dicom: boolean;
  type: string;
  size: number;
  count: number;
  maxImages: number;
  dicomEnabled: boolean;
  native: boolean;
}): string | null {
  if (u.dicom && !u.dicomEnabled) {
    return u.native
      ? i18n.t('chart:imaging.dicomUnavailable')
      : 'DICOM uploads are included on paid plans. Export the radiograph as a JPEG or PNG to add it on the free plan.';
  }
  if (!u.dicom && !ALLOWED.includes(u.type)) {
    return u.dicomEnabled ? 'Use a PNG, JPEG, WEBP or DICOM image.' : 'Use a PNG, JPEG, or WEBP image.';
  }
  if (u.count >= u.maxImages) {
    return u.native
      ? i18n.t('chart:imaging.limitReached', { count: u.maxImages })
      : `This chart already has the maximum of ${u.maxImages} images. Delete one to add another.`;
  }
  if (u.size > ATTACHMENT_LIMITS.hardMaxBytes) {
    return `That image is too large (over ${Math.round(ATTACHMENT_LIMITS.hardMaxBytes / 1024 / 1024)} MB). Use a smaller file.`;
  }
  return null;
}

const SIGN_TTL = 60 * 60; // 1 hour

function extFor(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

/** Quality steps tried at each size before shrinking the dimensions. */
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55];
/** Each size pass shrinks both edges to this fraction of the last. */
const SHRINK_STEP = 0.75;
const MAX_SIZE_PASSES = 8;

/** Find an encoding under `maxBytes`: step JPEG quality down at full
 *  size, then shrink the dimensions and try again. `encode(scale, q)`
 *  renders at `scale` (1 = the starting size). Null if nothing fits or
 *  an encode fails. Exported for tests — the real encoder needs canvas. */
export async function encodeUnderLimit(
  encode: (scale: number, quality: number) => Promise<Blob | null>,
  maxBytes: number
): Promise<Blob | null> {
  let scale = 1;
  for (let pass = 0; pass < MAX_SIZE_PASSES; pass++) {
    for (const quality of QUALITY_STEPS) {
      const blob = await encode(scale, quality);
      if (!blob) return null;
      if (blob.size <= maxBytes) return blob;
    }
    scale *= SHRINK_STEP;
  }
  return null;
}

/** Thumbnail path for a stored image: sits next to the original, so it
 *  inherits the same storage access rules and needs no extra column. */
export function thumbPathFor(path: string): string {
  return path.replace(/\.[^./]+$/, '') + '.thumb.jpg';
}

/** Whether a picked file is DICOM: by name/MIME, or — for the
 *  extensionless files sensor software often exports — by the "DICM"
 *  magic. Only sniffs files the browser doesn't already type as images. */
export async function isDicomFile(file: File): Promise<boolean> {
  if (looksLikeDicomName(file)) return true;
  if (ALLOWED.includes(file.type) || file.size < 132) return false;
  const head = new Uint8Array(await file.slice(0, 132).arrayBuffer());
  return hasDicomMagic(head);
}

/** Render a DICOM file to a PNG preview File for the normal pipeline.
 *  The decoder (and dicom-parser) load only when needed. */
async function dicomPreview(file: File): Promise<File> {
  const { renderDicomPreview } = await import('../utils/dicom');
  let blob: Blob;
  try {
    blob = await renderDicomPreview(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof DicomError) throw err;
    throw new Error("Couldn't read that DICOM file.");
  }
  const base = file.name.replace(/\.[^.]+$/, '') || 'radiograph';
  const ext = blob.type === 'image/jpeg' ? 'jpg' : 'png';
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

function decodeImage(file: File): Promise<HTMLImageElement | null> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  return new Promise<HTMLImageElement | null>((resolve) => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

/** Draw `img` at `w`×`h` on a white matte (so transparent PNGs don't
 *  turn black as JPEG) and return a JPEG encoder bound to that canvas. */
function rasterize(img: HTMLImageElement, w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return (quality: number) =>
    new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', quality));
}

/**
 * Turn a picked file into what gets stored: the main image (at most
 * maxUploadBytes and maxDimension) plus a small grid thumbnail.
 *
 * A file already within both limits uploads untouched (keeps small PNG
 * radiographs lossless); anything bigger is re-encoded as JPEG, stepping
 * quality and then size down until it fits. Throws rather than ever
 * uploading an oversized original. The thumbnail is best-effort — null
 * if the browser can't make one, and the grid falls back to the full
 * image.
 */
async function prepareUpload(file: File): Promise<{ main: File; thumb: Blob | null }> {
  const { maxUploadBytes: maxBytes, maxDimension, thumbDimension } = ATTACHMENT_LIMITS;
  const img = await decodeImage(file);
  if (!img) {
    if (file.size <= maxBytes) return { main: file, thumb: null };
    throw new Error("Couldn't read that image to shrink it. Try saving it as a JPEG first.");
  }
  const longest = Math.max(img.width, img.height);

  const thumbScale = Math.min(1, thumbDimension / longest);
  const thumbEncode = rasterize(img, img.width * thumbScale, img.height * thumbScale);
  const thumb = thumbEncode ? await thumbEncode(0.7) : null;

  if (file.size <= maxBytes && longest <= maxDimension) return { main: file, thumb };

  const baseScale = Math.min(1, maxDimension / longest);
  let current: { scale: number; encode: (q: number) => Promise<Blob | null> } | null = null;
  const encode = (scale: number, quality: number) => {
    if (!current || current.scale !== scale) {
      const enc = rasterize(img, img.width * baseScale * scale, img.height * baseScale * scale);
      if (!enc) return Promise.resolve(null);
      current = { scale, encode: enc };
    }
    return current.encode(quality);
  };
  const blob = await encodeUnderLimit(encode, maxBytes);
  if (!blob) {
    throw new Error(
      `Couldn't shrink that image under ${Math.round(maxBytes / 1024 / 1024)} MB. Try a smaller file.`
    );
  }
  const base = file.name.replace(/\.[^.]+$/, '') || 'image';
  return { main: new File([blob], `${base}.jpg`, { type: 'image/jpeg' }), thumb };
}

interface AttachmentRow {
  id: string;
  chart_id: string;
  path: string;
  caption: string | null;
  kind: string | null;
  tooth_triadan: number | null;
  created_at: string;
  original_path?: string | null;
}

/** Sign a batch of storage paths for display (or download). */
async function signAll(
  rows: { path: string }[],
  options?: { download: boolean }
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!supabase || rows.length === 0) return map;
  const paths = rows.map((r) => r.path);
  const { data } = await supabase.storage.from('attachments').createSignedUrls(paths, SIGN_TTL, options);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

/** One-shot fetch of a chart's attachments (oldest first) with fresh
 *  signed URLs. Null when cloud is off, there's no chart, or the query
 *  fails. Used by the hook and by the PDF preview, which needs a fresh
 *  list each time it opens. */
export async function listChartAttachments(chartId: string): Promise<Attachment[] | null> {
  if (!supabase || !chartId) return null;
  const query = (cols: string) =>
    supabase!
      .from('attachments')
      .select(cols)
      .eq('chart_id', chartId)
      .order('created_at', { ascending: true });
  const base = 'id, chart_id, path, caption, kind, tooth_triadan, created_at';
  // original_path ships via migration; a database without it degrades to
  // "no DICOM originals" rather than losing every image.
  let { data, error } = await query(`${base}, original_path`);
  if (error) ({ data, error } = await query(base));
  if (error) return null;
  const rows = (data ?? []) as unknown as AttachmentRow[];
  const originals = rows.filter((r) => r.original_path).map((r) => ({ path: r.original_path as string }));
  // Separate signing call for thumbnails: older images have none, and a
  // missing thumbnail must never cost the full image its URL.
  const [signed, signedThumbs] = await Promise.all([
    signAll(rows),
    signAll(rows.map((r) => ({ path: thumbPathFor(r.path) }))).catch(() => new Map<string, string>()),
  ]);
  const signedOriginals = await signAll(originals, { download: true }).catch(() => new Map<string, string>());
  return rows.map((r) => ({
    id: r.id,
    chartId: r.chart_id,
    path: r.path,
    caption: r.caption ?? '',
    kind: (r.kind as AttachmentKind) ?? 'photo',
    toothTriadan: r.tooth_triadan ?? null,
    createdAt: r.created_at,
    url: signed.get(r.path) ?? '',
    thumbUrl: signedThumbs.get(thumbPathFor(r.path)) ?? signed.get(r.path) ?? '',
    originalPath: r.original_path ?? null,
    originalUrl: r.original_path ? signedOriginals.get(r.original_path) ?? '' : '',
  }));
}

export function useAttachments(
  chartId: string,
  practiceId = '',
  maxImagesOverride?: number,
  dicomEnabled = false
): UseAttachmentsReturn {
  const maxImages = maxImagesOverride ?? ATTACHMENT_LIMITS.maxPerChart;
  const [items, setItems] = React.useState<Attachment[]>([]);
  const [loaded, setLoaded] = React.useState(!cloudEnabled);
  const practiceIdRef = React.useRef(practiceId);
  practiceIdRef.current = practiceId;
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  // The chart these items belong to — a slow response for a chart the
  // user has since left must not land on the new one.
  const chartIdRef = React.useRef(chartId);
  chartIdRef.current = chartId;
  const load = React.useCallback(async () => {
    const forChart = chartId;
    const rows = await listChartAttachments(forChart);
    if (chartIdRef.current !== forChart) return;
    if (rows) setItems(rows);
    setLoaded(true);
  }, [chartId]);

  React.useEffect(() => {
    // Never show the previous chart's images while the new ones load.
    setItems([]);
    setLoaded(!cloudEnabled);
    if (cloudEnabled) load();
  }, [load]);

  const upload = React.useCallback(
    async (file: File, kind: AttachmentKind, caption: string): Promise<void> => {
      if (!supabase) throw new Error('Cloud is not configured.');
      const dicom = await isDicomFile(file);
      const rejection = uploadRejection({
        dicom,
        type: file.type,
        size: file.size,
        count: itemsRef.current.length,
        maxImages,
        dicomEnabled,
        native: isNativeApp(),
      });
      if (rejection) throw new Error(rejection);
      // DICOM: render a preview for display; the original is kept as-is.
      const source = dicom ? await dicomPreview(file) : file;
      // Fit to the size/dimension caps and make the grid thumbnail.
      const { main: toUpload, thumb } = await prepareUpload(source);
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) throw new Error('Sign in to add images.');
      const id = crypto.randomUUID();
      const path = `${uid}/${chartId}/${id}.${extFor(toUpload.type)}`;
      const originalPath = dicom ? `${uid}/${chartId}/${id}.dcm` : null;
      const { error: upErr } = await supabase.storage
        .from('attachments')
        .upload(path, toUpload, { contentType: toUpload.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      if (originalPath) {
        const { error: origErr } = await supabase.storage
          .from('attachments')
          .upload(originalPath, file, { contentType: DICOM_MIME, upsert: false });
        if (origErr) {
          await supabase.storage.from('attachments').remove([path]).catch(() => undefined);
          throw new Error(`Couldn't store the original DICOM file: ${origErr.message}`);
        }
      }
      if (thumb) {
        // Best-effort: without it the grid just shows the full image.
        await supabase.storage
          .from('attachments')
          .upload(thumbPathFor(path), thumb, { contentType: 'image/jpeg', upsert: false })
          .catch(() => undefined);
      }
      const { error: rowErr } = await supabase.from('attachments').insert({
        id,
        chart_id: chartId,
        path,
        kind,
        caption: caption.trim(),
        practice_id: practiceIdRef.current || null,
        ...(originalPath ? { original_path: originalPath } : {}),
      });
      if (rowErr) throw new Error(rowErr.message);
      await load();
    },
    [chartId, load, maxImages, dicomEnabled]
  );

  const updateCaption = React.useCallback(async (id: string, caption: string): Promise<void> => {
    if (!supabase) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, caption } : it)));
    const { error } = await supabase.from('attachments').update({ caption }).eq('id', id);
    if (error) throw new Error(error.message);
  }, []);

  const updateKind = React.useCallback(async (id: string, kind: AttachmentKind): Promise<void> => {
    if (!supabase) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, kind } : it)));
    const { error } = await supabase.from('attachments').update({ kind }).eq('id', id);
    if (error) throw new Error(error.message);
  }, []);

  const remove = React.useCallback(
    async (id: string): Promise<void> => {
      if (!supabase) return;
      const target = items.find((it) => it.id === id);
      if (target) {
        await supabase.storage
          .from('attachments')
          .remove([target.path, thumbPathFor(target.path), ...(target.originalPath ? [target.originalPath] : [])]);
      }
      const { error } = await supabase.from('attachments').delete().eq('id', id);
      if (error) throw new Error(error.message);
      setItems((prev) => prev.filter((it) => it.id !== id));
    },
    [items]
  );

  return {
    enabled: cloudEnabled,
    loaded,
    items,
    maxImages,
    dicomEnabled,
    upload,
    updateCaption,
    updateKind,
    remove,
  };
}
