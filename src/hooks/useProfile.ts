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

export type PracticePlan = 'basic' | 'pro';

/** Per-plan limits. Central so the whole app agrees; when a tenant needs
 *  a custom cap these become columns on `practices`. */
export const PLAN_LIMITS: Record<PracticePlan, { maxImages: number; aiAutofill: boolean }> = {
  basic: { maxImages: 30, aiAutofill: false },
  pro: { maxImages: 100, aiAutofill: true },
};

export interface UseProfileReturn extends PracticeProfile {
  loaded: boolean;
  /** The user's current practice (for team sharing), '' when solo. */
  practiceId: string;
  /** The practice's subscription tier (gates AI + storage). */
  plan: PracticePlan;
  /** Whether AI autofill is included in the current plan. */
  aiEnabled: boolean;
  /** Max images per chart on the current plan. */
  maxImages: number;
  /** Signed URL of the uploaded practice logo, or '' when none. */
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

/** The `logos` bucket is private — reads go through short-lived signed
 *  URLs (storage RLS grants them to the practice's members). The signed
 *  token also acts as the cache-buster across re-uploads. */
const LOGO_URL_TTL_SECONDS = 60 * 60 * 12;

async function signedLogoUrl(path: string): Promise<string> {
  if (!supabase || !path) return '';
  const { data } = await supabase.storage
    .from('logos')
    .createSignedUrl(path, LOGO_URL_TTL_SECONDS);
  return data?.signedUrl ?? '';
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

/** The caller's practice id (their shared practice), or '' when solo. */
async function myPracticeId(userId: string): Promise<string> {
  if (!supabase) return '';
  const { data } = await supabase.from('profiles').select('practice_id').eq('id', userId).maybeSingle();
  return data?.practice_id ?? '';
}

/** Upload the practice logo (shared across the whole practice team) — the
 *  file lives at logos/{practice_id}/logo.png and the path is stored on
 *  the practice. Only a practice owner may write (RLS). Falls back to a
 *  per-user logo when the account has no practice (standalone). Shared by
 *  Practice settings and the signup flow. */
export async function uploadPracticeLogo(file: File): Promise<string> {
  if (!supabase) return '';
  if (file.size > LOGO_MAX_UPLOAD_BYTES) {
    throw new Error('That image is too large — logo files must be under 10 MB.');
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return '';
  const png = await normalizeToPng(file);
  const practiceId = await myPracticeId(userId);
  if (practiceId) {
    const path = `${practiceId}/logo.png`;
    const { error: upError } = await supabase.storage
      .from('logos')
      .upload(path, png, { upsert: true, contentType: 'image/png' });
    if (upError) throw new Error(upError.message);
    const { error } = await supabase.from('practices').update({ logo_path: path }).eq('id', practiceId);
    if (error) throw new Error(error.message);
    return signedLogoUrl(path);
  }
  // Standalone fallback: per-user logo.
  const path = `${userId}/logo.png`;
  const { error: upError } = await supabase.storage
    .from('logos')
    .upload(path, png, { upsert: true, contentType: 'image/png' });
  if (upError) throw new Error(upError.message);
  const { error } = await supabase.from('profiles').upsert({ id: userId, logo_path: path });
  if (error) throw new Error(error.message);
  return signedLogoUrl(path);
}

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = React.useState<PracticeProfile>({
    practiceName: '',
    doctorName: '',
  });
  const [logoUrl, setLogoUrl] = React.useState('');
  const [practiceId, setPracticeId] = React.useState('');
  const [plan, setPlan] = React.useState<PracticePlan>('basic');
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
        .select('practice_name, doctor_name, logo_path, practice_id')
        .eq('id', userId)
        .maybeSingle();
      // Logo and NAME are shared per practice — the practice row is the
      // single source for team members (invited accounts have an empty
      // per-profile copy), falling back to the profile for solo users.
      let effectiveLogoPath = data?.logo_path ?? '';
      let effectivePracticeName = data?.practice_name ?? '';
      const pid = data?.practice_id ?? '';
      let practicePlan: PracticePlan = 'basic';
      if (pid) {
        const { data: prac } = await supabase.from('practices').select('logo_path, plan, name').eq('id', pid).maybeSingle();
        if (prac?.logo_path) effectiveLogoPath = prac.logo_path;
        if (prac?.name?.trim()) effectivePracticeName = prac.name.trim();
        if (prac?.plan === 'pro') practicePlan = 'pro';
      }
      const signedUrl = await signedLogoUrl(effectiveLogoPath);
      if (!cancelled) {
        if (data) {
          setProfile({
            practiceName: effectivePracticeName,
            doctorName: data.doctor_name ?? '',
          });
          setLogoUrl(signedUrl);
          setPracticeId(pid);
          setPlan(practicePlan);
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
    // The shared practice name lives on the practice row — renaming is
    // owner-only (the UI gates it, and practices RLS only lets owners
    // write, so a member's attempt is a silent no-op).
    const pid = await myPracticeId(userId);
    if (pid && next.practiceName.trim()) {
      await supabase.from('practices').update({ name: next.practiceName.trim() }).eq('id', pid);
    }
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
    const pid = await myPracticeId(userId);
    if (pid) {
      await supabase.storage.from('logos').remove([`${pid}/logo.png`]);
      const { error } = await supabase.from('practices').update({ logo_path: '' }).eq('id', pid);
      if (error) throw new Error(error.message);
    } else {
      await supabase.storage.from('logos').remove([`${userId}/logo.png`]);
      const { error } = await supabase.from('profiles').upsert({ id: userId, logo_path: '' });
      if (error) throw new Error(error.message);
    }
    setLogoUrl('');
  }, []);

  return {
    ...profile,
    loaded,
    practiceId,
    plan,
    aiEnabled: PLAN_LIMITS[plan].aiAutofill,
    maxImages: PLAN_LIMITS[plan].maxImages,
    logoUrl,
    update,
    uploadLogo,
    removeLogo,
  };
}
