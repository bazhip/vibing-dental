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
  upload: (file: File, kind: AttachmentKind, caption: string) => Promise<void>;
  updateCaption: (id: string, caption: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const SIGN_TTL = 60 * 60; // 1 hour

function extFor(type: string): string {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
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
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('That image is too large — attachments must be under 20 MB.');
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) throw new Error('Sign in to add images.');
      const id = crypto.randomUUID();
      const path = `${uid}/${chartId}/${id}.${extFor(file.type)}`;
      const { error: upErr } = await supabase.storage
        .from('attachments')
        .upload(path, file, { contentType: file.type, upsert: false });
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

  return { enabled: cloudEnabled, loaded, items, upload, updateCaption, remove };
}
