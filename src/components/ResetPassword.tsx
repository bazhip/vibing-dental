import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { supabase } from '../utils/supabaseClient';
import { markExplicitSignOut } from '../utils/signOutIntent';
import { friendlyError } from './ui/dialogs';
import { LegalNotice, LEGAL_ACTION } from './LegalNotice';
import { recordTermsAcceptance } from '../utils/terms';
import './Login.css';

interface ResetPasswordProps {
  /** Called once the new password is set — the recovery session is now a
   *  normal signed-in session. Also called after "Back to sign in" signs
   *  the temporary session out, so the app falls through to the landing
   *  page. */
  onDone: () => void;
  /** 'invite' = new teammate activating their account; 'recovery' = a
   *  password reset. Only changes the copy. */
  mode?: 'invite' | 'recovery';
}

export const MIN_PASSWORD = 8;

/**
 * Shown when the user arrives via a password-recovery link OR a team
 * invite link (both establish a temporary session). One job: set the
 * password, which activates/recovers the account.
 */
export const ResetPassword: React.FC<ResetPasswordProps> = ({ onDone, mode = 'recovery' }) => {
  const { t } = useTranslation('auth');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');

  // Which account this link is for — the link already established a
  // session, so the address is known. Shown so a teammate who got the
  // invite on a shared inbox knows whose account they're activating.
  React.useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setEmail(data.session?.user.email ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < MIN_PASSWORD) {
      setError(t('errors.passwordMin', { min: MIN_PASSWORD }));
      return;
    }
    if (password !== confirm) {
      setError(t('reset.mismatch'));
      return;
    }
    setBusy(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(friendlyError(updateError, t('reset.setFailed')));
      return;
    }
    // Activating sits beside the terms notice — record it.
    if (mode === 'invite') {
      const { data } = await supabase.auth.getUser();
      if (data.user) void recordTermsAcceptance(data.user.id);
    }
    onDone();
  };

  const backToSignIn = async () => {
    setBusy(true);
    // Deliberate: App sends a marked sign-out to the landing page instead
    // of treating it as an expired session.
    markExplicitSignOut();
    try {
      await supabase?.auth.signOut();
    } catch {
      // Already gone server-side — the landing page is still right.
    }
    setBusy(false);
    onDone();
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>{mode === 'invite' ? t('reset.titleInvite') : t('reset.titleRecovery')}</h1>
          <p>
            {mode === 'invite'
              ? t('reset.leadInvite')
              : t('reset.leadRecovery')}
          </p>
          {email && (
            <p className="login-hint" style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              <Trans
                t={t}
                i18nKey={mode === 'invite' ? 'reset.accountFor' : 'reset.signingInAs'}
                values={{ email }}
                components={{ strong: <strong /> }}
              />
            </p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          {/* Lets password managers save the new password under the
              right account. */}
          {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
          <label className="login-field">
            <span className="login-field__label">{t('reset.newPassword')}</span>
            <span className="login-password">
              <input
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                minLength={MIN_PASSWORD}
                autoFocus
              />
              <button
                type="button"
                className="login-password__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('reset.hidePasswords') : t('reset.showPasswords')}
                aria-pressed={showPassword}
              >
                {showPassword ? t('login.hide') : t('login.show')}
              </button>
            </span>
          </label>
          <span className={`login-hint${password && password.length < MIN_PASSWORD ? ' login-hint--warn' : ''}`}>
            {password ? t('login.passwordHintCount', { min: MIN_PASSWORD, length: password.length }) : t('login.passwordHint', { min: MIN_PASSWORD })}
          </span>
          <label className="login-field">
            <span className="login-field__label">{t('reset.confirmPassword')}</span>
            <input
              type={showPassword ? 'text' : 'password'}
              className="login-input"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setError('');
              }}
            />
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" className="login-button" disabled={busy}>
            {busy ? t('reset.saving') : mode === 'invite' ? t('reset.activate') : t('reset.setPassword')}
          </button>
          {mode === 'invite' && <LegalNotice action={LEGAL_ACTION.activating} />}
          <button type="button" className="login-switch" onClick={backToSignIn} disabled={busy}>
            {t('reset.backToSignIn')}
          </button>
        </form>
      </div>
    </div>
  );
};
