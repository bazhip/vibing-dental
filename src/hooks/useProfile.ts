import React from 'react';
import i18n from '../i18n';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { FREE_BETA } from '../constants/plans';
import { call as callTeamApi } from './useTeam';
import { clientLanguageOf } from './usePracticeLanguage';
import { appReportLocale } from '../utils/ownerReportI18n';
import { OwnerReportConfig, configByteSize, defaultConfig, normalizeConfig, MAX_CONFIG_BYTES } from '../utils/ownerReportConfig';
import { LocalizedError } from '../utils/apiErrors';
import { pimsSendAllowed } from '../utils/pims/sendFlag';

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

export type PracticePlan = 'free' | 'basic' | 'pro';

/** Per-plan limits. Central so the whole app agrees; when a tenant needs
 *  a custom cap these become columns on `practices`. 'free' is the
 *  unpaid tier — any account without a live/comped subscription resolves
 *  to it. During the free beta every account gets AI voice autofill
 *  (usage is logged per user in ai_usage) and free accounts get 10
 *  images per chart. */
export const PLAN_LIMITS: Record<PracticePlan, { maxImages: number; aiAutofill: boolean; dicom: boolean }> = {
  // DICOM radiographs (original .dcm kept alongside a rendered preview)
  // come with the paid plans — off on the free tier and never part of the
  // free beta. Comped practices and app admins get them too (see
  // dicomAllowed). The database enforces the same rule
  // (public.current_user_can_store_dicom, migration
  // 20261129_dicom_comped_and_admins).
  free: { maxImages: 10, aiAutofill: true, dicom: false },
  basic: { maxImages: 30, aiAutofill: true, dicom: true },
  pro: { maxImages: 100, aiAutofill: true, dicom: true },
};

/** Subscription statuses that unlock the practice's basic/pro plan. */
export const PAID_STATUSES = ['active', 'trialing', 'comped', 'past_due'];

/** Whether DICOM uploads are allowed: app admins always (support and
 *  testing); everyone else on a basic/pro plan that is live or comped.
 *  Mirrors public.current_user_can_store_dicom(). */
export function dicomAllowed(u: { plan: PracticePlan; admin: boolean }): boolean {
  return u.admin || PLAN_LIMITS[u.plan].dicom;
}

