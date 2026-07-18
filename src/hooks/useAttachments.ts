import React from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';

/**
 * Photos and radiographs pinned to the active chart. Files live in the
 * private `attachments` storage bucket (owner-folder-scoped); this hook
 * lists/uploads/updates/deletes the rows and hands back short-lived
 * signed URLs for display. Cloud-only — trial/standalone charts have no
 * account to scope storage to, so the Imaging section hides itself.
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
  /** Signed URL for <img src>; refreshed on load, may expire. */
  url: string;
}

export interface UseAttachmentsReturn {
  enabled: boolean;
  loaded: boolean;
  items: Attachment[];
  /** Max images allowed on one chart (UI shows the count against it). */
  maxImages: number;
  upload: (file: File, kind: AttachmentKind, caption: string) => Promise<void>;
  updateCaption: (id: string, caption: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

// Upload limits. Kept together and easy to relocate: when per-practice
// tuning is needed, these become columns on `practices` set from the
// admin panel and read here via practiceId. For now they're sensible
// fixed defaults.
const ATTACHMENT_LIMITS = {
  /** Absolute reject ceiling for the ORIGINAL file (before downscaling). */
  hardMaxBytes: 40 * 1024 * 1024,
  /** Downscale anything larger than this so stored images stay lean. */
  softMaxBytes: 4 * 1024 * 1024,
  /** Longest edge after downscaling — plenty for photos and rads. */
  maxDimension: 2500,
  /** Max images pinned to a single chart. */
  maxPerChart: 30,
};

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const SIGN_TTL = 60 * 60; // 1 hour

function extFor(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

/** Downscale + re-encode an oversized image so a phone's 15 MB photo
 *  doesn't balloon storage. Images already under the soft cap pass
 *  through untouched (keeps small PNG radiographs lossless); larger ones
 *  are scaled to fit maxDimension and JPEG-encoded, stepping quality down
 *  until under the cap. Falls back to the original if decode fails. */
async function downscaleIfNeeded(file: File): Promise<File> {
  if (file.size <= ATTACHMENT_LIMITS.softMaxBytes) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
    const longest = Math.max(img.width, img.height);
    const scale = Math.min(1, ATTACHMENT_LIMITS.maxDimension / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // White matte so a transparent PNG doesn't turn black as JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const toBlob = (q: number) =>
      new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q));
    let quality = 0.9;
    let blob = await toBlob(quality);
    while (blob && blob.size > ATTACHMENT_LIMITS.softMaxBytes && quality > 0.5) {
      quality -= 0.1;
      blob = await toBlob(quality);
    }
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Sign a batch of storage paths for display. */
async function signAll(rows: { path: string }[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!supabase || rows.length === 0) return map;
  const paths = rows.map((r) => r.path);
  const { data } = await supabase.storage.from('attachments').createSignedUrls(paths, SIGN_TTL);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

export function useAttachments(chartId: string, practiceId = ''): UseAttachmentsReturn {
  const [items, setItems] = React.useState<Attachment[]>([]);
  const [loaded, setLoaded] = React.useState(!cloudEnabled);
  const practiceIdRef = React.useRef(practiceId);
  practiceIdRef.current = practiceId;
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const load = React.useCallback(async () => {
    if (!supabase || !chartId) {
      setLoaded(true);
      return;
    }
    const { data, error } = await supabase
      .from('attachments')
      .select('id, chart_id, path, caption, kind, tooth_triadan, created_at')
      .eq('chart_id', chartId)
      .order('created_at', { ascending: true });
    if (error) {
      setLoaded(true);
      return;
    }
    const rows = data ?? [];
    const signed = await signAll(rows);
    setItems(
      rows.map((r) => ({
        id: r.id,
        chartId: r.chart_id,
        path: r.path,
        caption: r.caption ?? '',
        kind: (r.kind as AttachmentKind) ?? 'photo',
        toothTriadan: r.tooth_triadan ?? null,
        createdAt: r.created_at,
        url: signed.get(r.path) ?? '',
      }))
    );
    setLoaded(true);
  }, [chartId]);

  React.useEffect(() => {
    setLoaded(!cloudEnabled);
    if (cloudEnabled) load();
  }, [load]);

  const upload = React.useCallback(
    async (file: File, kind: AttachmentKind, caption: string): Promise<void> => {
      if (!supabase) throw new Error('Cloud is not configured.');
      if (!ALLOWED.includes(file.type)) {
        throw new Error('Use a PNG, JPEG, or WEBP image.');
      }
      if (itemsRef.current.length >= ATTACHMENT_LIMITS.maxPerChart) {
        throw new Error(
          `This chart already has the maximum of ${ATTACHMENT_LIMITS.maxPerChart} images. Delete one to add another.`
        );
      }
      if (file.size > ATTACHMENT_LIMITS.hardMaxBytes) {
        throw new Error(
          `That image is too large (over ${Math.round(ATTACHMENT_LIMITS.hardMaxBytes / 1024 / 1024)} MB). Use a smaller file.`
        );
      }
      // Shrink oversized originals before upload; small ones pass through.
      const toUpload = await downscaleIfNeeded(file);
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) throw new Error('Sign in to add images.');
      const id = crypto.randomUUID();
      const path = `${uid}/${chartId}/${id}.${extFor(toUpload.type)}`;
      const { error: upErr } = await supabase.storage
        .from('attachments')
        .upload(path, toUpload, { contentType: toUpload.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { error: rowErr } = await supabase.from('attachments').insert({
        id,
        chart_id: chartId,
        path,
        kind,
        caption: caption.trim(),
        practice_id: practiceIdRef.current || null,
      });
      if (rowErr) throw new Error(rowErr.message);
      await load();
    },
    [chartId, load]
  );

  const updateCaption = React.useCallback(async (id: string, caption: string): Promise<void> => {
    if (!supabase) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, caption } : it)));
    const { error } = await supabase.from('attachments').update({ caption }).eq('id', id);
    if (error) throw new Error(error.message);
  }, []);

  const remove = React.useCallback(
    async (id: string): Promise<void> => {
      if (!supabase) return;
      const target = items.find((it) => it.id === id);
      if (target) await supabase.storage.from('attachments').remove([target.path]);
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
    maxImages: ATTACHMENT_LIMITS.maxPerChart,
    upload,
    updateCaption,
    remove,
  };
}
