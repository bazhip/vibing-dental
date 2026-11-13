import React, { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { LanguageSwitcher } from '../i18n/LanguageSwitcher';
import { Browser } from '@capacitor/browser';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AppleSignInButton, AppleSignInHint, showAppleSignIn } from './AppleSignInButton';
import { LegalNotice, LEGAL_ACTION } from './LegalNotice';
import { TERMS_VERSION, markTermsPending } from '../utils/terms';
import { supabase, cloudEnabled } from '../utils/supabaseClient';
import { uploadPracticeLogo } from '../hooks/useProfile';
import { authRedirectUrl } from '../native/authReturn';
import { WEB_ORIGIN } from '../native/platform';
import { PlanKey, AccountType, PlanTier, planByKey, planKeyFor, TRIAL_DAYS, PAID_SIGNUP, formatPlanPrice } from '../constants/plans';
import { Icon } from '../ios/icons';
import './Login.css';

interface LoginProps {
  onAuthenticate: () => void;
  /** Which form to show first — the landing page's CTAs pick. */
  initialMode?: 'signin' | 'signup';
  /** Rendered bare (no full-page background) inside the landing overlay. */
  embedded?: boolean;
  /** Plan preselected from the pricing page's card CTAs. */
  initialPlan?: PlanKey;
  /** Inside the iOS app: sign-in only — no sign-up form or plans; new
   *  users are pointed to the website instead. */
  appMode?: boolean;
}

type Mode = 'signin' | 'signup' | 'check-email';

/** Supabase auth errors carry a stable `code`; older servers only a
 *  message. Turn either into something a clinic user can act on. */
type AuthErr = { code?: string; message?: string; status?: number } | null | undefined;
const errCode = (e: AuthErr) => e?.code ?? '';
const isUnconfirmed = (e: AuthErr) =>
  errCode(e) === 'email_not_confirmed' || /email not confirmed/i.test(e?.message ?? '');
function friendlyAuthError(e: AuthErr): string {
  const at = i18n.getFixedT(null, 'auth');
  const ct = i18n.getFixedT(null, 'common');
  const code = errCode(e);
  const msg = e?.message ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return at('errors.invalidCredentials');
  if (code === 'user_already_exists' || /already registered/i.test(msg)) return at('errors.userExists');
  if (code === 'weak_password' || /password should be/i.test(msg)) return at('errors.weakPassword');
  if (code === 'email_address_invalid' || /invalid email|unable to validate email/i.test(msg)) return at('errors.invalidEmail');
  if (e?.status === 429 || /rate limit|too many/i.test(msg)) return ct('errors.rateLimit');
  if (/fetch|network/i.test(msg)) return ct('errors.network');
  return msg || ct('errors.generic');
}