export interface UseProfileReturn extends PracticeProfile {
  loaded: boolean;
  /** practiceId is known (the profile read succeeded). `loaded` is also
   *  true after a failed read, with practiceId '' meaning "unknown". */
  practiceKnown: boolean;
  /** The user's current practice (for team sharing), '' when solo. */
  practiceId: string;
  /** The practice's subscription tier (gates AI + storage). */
  plan: PracticePlan;
  /** Whether AI autofill is included in the current plan. */
  aiEnabled: boolean;
  /** Max images per chart on the current plan. */
  maxImages: number;
  /** Whether DICOM radiograph uploads are included (paid plans only). */
  dicomEnabled: boolean;
  /** Owner-report feature flag — per practice, admin-controlled, off by
   *  default (practices.owner_report_enabled). */
  ownerReportEnabled: boolean;
  /** Send-to-PIMS (ezyVet extension) flag — per practice, admin-controlled,
   *  off by default (practices.pims_send_enabled); on for everyone during
   *  the free beta. */
  pimsSendEnabled: boolean;
  gpExamEnabled: boolean;
  consultationEnabled: boolean;
  /** The practice's owner report templates (normalized; the built-in
   *  default when the practice hasn't customized anything). */
  ownerReportConfig: OwnerReportConfig;
  /** Owner-only: persist the templates (team-api) and update local state.
   *  Refuses (throws) when the saved templates failed to load, or when
   *  they changed elsewhere since they were loaded — each save replaces
   *  the whole set, so either case would silently wipe real templates. */
  saveOwnerReportConfig: (config: OwnerReportConfig) => Promise<void>;
  /** The practice's saved templates couldn't be read; `ownerReportConfig`
   *  is only the built-in default, and saving is blocked. */
  ownerReportConfigLoadFailed: boolean;
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
      img.onerror = () => reject(new LocalizedError(i18n.t('logoErrors.unreadable', { ns: 'settings' })));
      img.src = url;
    });
    const scale = Math.min(1, LOGO_MAX_WIDTH / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new LocalizedError(i18n.t('logoErrors.canvas', { ns: 'settings' }));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    );
    if (!blob) throw new LocalizedError(i18n.t('logoErrors.convert', { ns: 'settings' }));
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
    throw new LocalizedError(i18n.t('logoErrors.tooLarge', { ns: 'settings' }));
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
  // Plan state starts at 'basic' (no flash of a free-plan banner), so
  // DICOM waits for the profile load instead (no flash of DICOM).
  const [dicomReady, setDicomReady] = React.useState(false);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [ownerReportEnabled, setOwnerReportEnabled] = React.useState(false);
  const [gpExamEnabled, setGpExamEnabled] = React.useState(false);
  const [consultationEnabled, setConsultationEnabled] = React.useState(false);
  const [pimsSendEnabled, setPimsSendEnabled] = React.useState(false);
  const [ownerReportConfig, setOwnerReportConfig] = React.useState<OwnerReportConfig>(defaultConfig);
  const [ownerReportConfigLoadFailed, setOwnerReportConfigLoadFailed] = React.useState(false);
  const reportLoadFailedRef = React.useRef(false);
  // Version of the saved templates this session loaded (null = unknown,
  // e.g. before the version column existed) — sent with every save so a
  // stale tab or device can't overwrite newer templates.
  const reportRevRef = React.useRef<number | null>(null);
  const [loaded, setLoaded] = React.useState(!cloudEnabled);
  const [practiceKnown, setPracticeKnown] = React.useState(!cloudEnabled);

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
      const { data, error: profileError } = await supabase
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
      // No practice = never subscribed = the free tier. Practices only
      // get basic/pro features while their subscription is alive (or
      // comped/grandfathered) — a lapsed or never-started one is free.
      let practicePlan: PracticePlan = 'free';
      // app_metadata is server-controlled; the database re-checks it.
      const admin = sessionData.session?.user.app_metadata?.role === 'admin';
      let ownerReportOn = false;
      let pimsSendOn = false;
      let gpExamOn = false;
      let consultationOn = false;
      let reportConfig: OwnerReportConfig | null = null;
      let reportRev: number | null = null;
      let reportLoadFailed = false;
      if (pid) {
        const { data: prac } = await supabase
          .from('practices')
          .select('logo_path, plan, name, subscription_status')
          .eq('id', pid)
          .maybeSingle();
        if (prac?.logo_path) effectiveLogoPath = prac.logo_path;
        if (prac?.name?.trim()) effectivePracticeName = prac.name.trim();
        const paidStatus = PAID_STATUSES.includes(prac?.subscription_status ?? '');
        if (paidStatus) practicePlan = prac?.plan === 'pro' ? 'pro' : 'basic';
        // Separate query so a database that predates the column (it ships
        // via migration) degrades to flag-off instead of breaking the
        // whole profile load.
        const { data: features, error: featuresError } = await supabase
          .from('practices')
          .select('owner_report_enabled')
          .eq('id', pid)
          .maybeSingle();
        if (!featuresError) {
          ownerReportOn = !!(features as { owner_report_enabled?: boolean } | null)?.owner_report_enabled;
        }
        // Same tolerance for the PIMS flag (its own query, so a missing
        // column can't take the owner-report flag down with it).
        const { data: pimsRow, error: pimsError } = await supabase
          .from('practices')
          .select('pims_send_enabled')
          .eq('id', pid)
          .maybeSingle();
        if (!pimsError) {
          pimsSendOn = !!(pimsRow as { pims_send_enabled?: boolean } | null)?.pims_send_enabled;
        }
        // A missing column or failed read leaves the GP rollout off.
        const { data: gpFeatures, error: gpError } = await supabase
          .from('practices')
          .select('gp_exam_enabled')
          .eq('id', pid)
          .maybeSingle();
        gpExamOn = !gpError && gpFeatures?.gp_exam_enabled === true;
        const { data: consultationFeatures, error: consultationError } = await supabase
          .from('practices')
          .select('consultation_enabled')
          .eq('id', pid)
          .maybeSingle();
        consultationOn = !consultationError && consultationFeatures?.consultation_enabled === true;
        // Owner report templates (+ their version). A failed read is NOT
        // "no templates": it's remembered, and saving is blocked, so the
        // built-in default shown meanwhile can never be saved over them.
        let { data: reportRow, error: reportError } = await supabase
          .from('practices')
          .select('owner_report_config, owner_report_config_rev')
          .eq('id', pid)
          .maybeSingle();
        if (reportError && /owner_report_config_rev/.test(reportError.message)) {
          // Version column not added yet: read without it.
          ({ data: reportRow, error: reportError } = await supabase
            .from('practices')
            .select('owner_report_config')
            .eq('id', pid)
            .maybeSingle());
        }
        if (!reportError) {
          const row = reportRow as { owner_report_config?: unknown; owner_report_config_rev?: unknown } | null;
          // The seed language is only used when nothing is saved yet; the
          // read tolerates a database without the column.
          let seedLanguage = appReportLocale();
          const saved = row?.owner_report_config;
          if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
            const { data: langRow, error: langError } = await supabase
              .from('practices')
              .select('client_language')
              .eq('id', pid)
              .maybeSingle();
            seedLanguage = clientLanguageOf(langError ? null : (langRow as { client_language?: string | null } | null), seedLanguage);
          }
          reportConfig = normalizeConfig(row?.owner_report_config, seedLanguage);
          reportRev = typeof row?.owner_report_config_rev === 'number' ? row.owner_report_config_rev : null;
        } else {
          reportLoadFailed = true;
        }
      }
      const signedUrl = await signedLogoUrl(effectiveLogoPath);
      if (!cancelled) {
        setIsAdmin(admin);
        setDicomReady(true);
        if (data) {
          setProfile({
            practiceName: effectivePracticeName,
            doctorName: data.doctor_name ?? '',
          });
          setLogoUrl(signedUrl);
          setPracticeId(pid);
          setPlan(practicePlan);
          setOwnerReportEnabled(ownerReportOn);
          setPimsSendEnabled(pimsSendOn);
          setGpExamEnabled(gpExamOn);
          setConsultationEnabled(consultationOn);
          if (reportConfig) setOwnerReportConfig(reportConfig);
          reportRevRef.current = reportRev;
          reportLoadFailedRef.current = reportLoadFailed;
          setOwnerReportConfigLoadFailed(reportLoadFailed);
        }
        setPracticeKnown(!profileError);
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

  const saveOwnerReportConfig = React.useCallback(async (config: OwnerReportConfig): Promise<void> => {
    const normalized = normalizeConfig(config);
    if (configByteSize(normalized) > MAX_CONFIG_BYTES) {
      throw new LocalizedError(i18n.t('logoErrors.reportTooLarge', { ns: 'settings' }));
    }
    if (reportLoadFailedRef.current) {
      throw new LocalizedError(i18n.t('logoErrors.reportNotLoaded', { ns: 'settings' }));
    }
    if (supabase) {
      const res = await callTeamApi<{ ok?: boolean; rev?: number }>({
        action: 'set_owner_report_config',
        config: normalized,
        ...(reportRevRef.current !== null ? { expectedRev: reportRevRef.current } : {}),
      });
      if (typeof res?.rev === 'number') reportRevRef.current = res.rev;
    }
    setOwnerReportConfig(normalized);
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

  // Memoised so consumers (the app's settings context) only see a new
  // object when something actually changed.
  return React.useMemo(() => ({
    ...profile,
    loaded,
    practiceKnown,
    practiceId,
    plan,
    aiEnabled: PLAN_LIMITS[plan].aiAutofill,
    maxImages: PLAN_LIMITS[plan].maxImages,
    dicomEnabled: dicomReady && dicomAllowed({ plan, admin: isAdmin }),
    // Free beta: the owner report is on for everyone.
    ownerReportEnabled: FREE_BETA || ownerReportEnabled,
    // Free beta: Send to PIMS is on for everyone too.
    pimsSendEnabled: pimsSendAllowed(pimsSendEnabled),
    gpExamEnabled,
    consultationEnabled,
    ownerReportConfigLoadFailed,
    ownerReportConfig,
    saveOwnerReportConfig,
    logoUrl,
    update,
    uploadLogo,
    removeLogo,
  }), [profile, loaded, practiceKnown, practiceId, plan, dicomReady, isAdmin, ownerReportEnabled, pimsSendEnabled, gpExamEnabled, consultationEnabled, ownerReportConfig, saveOwnerReportConfig, logoUrl, update, uploadLogo, removeLogo]);
}
