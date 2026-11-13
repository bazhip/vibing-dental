import React from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../utils/supabaseClient';
import { UseProfileReturn } from '../hooks/useProfile';
import { useModalFocus } from '../hooks/useModalFocus';
import { readString, writeString } from '../utils/storage';
import { friendlyError, toast } from './ui/dialogs';
import './Login.css';
import './AccountSurfaces.css';

/**
 * Google sign-up skips the signup form, so a new Google account starts
 * with no practice or doctor name — both print on every chart. This asks
 * for them once (doctor name pre-filled from the Google profile), plus an
 * optional logo — the same one email sign-up offers.
 *
 * Only for accounts signed in with Google that are missing a name; team
 * members get the practice name from their practice, so they're asked
 * for their doctor name at most. "Later" hides it on this browser.
 */

export type SetupNeed = { practice: boolean; doctor: boolean; suggestedDoctor: string; userId: string };

/** What this account still needs, or null when nothing (or not decided yet). */
export function useFinishSetup(profile: UseProfileReturn, enabled: boolean) {
  const [need, setNeed] = React.useState<SetupNeed | null>(null);
  const [checked, setChecked] = React.useState(false);
  React.useEffect(() => {
    if (!enabled || !supabase || !profile.loaded) {
      if (profile.loaded || !enabled) setChecked(true);
      return;
    }
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const user = data.user;
      const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [user?.app_metadata?.provider];
      const viaGoogle = providers.includes('google');
      const practice = !profile.practiceId && !profile.practiceName.trim();
      const doctor = !profile.doctorName.trim();
      const dismissed = user ? readString(`setup.dismissed.${user.id}`, 1, '') === '1' : true;
      if (user && viaGoogle && (practice || doctor) && !dismissed) {
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const full = String(meta.full_name ?? meta.name ?? '').trim();
        setNeed({ practice, doctor, suggestedDoctor: full, userId: user.id });
      } else {
        setNeed(null);
      }
      setChecked(true);
    });
    return () => { cancelled = true; };
    // Re-check only when the profile finishes loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, profile.loaded]);
  /** True once we know whether setup is needed (gates the walkthrough). */
  return { need, checked, done: () => setNeed(null) };
}

export const FinishSetupModal: React.FC<{
  need: SetupNeed;
  profile: UseProfileReturn;
  onDone: () => void;
}> = ({ need, profile, onDone }) => {
  const { t } = useTranslation('onboarding');
  const [practiceName, setPracticeName] = React.useState(profile.practiceName);
  const [doctorName, setDoctorName] = React.useState(profile.doctorName || need.suggestedDoctor);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const modalRef = useModalFocus(true);
  // Optional logo — offered alongside the practice name (a solo account's
  // own logo), never to team members, whose logo belongs to the practice.
  const offerLogo = need.practice && !profile.logoUrl;
  const [logoFile, setLogoFile] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState('');
  React.useEffect(() => {
    if (!logoFile) { setLogoPreview(''); return; }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const later = () => {
    writeString(`setup.dismissed.${need.userId}`, 1, '1');
    onDone();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((need.practice && !practiceName.trim()) || (need.doctor && !doctorName.trim())) {
      setError(t('finishSetup.namesNeeded'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await profile.update({
        practiceName: need.practice ? practiceName.trim() : profile.practiceName,
        doctorName: need.doctor ? doctorName.trim() : profile.doctorName,
      });
      // The names are saved either way; a logo that won't upload can be
      // added later from Practice settings.
      if (offerLogo && logoFile) {
        try {
          await profile.uploadLogo(logoFile);
        } catch (err) {
          toast(friendlyError(err, t('finishSetup.logoFailed')), { kind: 'error' });
          onDone();
          return;
        }
      }
      toast(t('finishSetup.allSet'), { kind: 'success' });
      onDone();
    } catch (err) {
      setError(friendlyError(err, t('finishSetup.saveFailed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-settings-overlay" role="dialog" aria-modal="true" aria-label={t('finishSetup.title')}>
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>{t('finishSetup.title')}</h2>
        </header>
        <form className="ai-settings-body" onSubmit={save}>
          <p className="ai-settings-blurb">
            {need.practice && need.doctor
              ? t('finishSetup.both')
              : need.practice
                ? t('finishSetup.practiceOnly')
                : t('finishSetup.doctorOnly')}
          </p>
          {need.practice && (
            <label className="patient-form__label">
              {t('finishSetup.practiceName')}
              <input
                className="patient-form__input"
                value={practiceName}
                autoFocus
                onChange={(e) => setPracticeName(e.target.value)}
              />
            </label>
          )}
          {need.doctor && (
            <label className="patient-form__label" style={{ marginTop: '0.6rem' }}>
              {t('finishSetup.doctorName')}
              <input
                className="patient-form__input"
                value={doctorName}
                autoFocus={!need.practice}
                placeholder={t('finishSetup.doctorPlaceholder')}
                onChange={(e) => setDoctorName(e.target.value)}
              />
            </label>
          )}
          {offerLogo && (
            <div className="finish-setup__logo">
              {logoPreview && <img src={logoPreview} alt="" className="finish-setup__logo-preview" />}
              <label className="login-logo-field">
                <span>{logoFile ? t('finishSetup.logoNamed', { name: logoFile.name }) : t('finishSetup.logoOptional')}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={t('finishSetup.logoOptional')}
                  disabled={busy}
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <span className="patient-form__hint">{t('finishSetup.logoHint')}</span>
            </div>
          )}
          {error && <div className="login-error settings-msg" role="alert">{error}</div>}
          <div className="practice-logo-actions" style={{ marginTop: '0.9rem' }}>
            <button type="button" className="diagram-view__action" onClick={later} disabled={busy}>
              {t('finishSetup.later')}
            </button>
            <button type="submit" className="entry-grid__button entry-grid__button--topbar" disabled={busy}>
              {busy ? t('finishSetup.saving') : t('finishSetup.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
