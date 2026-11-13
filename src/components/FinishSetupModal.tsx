import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { UseProfileReturn } from '../hooks/useProfile';
import { useModalFocus } from '../hooks/useModalFocus';
import { readString, writeString } from '../utils/storage';
import { chooseDialog, friendlyError, toast } from './ui/dialogs';
import { useTranslation } from 'react-i18next';
import { isNativeApp } from '../native/platform';
import { Sheet } from '../ios/Sheet';
import './Login.css';
import './AccountSurfaces.css';

/**
 * Google/Apple sign-up skips the signup form, so a new account starts
 * with no practice or doctor name — both print on every chart. This asks
 * for them once (doctor name pre-filled from the Google/Apple profile), plus an
 * optional logo — the same one email sign-up offers.
 *
 * Only for accounts signed in with Google or Apple that are missing a name; team
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
      // Apple sign-ups skip the signup form just like Google ones.
      const viaOAuth = providers.includes('google') || providers.includes('apple');
      const practice = !profile.practiceId && !profile.practiceName.trim();
      const doctor = !profile.doctorName.trim();
      const dismissed = user ? readString(`setup.dismissed.${user.id}`, 1, '') === '1' : true;
      if (user && viaOAuth && (practice || doctor) && !dismissed) {
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
  const [practiceName, setPracticeName] = React.useState(profile.practiceName);
  const [doctorName, setDoctorName] = React.useState(profile.doctorName || need.suggestedDoctor);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const native = isNativeApp();
  const { t } = useTranslation();
  const modalRef = useModalFocus(!native);
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

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((need.practice && !practiceName.trim()) || (need.doctor && !doctorName.trim())) {
      setError('Both names are needed — they appear on your charts.');
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
          toast(friendlyError(err, 'Your names are saved, but the logo couldn’t be uploaded — add it later in Practice settings.'), { kind: 'error' });
          onDone();
          return;
        }
      }
      toast('You’re all set.', { kind: 'success' });
      onDone();
    } catch (err) {
      setError(friendlyError(err, 'Could not save.'));
    } finally {
      setBusy(false);
    }
  };

  const blurb =
    need.practice && need.doctor
      ? 'Your practice and doctor name appear on every chart you print.'
      : need.practice
        ? 'Your practice name appears on every chart you print.'
        : 'Your doctor name appears on every chart you print.';

  if (native) {
    // A sheet: Later (or swiping it away) hides it on this device, Save saves.
    const dirty =
      practiceName !== profile.practiceName || doctorName !== (profile.doctorName || need.suggestedDoctor) || !!logoFile;
    return (
      <Sheet
        open
        onClose={later}
        title="Finish setting up"
        cancelLabel="Later"
        doneLabel={busy ? 'Saving…' : t('actions.save')}
        onDone={() => void save()}
        doneDisabled={busy}
        confirmDismiss={async () =>
          !busy &&
          (!dirty ||
            (await chooseDialog({
              title: t('ios.sheets.discard.title'),
              choices: [{ value: 'discard', label: t('ios.sheets.discard.discard'), destructive: true }],
              cancelLabel: t('ios.sheets.discard.keep'),
            })) === 'discard')
        }
      >
        <form className="ios-form" onSubmit={save}>
          <p className="ios-form-text">{blurb}</p>
          <div className="ios-form-group">
            {need.practice && (
              <label className="ios-field">
                <span className="ios-field__label">Practice name</span>
                <input
                  className="ios-field__input"
                  value={practiceName}
                  autoComplete="organization"
                  onChange={(e) => setPracticeName(e.target.value)}
                />
              </label>
            )}
            {need.doctor && (
              <label className="ios-field">
                <span className="ios-field__label">Doctor name</span>
                <input
                  className="ios-field__input"
                  value={doctorName}
                  autoComplete="name"
                  placeholder="e.g. Dr. Jane Smith"
                  onChange={(e) => setDoctorName(e.target.value)}
                />
              </label>
            )}
            {offerLogo && (
              <label className="ios-field ios-field--file">
                {logoPreview && <img src={logoPreview} alt="" className="ios-field__thumb" />}
                <span className="ios-field__label">{logoFile ? `Logo: ${logoFile.name}` : 'Practice logo (optional)'}</span>
                <input
                  type="file"
                  className="ios-field__file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Practice logo (optional)"
                  disabled={busy}
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
          {offerLogo && <p className="ios-form-footer">Printed at the top of your charts. PNG, JPG or WebP.</p>}
          {error && <p className="ios-form-error" role="alert">{error}</p>}
          {/* Return on the keyboard saves, like Save in the bar. */}
          <button type="submit" hidden tabIndex={-1} />
        </form>
      </Sheet>
    );
  }

  return (
    <div className="ai-settings-overlay" role="dialog" aria-modal="true" aria-label="Finish setting up">
      <div className="ai-settings-modal" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>Finish setting up</h2>
        </header>
        <form className="ai-settings-body" onSubmit={save}>
          <p className="ai-settings-blurb">{blurb}</p>
          {need.practice && (
            <label className="patient-form__label">
              Practice name
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
              Doctor name
              <input
                className="patient-form__input"
                value={doctorName}
                autoFocus={!need.practice}
                placeholder="e.g. Dr. Jane Smith"
                onChange={(e) => setDoctorName(e.target.value)}
              />
            </label>
          )}
          {offerLogo && (
            <div className="finish-setup__logo">
              {logoPreview && <img src={logoPreview} alt="" className="finish-setup__logo-preview" />}
              <label className="login-logo-field">
                <span>{logoFile ? `Logo: ${logoFile.name}` : 'Practice logo (optional)'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Practice logo (optional)"
                  disabled={busy}
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <span className="patient-form__hint">Printed at the top of your charts. PNG, JPG or WebP.</span>
            </div>
          )}
          {error && <div className="login-error settings-msg" role="alert">{error}</div>}
          <div className="practice-logo-actions" style={{ marginTop: '0.9rem' }}>
            <button type="button" className="diagram-view__action" onClick={later} disabled={busy}>
              Later
            </button>
            <button type="submit" className="entry-grid__button entry-grid__button--topbar" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
