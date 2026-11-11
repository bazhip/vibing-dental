import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { markExplicitSignOut } from '../utils/signOutIntent';
import { friendlyError } from './ui/dialogs';
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
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(friendlyError(updateError, 'Could not set the password. Please try again.'));
      return;
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
          <h1>{mode === 'invite' ? 'Activate your account' : 'Set a new password'}</h1>
          <p>
            {mode === 'invite'
              ? 'You’ve been added to a practice on ToothOps — choose a password to finish.'
              : 'You followed a password reset link — choose a new password.'}
          </p>
          {email && (
            <p className="login-hint" style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              {mode === 'invite' ? 'Account for ' : 'Signing in as '}
              <strong>{email}</strong>
            </p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="login-form" noValidate>
          {/* Lets password managers save the new password under the
              right account. */}
          {email && <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />}
          <label className="login-field">
            <span className="login-field__label">New password</span>
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
                aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          <span className={`login-hint${password && password.length < MIN_PASSWORD ? ' login-hint--warn' : ''}`}>
            At least {MIN_PASSWORD} characters{password ? ` · ${password.length}/${MIN_PASSWORD}` : ''}.
          </span>
          <label className="login-field">
            <span className="login-field__label">Confirm new password</span>
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
            {busy ? 'Saving…' : mode === 'invite' ? 'Activate account' : 'Set password'}
          </button>
          <button type="button" className="login-switch" onClick={backToSignIn} disabled={busy}>
            Back to sign in
          </button>
        </form>
      </div>
    </div>
  );
};
