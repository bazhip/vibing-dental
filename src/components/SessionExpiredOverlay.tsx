import React, { useState } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AppleSignInButton, AppleSignInHint, showAppleSignIn } from './AppleSignInButton';
import { confirmDialog } from './ui/dialogs';
import { supabase } from '../utils/supabaseClient';
import { useModalFocus } from '../hooks/useModalFocus';
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
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const modalRef = useModalFocus(true);

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
          ? 'Incorrect email or password.'
          : authError.status === 429 || /rate limit|too many/i.test(msg)
            ? 'Too many attempts. Wait a minute and try again.'
            : /fetch|network/i.test(msg)
              ? 'Can’t reach ToothOps — check your connection and try again.'
              : msg || 'Couldn’t sign in. Please try again.'
      );
      setPassword('');
      return;
    }
    // Success: the SIGNED_IN auth event clears the expired state in App.
  };

  return (
    <div className="ai-settings-overlay" role="dialog" aria-modal="true" aria-label="Session expired — sign in to continue">
      <div className="ai-settings-modal session-expired-modal" ref={modalRef} tabIndex={-1}>
        <header className="ai-settings-header">
          <h2>Your session expired</h2>
        </header>
        <div className="ai-settings-body">
          <p className="ai-settings-blurb">
            Your chart is still here, saved on this device. Sign in again to
            resume cloud saving and pick up where you left off.
          </p>
          <form onSubmit={handleSubmit} className="login-form">
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
            <div className="login-or">or sign in with email</div>
            <label className="login-field">
              <span className="login-field__label">Email</span>
              <input
                type="email"
                className="login-input"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="login-field">
              <span className="login-field__label">Password</span>
              <input
                type="password"
                className="login-input"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </label>
            {error && <div className="login-error" role="alert">{error}</div>}
            <button type="submit" className="login-button" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in and continue charting'}
            </button>
            <button
              type="button"
              className="login-switch"
              onClick={async () => {
                if (await confirmDialog({
                  title: 'Sign out and remove this chart?',
                  message: 'The chart kept on this device is cleared. Anything not yet saved to the cloud is lost — sign in instead to keep it.',
                  confirmLabel: 'Sign out and remove',
                  cancelLabel: 'Keep chart',
                  danger: true,
                })) onSignOut();
              }}
              disabled={busy}
            >
              Sign out instead — leave this chart
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
