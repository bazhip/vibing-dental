import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AppleSignInButton, AppleSignInHint, showAppleSignIn } from './AppleSignInButton';
import { confirmDialog } from './ui/dialogs';
import { supabase } from '../utils/supabaseClient';
import { withDetail } from '../utils/apiErrors';
import { useModalFocus } from '../hooks/useModalFocus';
import { isNativeApp } from '../native/platform';
import './Login.css';

interface SessionExpiredOverlayProps {
  /** The signed-out account's email — prefilled, but editable in case a
   *  colleague needs to take over the machine. */
  email: string;
  /** Deliberately leave for the landing page instead of re-signing in.
   *  The caller sweeps chart storage (shared-machine hygiene). */
  onSignOut: () => void;
}

/**
 * Re-auth in place. When the Supabase session expires mid-procedure the
 * chart stays mounted underneath (localStorage still has every edit) and
 * this overlay collects a password. A successful sign-in fires Supabase's
 * SIGNED_IN event, which App handles — this component never unmounts the
 * chart, so the tech resumes exactly where they were.
 *
 * There is deliberately no way to dismiss the overlay without an action:
 * cloud saving is broken until someone signs in, and hiding that fact
 * mid-procedure is how charts get lost.
 */
export const SessionExpiredOverlay: React.FC<SessionExpiredOverlayProps> = ({
  email: initialEmail,
  onSignOut,
}) => {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const modalRef = useModalFocus(true);
  // iOS app: a full-screen sign-in (fullScreenCover — nothing to dismiss),
  // with inset-grouped fields and iOS buttons.
  const app = isNativeApp();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (authError) {
      const code = (authError as { code?: string }).code ?? '';
      const msg = authError.message ?? '';
      setError(
        code === 'invalid_credentials' || /invalid login credentials/i.test(msg)
          ? t('errors.invalidCredentials')
          : authError.status === 429 || /rate limit|too many/i.test(msg)
            ? t('errors.rateLimit', { ns: 'common' })
            : /fetch|network/i.test(msg)
              ? t('errors.network', { ns: 'common' })
              : msg
                ? withDetail(msg) // raw server text: bare in English, wrapped elsewhere (as in Login)
                : t('errors.signInFailed')
      );
      setPassword('');
      return;
    }
    // Success: the SIGNED_IN auth event clears the expired state in App.
  };

  const fieldsEls = (
    <>
      <label className={app ? 'ios-field' : 'login-field'}>
        <span className={app ? 'ios-field__label' : 'login-field__label'}>{t('login.email')}</span>
        <input
          type="email"
          className={app ? 'ios-field__input' : 'login-input'}
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className={app ? 'ios-field' : 'login-field'}>
        <span className={app ? 'ios-field__label' : 'login-field__label'}>{t('login.password')}</span>
        <input
          type="password"
          className={app ? 'ios-field__input' : 'login-input'}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
      </label>
    </>
  );

  return (
    <div
      className={app ? 'ios-auth-screen' : 'ai-settings-overlay'}
      role="dialog"
      aria-modal="true"
      aria-label={t('expired.ariaLabel')}
    >
      <div className={app ? 'ios-auth-screen__content' : 'ai-settings-modal session-expired-modal'} ref={modalRef} tabIndex={-1}>
        <header className={app ? 'ios-auth-screen__header' : 'ai-settings-header'}>
          <h2>{t('expired.title')}</h2>
        </header>
        <div className={app ? 'ios-auth-screen__body' : 'ai-settings-body'}>
          <p className={app ? 'ios-auth-screen__lead' : 'ai-settings-blurb'}>
            {t('expired.blurb')}
          </p>
          <form onSubmit={handleSubmit} className={app ? 'login-form login-form--app' : 'login-form'}>
            {/* Google (and Apple on the web) redirect away and back — the
                chart is kept in this device's storage, so it's still here
                on return. */}
            <GoogleSignInButton disabled={busy} onError={setError} />
            {showAppleSignIn() && (
              <>
                <AppleSignInButton disabled={busy} onError={setError} />
                <AppleSignInHint />
              </>
            )}
            <div className="login-or">{t('expired.orWithEmail')}</div>
            {app ? <div className="ios-form-group">{fieldsEls}</div> : fieldsEls}
            {error && <div className="login-error" role="alert">{error}</div>}
            <button type="submit" className={app ? 'ios-button ios-button--filled' : 'login-button'} disabled={busy}>
              {busy ? t('login.signingIn') : t('expired.submit')}
            </button>
            <button
              type="button"
              className={app ? 'ios-button ios-button--plain' : 'login-switch'}
              onClick={async () => {
                if (await confirmDialog({
                  title: t('expired.confirmTitle'),
                  message: t('expired.confirmMessage'),
                  confirmLabel: t('expired.confirmLabel'),
                  cancelLabel: t('expired.cancelLabel'),
                  danger: true,
                })) onSignOut();
              }}
              disabled={busy}
            >
              {t('expired.signOutInstead')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
