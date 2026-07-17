import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import './Login.css';

interface ResetPasswordProps {
  /** Called once the new password is set — the recovery session is now a
   *  normal signed-in session. */
  onDone: () => void;
}

/**
 * Shown when the user arrives via a password-recovery email link
 * (Supabase fires PASSWORD_RECOVERY and signs them into a temporary
 * session). One job: set the new password.
 */
export const ResetPassword: React.FC<ResetPasswordProps> = ({ onDone }) => {
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
          <h1>Set a new password</h1>
          <p>You followed a password reset link — choose a new password.</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="password"
            className="login-input"
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            className="login-input"
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" className="login-button" disabled={busy}>
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  );
};
