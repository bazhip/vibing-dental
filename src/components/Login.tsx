import React, { useState } from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import './Login.css';

interface LoginProps {
  onAuthenticate: () => void;
  /** Which form to show first — the landing page's CTAs pick. */
  initialMode?: 'signin' | 'signup';
  /** Rendered bare (no full-page background) inside the landing overlay. */
  embedded?: boolean;
}

type Mode = 'signin' | 'signup';

/**
 * Sign-in / sign-up screen.
 *
 * With a Supabase project configured: email + password accounts. Signup
 * also collects the practice profile (company + doctor name), passed as
 * user metadata — a database trigger turns it into the `profiles` row.
 * Free while the product finds its feet; billing comes later.
 *
 * Without Supabase (local dev, tests): the legacy shared practice
 * password, so the app keeps working standalone.
 */
export const Login: React.FC<LoginProps> = ({ onAuthenticate, initialMode = 'signin', embedded = false }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [practiceName, setPracticeName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const signup = mode === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cloudEnabled || !supabase) {
      if (password === 'margles') {
        setError('');
        onAuthenticate();
      } else {
        setError('Incorrect password');
        setPassword('');
      }
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');

    if (signup) {
      if (!practiceName.trim() || !doctorName.trim()) {
        setError('Practice and doctor name are required — they appear on your charts.');
        setBusy(false);
        return;
      }
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            practice_name: practiceName.trim(),
            doctor_name: doctorName.trim(),
          },
        },
      });
      setBusy(false);
      if (authError) {
        setError(authError.message);
        return;
      }
      if (data.session) {
        onAuthenticate();
      } else {
        // Email confirmation is on — tell them what happens next.
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signin');
      }
      return;
    }

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (authError) {
      setError('Incorrect email or password');
      setPassword('');
      return;
    }
    onAuthenticate();
  };

  return (
    <div className={embedded ? 'login-container login-container--embedded' : 'login-container'}>
      <div className="login-box">
        <div className="login-header">
          <h1>ToothOps Charting</h1>
          <p>
            {!cloudEnabled
              ? 'Enter the practice password to continue'
              : signup
              ? 'Create your practice account'
              : 'Sign in with your practice account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {cloudEnabled && signup && (
            <>
              <input
                type="text"
                className="login-input"
                placeholder="Practice name (e.g. SoCal Tooth Ops)"
                aria-label="Practice name"
                autoComplete="organization"
                value={practiceName}
                onChange={(e) => setPracticeName(e.target.value)}
                autoFocus
              />
              <input
                type="text"
                className="login-input"
                placeholder="Doctor name (e.g. Dr. M. Smith, DVM, DAVDC)"
                aria-label="Doctor name"
                autoComplete="name"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
              />
            </>
          )}

          {cloudEnabled && (
            <input
              type="email"
              className="login-input"
              placeholder="Email"
              aria-label="Email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!signup}
            />
          )}

          <input
            type="password"
            className="login-input"
            placeholder="Password"
            aria-label="Password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus={!cloudEnabled}
          />

          {error && <div className="login-error" role="alert">{error}</div>}
          {notice && <div className="login-notice" role="status">{notice}</div>}

          <button type="submit" className="login-button" disabled={busy}>
            {busy ? 'Working…' : signup ? 'Create account' : 'Continue'}
          </button>

          {cloudEnabled && (
            <button
              type="button"
              className="login-switch"
              onClick={() => {
                setMode(signup ? 'signin' : 'signup');
                setError('');
                setNotice('');
              }}
            >
              {signup
                ? 'Already have an account? Sign in'
                : 'New here? Create a practice account'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
