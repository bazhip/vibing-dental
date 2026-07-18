import React, { useState } from 'react';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { uploadPracticeLogo } from '../hooks/useProfile';
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<'basic' | 'pro'>('basic');

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
            plan,
          },
        },
      });
      setBusy(false);
      if (authError) {
        setError(authError.message);
        return;
      }
      if (data.session) {
        // Optional logo picked during signup — upload now that the
        // session exists. Failure isn't fatal; Practice settings can
        // retry later.
        if (logoFile) {
          try {
            await uploadPracticeLogo(logoFile);
          } catch {
            // ignore — the account is created either way
          }
        }
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
              <label className="login-logo-field">
                <span>
                  {logoFile ? `Logo: ${logoFile.name}` : 'Practice logo (optional)'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Practice logo (optional)"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>

              <fieldset className="login-plan" aria-label="Choose a plan">
                <legend className="login-plan__legend">Plan · free during early access</legend>
                <label className={plan === 'basic' ? 'login-plan__opt login-plan__opt--on' : 'login-plan__opt'}>
                  <input
                    type="radio"
                    name="plan"
                    checked={plan === 'basic'}
                    onChange={() => setPlan('basic')}
                  />
                  <span className="login-plan__body">
                    <strong>Basic</strong>
                    <span>Full charting, PDFs, team, reminders. 30 images per chart.</span>
                  </span>
                </label>
                <label className={plan === 'pro' ? 'login-plan__opt login-plan__opt--on' : 'login-plan__opt'}>
                  <input
                    type="radio"
                    name="plan"
                    checked={plan === 'pro'}
                    onChange={() => setPlan('pro')}
                  />
                  <span className="login-plan__body">
                    <strong>Pro</strong>
                    <span>Everything in Basic, plus AI voice autofill and 100 images per chart.</span>
                  </span>
                </label>
              </fieldset>
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
          {cloudEnabled && signup && (
            <span className="login-hint">At least 6 characters.</span>
          )}

          {error && <div className="login-error" role="alert">{error}</div>}
          {notice && <div className="login-notice" role="status">{notice}</div>}

          <button type="submit" className="login-button" disabled={busy}>
            {busy
              ? signup
                ? 'Creating account…'
                : 'Signing in…'
              : signup
              ? 'Create account'
              : !cloudEnabled
              ? 'Continue'
              : 'Sign in'}
          </button>

          {cloudEnabled && !signup && (
            <button
              type="button"
              className="login-switch"
              onClick={async () => {
                if (!supabase) return;
                const target = email.trim();
                if (!target) {
                  setError('Enter your email above first, then tap "Forgot password".');
                  return;
                }
                setBusy(true);
                setError('');
                setNotice('');
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(target, {
                  redirectTo: window.location.origin + window.location.pathname,
                });
                setBusy(false);
                if (resetError) setError(resetError.message);
                else setNotice('Password reset link sent — check your email.');
              }}
            >
              Forgot password?
            </button>
          )}

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