/** The app icon's symbol on the app's sign-in screen (not text). */
const APP_ICON = 'tooth';
const MIN_PASSWORD = 8;
const RESEND_COOLDOWN_S = 60;

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
export const Login: React.FC<LoginProps> = ({ onAuthenticate, initialMode = 'signin', embedded = false, initialPlan, appMode = false }) => {
  const { t } = useTranslation('auth');
  const [mode, setMode] = useState<Mode>(appMode ? 'signin' : initialMode);
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
      options: { emailRedirectTo: authRedirectUrl() },
    });
    setBusy(false);
    if (resendError) {
      setError(friendlyAuthError(resendError));
      return;
    }
    setCooldown(RESEND_COOLDOWN_S);
    setNotice(t('login.confirmationSent', { email: target }));
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
        setError(t('errors.wrongPassword'));
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
        setError(t('errors.namesRequired'));
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setError(t('errors.passwordMin', { min: MIN_PASSWORD }));
        return;
      }
      setBusy(true);
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
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
        setError(t('errors.userExists'));
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
        setError(t('errors.confirmFirst'));
        return;
      }
      setError(friendlyAuthError(authError));
      setPassword('');
      return;
    }
    onAuthenticate();
  };

  // iOS app (sign-in only): system styling — inset-grouped fields, filled
  // and plain iOS buttons. The website form keeps its own classes.
  const app = appMode;
  const fieldClass = app ? 'ios-field' : 'login-field';
  const fieldLabelClass = app ? 'ios-field__label' : 'login-field__label';
  const inputClass = app ? 'ios-field__input' : 'login-input';
  const linkButtonClass = app ? 'ios-button ios-button--plain' : 'login-switch';

  if (mode === 'check-email') {
    return (
      <div className={embedded ? 'login-container login-container--embedded' : 'login-container'}>
        <div className="login-box">
          <div className="login-check">
            <div className="login-check__icon" aria-hidden="true">✉</div>
            <h1 className="login-check__title">{t('checkEmail.title')}</h1>
            <p className="login-check__lead">
              <Trans t={t} i18nKey="checkEmail.lead" values={{ email: pendingEmail }} components={{ strong: <strong /> }} />
            </p>
            <ul className="login-check__tips">
              <li>
                <Trans t={t} i18nKey="checkEmail.tipSender" shouldUnescape components={{ strong: <strong /> }} />
              </li>
              <li>{t('checkEmail.tipSpam')}</li>
              {PAID_SIGNUP && <li>{t('checkEmail.tipTrial', { days: TRIAL_DAYS })}</li>}
            </ul>
            {error && <div className="login-error" role="alert">{error}</div>}
            {notice && <div className="login-notice" role="status">{notice}</div>}
            <button
              type="button"
              className="login-button"
              onClick={() => resendConfirmation(pendingEmail)}
              disabled={busy || cooldown > 0}
            >
              {busy ? t('checkEmail.sending') : cooldown > 0 ? t('checkEmail.resendWait', { seconds: cooldown }) : t('checkEmail.resend')}
            </button>
            <button type="button" className="login-switch" onClick={() => { setEmail(pendingEmail); switchMode('signup'); }}>
              {t('checkEmail.wrongEmail')}
            </button>
            <button type="button" className="login-switch" onClick={() => { setEmail(pendingEmail); switchMode('signin'); }}>
              {t('checkEmail.confirmed')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const emailField = cloudEnabled && (
    <label className={fieldClass}>
      <span className={fieldLabelClass}>{t('login.email')}</span>
      <input
        type="email"
        className={inputClass}
        placeholder={t('login.emailPlaceholder')}
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoFocus={!signup && !app}
      />
    </label>
  );
  const passwordField = (
    <label className={fieldClass}>
      <span className={fieldLabelClass}>{t('login.password')}</span>
      <span className={app ? 'ios-field__control' : 'login-password'}>
        <input
          type={showPassword ? 'text' : 'password'}
          className={inputClass}
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus={!cloudEnabled && !app}
          minLength={signup ? MIN_PASSWORD : undefined}
        />
        <button
          type="button"
          className={app ? 'ios-field__accessory' : 'login-password__toggle'}
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
          aria-pressed={showPassword}
        >
          {showPassword ? t('login.hide') : t('login.show')}
        </button>
      </span>
    </label>
  );

  return (
    <div className={embedded ? 'login-container login-container--embedded' : app ? 'login-container login-container--app' : 'login-container'}>
      <div className="login-box">
        <div className="login-header">
          {app && (
            <span className="login-app-icon" aria-hidden="true">
              <Icon name={APP_ICON} size={34} />
            </span>
          )}
          <LanguageSwitcher compact />
          <h1>{t('brand')}</h1>
          <p>
            {!cloudEnabled
              ? t('login.subtitle.standalone')
              : signup
              ? t('login.subtitle.signup')
              : t('login.subtitle.signin')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {cloudEnabled && (mode === 'signin' || signup) && (
            <>
              <GoogleSignInButton
                label={signup ? t('google.signup') : t('google.continue')}
                disabled={busy}
                onError={setError}
                onStart={markTermsPending}
              />
              {showAppleSignIn() && (
                <>
                  <AppleSignInButton
                    label={signup ? t('auth.apple.signUp', { ns: 'account' }) : t('auth.apple.continue', { ns: 'account' })}
                    disabled={busy}
                    onError={setError}
                    onStart={markTermsPending}
                  />
                  <AppleSignInHint />
                </>
              )}
              {/* The notice sits by both buttons: the email form's submit
                  is far below on the long signup form. */}
              <LegalNotice action={signup ? LEGAL_ACTION.signingUp : LEGAL_ACTION.continuing} className="login-legal--google" />
              <div className="login-or">{signup ? t('login.orWithEmail.signup') : t('login.orWithEmail.signin')}</div>
            </>
          )}
          {cloudEnabled && signup && (
            <>
              <label className="login-field">
                <span className="login-field__label">{t('login.practiceName')}</span>
                <input
                  type="text"
                  className="login-input"
                  placeholder={t('login.practiceNamePlaceholder')}
                  autoComplete="organization"
                  value={practiceName}
                  onChange={(e) => setPracticeName(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="login-field">
                <span className="login-field__label">{t('login.doctorName')}</span>
                <input
                  type="text"
                  className="login-input"
                  placeholder={t('login.doctorNamePlaceholder')}
                  autoComplete="name"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                />
              </label>
              <label className="login-logo-field">
                <span>
                  {logoFile ? t('login.logoPicked', { name: logoFile.name }) : t('login.logoOptional')}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label={t('login.logoOptional')}
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>

              {!PAID_SIGNUP && (
                <span className="login-hint">
                  {t('login.betaHint')}
                </span>
              )}

              {PAID_SIGNUP && (
              <>
              <fieldset className="login-plan" aria-label={t('login.accountType')}>
                <legend className="login-plan__legend">{t('login.whoIsCharting')}</legend>
                <label className={accountType === 'individual' ? 'login-plan__opt login-plan__opt--on' : 'login-plan__opt'}>
                  <input
                    type="radio"
                    name="account-type"
                    checked={accountType === 'individual'}
                    onChange={() => setAccountType('individual')}
                  />
                  <span className="login-plan__body">
                    <strong>{t('login.individual')}</strong>
                    <span>{t('login.individualBlurb', { price: formatPlanPrice(planByKey('individual_basic')?.priceMonthly ?? 0) })}</span>
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
                    <strong>{t('login.practice')}</strong>
                    <span>{t('login.practiceBlurb', { seats: planByKey('practice_basic')?.seats ?? 0, price: formatPlanPrice(planByKey('practice_basic')?.priceMonthly ?? 0) })}</span>
                  </span>
                </label>
              </fieldset>

              <fieldset className="login-plan" aria-label={t('login.choosePlan')}>
                <legend className="login-plan__legend">{t('login.planLegend', { days: TRIAL_DAYS })}</legend>
                <label className={plan === 'basic' ? 'login-plan__opt login-plan__opt--on' : 'login-plan__opt'}>
                  <input
                    type="radio"
                    name="plan"
                    checked={plan === 'basic'}
                    onChange={() => setPlan('basic')}
                  />
                  <span className="login-plan__body">
                    <strong>{t('login.basic', { price: formatPlanPrice(planByKey(planKeyFor(accountType, 'basic'))?.priceMonthly ?? 0) })}</strong>
                    <span>{t('login.basicBlurb')}</span>
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
                    <strong>{t('login.pro', { price: formatPlanPrice(planByKey(planKeyFor(accountType, 'pro'))?.priceMonthly ?? 0) })}</strong>
                    <span>{t('login.proBlurb')}</span>
                  </span>
                </label>
                {chosenPlan && (
                  <span className="login-hint">
                    {t('login.planSummary', { plan: chosenPlan.name, price: formatPlanPrice(chosenPlan.priceMonthly), days: TRIAL_DAYS })}
                  </span>
                )}
              </fieldset>
              </>
              )}
            </>
          )}

          {app ? (
            <div className="ios-form-group">
              {emailField}
              {passwordField}
            </div>
          ) : (
            <>
              {emailField}
              {passwordField}
            </>
          )}
          {cloudEnabled && signup && (
            <span className={`login-hint${password && password.length < MIN_PASSWORD ? ' login-hint--warn' : ''}`}>
              {password ? t('login.passwordHintCount', { min: MIN_PASSWORD, length: password.length }) : t('login.passwordHint', { min: MIN_PASSWORD })}
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
                  {cooldown > 0 ? t('login.resendConfirmationWait', { seconds: cooldown }) : t('login.resendConfirmation')}
                </button>
              )}
              {accountExists && (
                <button type="button" className="login-inline-action" onClick={() => switchMode('signin')}>
                  {t('login.signInInstead')}
                </button>
              )}
            </div>
          )}
          {notice && <div className="login-notice" role="status">{notice}</div>}

          <button type="submit" className={app ? 'ios-button ios-button--filled' : 'login-button'} disabled={busy}>
            {busy
              ? signup
                ? t('login.creating')
                : t('login.signingIn')
              : signup
              ? t('login.createAccount')
              : !cloudEnabled
              ? t('login.continue')
              : t('login.signIn')}
          </button>
          {/* The app shows the notice once, by the sign-in buttons above. */}
          {cloudEnabled && !app && <LegalNotice action={signup ? LEGAL_ACTION.creatingAccount : LEGAL_ACTION.signingIn} />}

          {cloudEnabled && !signup && (
            <button
              type="button"
              className={linkButtonClass}
              onClick={async () => {
                if (!supabase) return;
                const target = email.trim();
                if (!target) {
                  setError(t('errors.emailFirst'));
                  return;
                }
                setBusy(true);
                setError('');
                setNotice('');
                const { error: resetError } = await supabase.auth.resetPasswordForEmail(target, {
                  redirectTo: authRedirectUrl(),
                });
                setBusy(false);
                if (resetError) setError(friendlyAuthError(resetError));
                else setNotice(t('login.resetSent', { email: target }));
              }}
            >
              {t('login.forgotPassword')}
            </button>
          )}

          {cloudEnabled && appMode && (
            <a
              href={WEB_ORIGIN}
              className={app ? 'ios-button ios-button--plain login-signup-link' : 'login-switch login-signup-link'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                void Browser.open({ url: WEB_ORIGIN });
              }}
            >
              {t('auth.signUpOnWeb', { ns: 'account' })}
            </a>
          )}

          {cloudEnabled && !appMode && (
            <button
              type="button"
              className="login-switch"
              onClick={() => switchMode(signup ? 'signin' : 'signup')}
            >
              {signup ? t('login.haveAccount') : t('login.newHere')}
            </button>
          )}

        </form>
      </div>
    </div>
  );
};
