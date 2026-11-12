import React, { useState } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { LegalNotice } from './LegalNotice';
import { TERMS_VERSION, markTermsPending } from '../utils/terms';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { uploadPracticeLogo } from '../hooks/useProfile';
import { PlanKey, AccountType, PlanTier, planByKey, planKeyFor, TRIAL_DAYS, PAID_SIGNUP } from '../constants/plans';
import './Login.css';

interface LoginProps {
  onAuthenticate: () => void;
  /** Which form to show first — the landing page's CTAs pick. */
  initialMode?: 'signin' | 'signup';
  /** Rendered bare (no full-page background) inside the landing overlay. */
  embedded?: boolean;
  /** Plan preselected from the pricing page's card CTAs. */
  initialPlan?: PlanKey;
}

type Mode = 'signin' | 'signup' | 'check-email';

/** Supabase auth errors carry a stable `code`; older servers only a
 *  message. Turn either into something a clinic user can act on. */
type AuthErr = { code?: string; message?: string; status?: number } | null | undefined;
const errCode = (e: AuthErr) => e?.code ?? '';
const isUnconfirmed = (e: AuthErr) =>
  errCode(e) === 'email_not_confirmed' || /email not confirmed/i.test(e?.message ?? '');
function friendlyAuthError(e: AuthErr): string {
  const code = errCode(e);
  const msg = e?.message ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'Incorrect email or password.';
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return 'An account with this email already exists.';
  if (code === 'weak_password' || /password should be/i.test(msg)) return 'Choose a stronger password — at least 8 characters.';
  if (code === 'email_address_invalid' || /invalid email|unable to validate email/i.test(msg)) return 'Enter a valid email address.';
  if (e?.status === 429 || /rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a minute and try again.';
  if (/fetch|network/i.test(msg)) return 'Can’t reach ToothOps — check your connection and try again.';
  return msg || 'Something went wrong. Please try again.';
}

const MIN_PASSWORD = 8;
const RESEND_COOLDOWN_S = 60;
/** Where confirmation / reset links land: back on this site. */
const authRedirect = () => window.location.origin + window.location.pathname;

/**
 * Sign-in / sign-up screen.
 *
 * With a Supabase project configured: email + password accounts. Signup
 * also collects the practice profile (company + doctor name) plus the
 * chosen plan, passed as user metadata — a database trigger turns the
 * profile into the `profiles` row, and after email confirmation the
 * BillingGate picks the plan back up and sends them to Stripe Checkout
 * (every plan starts with a free trial).
 *
 * Without Supabase (local dev, tests): the legacy shared practice
 * password, so the app keeps working standalone.
 */
export const Login: React.FC<LoginProps> = ({ onAuthenticate, initialMode = 'signin', embedded = false, initialPlan }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [practiceName, setPracticeName] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /** Email awaiting confirmation — drives the check-your-inbox screen and
   *  the "resend" action after an unconfirmed sign-in attempt. */
  const [pendingEmail, setPendingEmail] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [accountExists, setAccountExists] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setNeedsConfirm(false);
    setAccountExists(false);
  };

  const resendConfirmation = async (target: string) => {
    if (!supabase || !target || cooldown > 0) return;
    setBusy(true);
    setError('');
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: target,
      options: { emailRedirectTo: authRedirect() },
    });
    setBusy(false);
    if (resendError) {
      setError(friendlyAuthError(resendError));
      return;
    }
    setCooldown(RESEND_COOLDOWN_S);
    setNotice(`Confirmation email sent to ${target}.`);
  };
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [accountType, setAccountType] = useState<AccountType>(
    initialPlan ? (planByKey(initialPlan)?.accountType ?? 'individual') : 'individual'
  );
  const [plan, setPlan] = useState<PlanTier>(
    initialPlan ? (planByKey(initialPlan)?.tier ?? 'basic') : 'basic'
  );

  const chosenPlan = planByKey(planKeyFor(accountType, plan));

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

    setError('');
    setNotice('');
    setNeedsConfirm(false);
    setAccountExists(false);

    if (signup) {
      if (!practiceName.trim() || !doctorName.trim()) {
        setError('Practice and doctor name are required — they appear on your charts.');
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setError(`Password must be at least ${MIN_PASSWORD} characters.`);
        return;
      }
      setBusy(true);
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirect(),
          data: {
            practice_name: practiceName.trim(),
            doctor_name: doctorName.trim(),
            // While paid signup is off, accounts land on the free tier.
            plan: PAID_SIGNUP ? plan : 'free',
            account_type: PAID_SIGNUP ? accountType : 'individual',
            // Agreed by the notice beside "Create account" — the new-user
            // trigger copies it onto the profile with the server's time.
            terms_version: TERMS_VERSION,
          },
        },
      });
      setBusy(false);
      if (authError) {
        if (errCode(authError) === 'user_already_exists') setAccountExists(true);
        setError(friendlyAuthError(authError));
        return;
      }
      // An already-registered email comes back as a user with no
      // identities (Supabase hides account existence from the API).
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setAccountExists(true);
        setError('An account with this email already exists.');
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
        // Email confirmation is on — a dedicated screen says exactly what
        // to do next (instead of a sign-in form that can't work yet).
        setPendingEmail(email.trim());
        setPassword('');
        setCooldown(RESEND_COOLDOWN_S);
        setMode('check-email');
      }
      return;
    }

    setBusy(true);
    markTermsPending();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (authError) {
      if (isUnconfirmed(authError)) {
        setPendingEmail(email.trim());
        setNeedsConfirm(true);
        setError('Confirm your email first — open the link we sent you to activate your account.');
        return;
      }
      setError(friendlyAuthError(authError));
      setPassword('');
      return;
    }
    onAuthenticate();
  };

  if (mode === 'check-email') {
    return (
      <div className={embedded ? 'login-container login-container--embedded' : 'login-container'}>
        <div className="login-box">
          <div className="login-check">
            <div className="login-check__icon" aria-hidden="true">✉</div>
            <h1 className="login-check__title">Check your inbox</h1>
            <p className="login-check__lead">
              We sent a confirmation link to <strong>{pendingEmail}</strong>.
              Open it on this device to activate your account — you’ll be signed in automatically.
            </p>
            <ul className="login-check__tips">
              <li>It comes from <strong>ToothOps &lt;noreply@toothops.app&gt;</strong> and usually arrives within a minute.</li>
              <li>Not there? Check your spam or promotions folder.</li>
              {PAID_SIGNUP && <li>Your {TRIAL_DAYS}-day free trial starts once you confirm.</li>}
            </ul>
            {error && <div className="login-error" role="alert">{error}</div>}
            {notice && <div className="login-notice" role="status">{notice}</div>}
            <button
              type="button"
              className="login-button"
              onClick={() => resendConfirmation(pendingEmail)}
              disabled={busy || cooldown > 0}
            >
              {busy ? 'Sending…' : cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
            </button>
            <button type="button" className="login-switch" onClick={() => { setEmail(pendingEmail); switchMode('signup'); }}>
              Wrong email? Go back and fix it
            </button>
            <button type="button" className="login-switch" onClick={() => { setEmail(pendingEmail); switchMode('signin'); }}>
              Already confirmed? Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          {cloudEnabled && (mode === 'signin' || signup) && (
            <>
              <GoogleSignInButton
                label={signup ? 'Sign up with Google' : 'Continue with Google'}
                disabled={busy}
                onError={setError}
                onStart={markTermsPending}
              />
              {/* The notice sits by both buttons: the email form's submit
                  is far below on the long signup form. */}
              <LegalNotice action={signup ? 'signing up' : 'continuing'} className="login-legal--google" />
              <div className="login-or">or {signup ? 'sign up' : 'sign in'} with email</div>
            </>
          )}
          {cloudEnabled && signup && (
            <>
              <label className="login-field">
                <span className="login-field__label">Practice name</span>
                <input
                  type="text"
                  className="login-input"
                  placeholder="e.g. SoCal Tooth Ops"
                  autoComplete="organization"
                  value={practiceName}
                  onChange={(e) => setPracticeName(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="login-field">
                <span className="login-field__label">Doctor name</span>
                <input
                  type="text"
                  className="login-input"
                  placeholder="e.g. Dr. M. Smith, DVM, DAVDC"
                  autoComplete="name"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                />
              </label>
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

              {!PAID_SIGNUP && (
                <span className="login-hint">
                  Free during the beta: full charting, diagrams &amp; PDFs, AI voice
                  dictation, and up to 10 images per chart.
                </span>
              )}

              {PAID_SIGNUP && (
              <>
              <fieldset className="login-plan" aria-label="Account type">
                <legend className="login-plan__legend">Who's charting?</legend>
                <label className={accountType === 'individual' ? 'login-plan__opt login-plan__opt--on' : 'login-plan__opt'}>
                  <input
                    type="radio"
                    name="account-type"
                    checked={accountType === 'individual'}
                    onChange={() => setAccountType('individual')}
                  />
                  <span className="login-plan__body">
                    <strong>Individual</strong>
                    <span>Just you. From $20/mo.</span>
                  </span>
                </label>
                <label className={accountType === 'practice' ? 'login-plan__opt login-plan__opt--on' : 'login-plan__opt'}>
                  <input
                    type="radio"
                    name="account-type"
                    checked={accountType === 'practice'}
                    onChange={() => setAccountType('practice')}
                  />
                  <span className="login-plan__body">
                    <strong>Practice</strong>
                    <span>Up to 5 team members sharing charts. From $60/mo.</span>
                  </span>
                </label>
              </fieldset>

              <fieldset className="login-plan" aria-label="Choose a plan">
                <legend className="login-plan__legend">Plan · {TRIAL_DAYS}-day free trial on every plan</legend>
                <label className={plan === 'basic' ? 'login-plan__opt login-plan__opt--on' : 'login-plan__opt'}>
                  <input
                    type="radio"
                    name="plan"
                    checked={plan === 'basic'}
                    onChange={() => setPlan('basic')}
                  />
                  <span className="login-plan__body">
                    <strong>Basic · ${planByKey(planKeyFor(accountType, 'basic'))?.priceMonthly}/mo</strong>
                    <span>Full charting, PDFs, reminders. 30 images per chart.</span>
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
                    <strong>Pro · ${planByKey(planKeyFor(accountType, 'pro'))?.priceMonthly}/mo</strong>
                    <span>Everything in Basic, plus AI voice autofill and 100 images per chart.</span>
                  </span>
                </label>
                {chosenPlan && (
                  <span className="login-hint">
                    {chosenPlan.name} — ${chosenPlan.priceMonthly}/mo after a {TRIAL_DAYS}-day free trial. You'll enter payment
                    after confirming your email; cancel anytime.
                  </span>
                )}
              </fieldset>
              </>
              )}
            </>
          )}

          {cloudEnabled && (
            <label className="login-field">
              <span className="login-field__label">Email</span>
              <input
                type="email"
                className="login-input"
                placeholder="you@yourpractice.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={!signup}
              />
            </label>
          )}

          <label className="login-field">
            <span className="login-field__label">Password</span>
            <span className="login-password">
              <input
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                autoComplete={signup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus={!cloudEnabled}
                minLength={signup ? MIN_PASSWORD : undefined}
              />
              <button
                type="button"
                className="login-password__toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          {cloudEnabled && signup && (
            <span className={`login-hint${password && password.length < MIN_PASSWORD ? ' login-hint--warn' : ''}`}>
              At least {MIN_PASSWORD} characters{password ? ` · ${password.length}/${MIN_PASSWORD}` : ''}.
            </span>
          )}

          {error && (
            <div className="login-error" role="alert">
              {error}
              {needsConfirm && (
                <button
                  type="button"
                  className="login-inline-action"
                  onClick={() => resendConfirmation(pendingEmail)}
                  disabled={busy || cooldown > 0}
                >
                  {cooldown > 0 ? `Resend confirmation email (${cooldown}s)` : 'Resend confirmation email'}
                </button>
              )}
              {accountExists && (
                <button type="button" className="login-inline-action" onClick={() => switchMode('signin')}>
                  Sign in instead
                </button>
              )}
            </div>
          )}
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
          {cloudEnabled && <LegalNotice action={signup ? 'creating an account' : 'signing in'} />}

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
                  redirectTo: authRedirect(),
                });
                setBusy(false);
                if (resetError) setError(friendlyAuthError(resetError));
                else setNotice(`If an account exists for ${target}, a password reset link is on its way. It comes from noreply@toothops.app.`);
              }}
            >
              Forgot password?
            </button>
          )}

          {cloudEnabled && (
            <button
              type="button"
              className="login-switch"
              onClick={() => switchMode(signup ? 'signin' : 'signup')}
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
