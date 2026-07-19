import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import './Login.css';

interface ResetPasswordProps {
  /** Called once the new password is set — the recovery session is now a
   *  normal signed-in session. */
  onDone: () => void;
  /** 'invite' = new teammate activating their account; 'recovery' = a
   *  password reset. Only changes the copy. */
  mode?: 'invite' | 'recovery';
}

/**
 * Shown when the user arrives via a password-recovery link OR a team
 * invite link (both establish a temporary session). One job: set the
 * password, which activates/recovers the account.
 */
export const ResetPassword: React.FC<ResetPasswordProps> = ({ onDone, mode = 'recovery' }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
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
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="login-field">
            <span className="login-field__label">New password</span>
            <input
              type="password"
              className="login-input"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          <label className="login-field">
            <span className="login-field__label">Confirm new password</span>
            <input
              type="password"
              className="login-input"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" className="login-button" disabled={busy}>
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  );
};
