import { supabase } from './supabaseClient';

/** How long a download link works. */
export const LINK_TTL_MINUTES = 15;

/**
 * A real https link to a generated PDF, for Android in-app browsers
 * (WebViews) — they drop downloads of in-page (blob:) files but do
 * download ordinary links. Uploads to the private `exports` bucket at
 * {user_id}/download.pdf (overwritten each time, so storage never grows)
 * and returns a short-lived signed URL that downloads as `filename`.
 * null when there's no signed-in account or the upload fails.
 */
export async function createPdfDownloadLink(blob: Blob, filename: string): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return null;
    const path = `${userId}/download.pdf`;
    const bucket = supabase.storage.from('exports');
    const { error } = await bucket.upload(path, blob, { contentType: 'application/pdf', upsert: true });
    if (error) return null;
    const { data, error: signError } = await bucket.createSignedUrl(path, LINK_TTL_MINUTES * 60, { download: filename });
    return signError ? null : data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
