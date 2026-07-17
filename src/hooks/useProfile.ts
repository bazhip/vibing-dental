import React from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';

/**
 * The signed-in user's practice profile (collected at signup, editable in
 * Practice settings): company name for the topbar, doctor name for the
 * PDF signature line, and an optional uploaded logo that replaces the
 * template's built-in mark on generated charts. Standalone mode (no
 * Supabase) returns empty values and the app falls back to its built-in
 * defaults.
 */

export interface PracticeProfile {
  practiceName: string;
  doctorName: string;
}

export interface UseProfileReturn extends PracticeProfile {
  loaded: boolean;
  /** Public URL of the uploaded practice logo, or '' when none. */
  logoUrl: string;
  update: (next: PracticeProfile) => Promise<void>;
  /** Normalize to PNG (downscaled) and upload as the practice logo. */
  uploadLogo: (file: File) => Promise<void>;
  removeLogo: () => Promise<void>;
}

const LOGO_MAX_WIDTH = 600;
/** Reject absurd source files before decoding them in-browser. The
 *  uploaded result is always a ≤600px PNG (tiny); this only bounds the
 *  input. The `logos` bucket enforces its own server-side cap too. */
const LOGO_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function publicLogoUrl(path: string): string {
  if (!supabase || !path) return '';
  const { data } = supabase.storage.from('logos').getPublicUrl(path);
  // Cache-bust: the path is stable across re-uploads.
  return data.publicUrl ? `${data.publicUrl}?v=${Date.now()}` : '';
}

/** Downscale + re-encode any image file to PNG so the PDF embedder only
 *  ever sees one format. */
async function normalizeToPng(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = url;
    });
    const scale = Math.min(1, LOGO_MAX_WIDTH / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!blob) throw new Error('Could not convert the image.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Upload a practice logo for the CURRENT session's user — shared by the
 *  Practice settings modal and the signup flow (which uploads right after
 *  the account session is created). */
export async function uploadPracticeLogo(file: File): Promise<string> {
  if (!supabase) return '';
  if (file.size > LOGO_MAX_UPLOAD_BYTES) {
    throw new Error('That image is too large — logo files must be under 10 MB.');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return '';
  const png = await normalizeToPng(file);
  const path = `${userId}/logo.png`;
  const { error: upError } = await supabase.storage
    .from('logos')
    .upload(path, png, { upsert: true, contentType: 'image/png' });
  if (upError) throw new Error(upError.message);
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, logo_path: path });
  if (error) throw new Error(error.message);
  return publicLogoUrl(path);
}

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = React.useState<PracticeProfile>({
    practiceName: '',
    doctorName: '',
  });
  const [logoUrl, setLogoUrl] = React.useState('');
  const [loaded, setLoaded] = React.useState(!cloudEnabled);

  React.useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (!cancelled) setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('practice_name, doctor_name, logo_path')
        .eq('id', userId)
        .maybeSingle();
      if (!cancelled) {
        if (data) {
          setProfile({
            practiceName: data.practice_name ?? '',
            doctorName: data.doctor_name ?? '',
          });
          setLogoUrl(publicLogoUrl(data.logo_path ?? ''));
        }
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = React.useCallback(async (next: PracticeProfile): Promise<void> => {
    setProfile(next);
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      practice_name: next.practiceName,
      doctor_name: next.doctorName,
    });
    if (error) throw new Error(error.message);
  }, []);

  const uploadLogo = React.useCallback(async (file: File): Promise<void> => {
    const url = await uploadPracticeLogo(file);
    if (url) setLogoUrl(url);
  }, []);

  const removeLogo = React.useCallback(async (): Promise<void> => {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    await supabase.storage.from('logos').remove([`${userId}/logo.png`]);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, logo_path: '' });
    if (error) throw new Error(error.message);
    setLogoUrl('');
  }, []);

  return { ...profile, loaded, logoUrl, update, uploadLogo, removeLogo };
}
