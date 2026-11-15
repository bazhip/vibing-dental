/// <reference types="chrome" />
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { supabase } from '../../utils/supabaseClient';
import { LocalizedError } from '../../utils/apiErrors';
import { friendlyError } from '../../components/ui/dialogs';
import { WEB_ORIGIN } from '../../native/platform';
import { showAppleSignIn } from '../../utils/appleSignIn';
import { signInWithProvider } from './oauth';

type Busy = 'password' | 'google' | 'apple' | null;
type AuthErrorLike = Error & { code?: string };

/** Supabase's sign-in failures the user can act on, in their language. */
function passwordError(err: AuthErrorLike): Error {
  if (err.code === 'invalid_credentials' || /invalid login credentials/i.test(err.message)) {
    return new LocalizedError(i18n.t('auth:errors.invalidCredentials'));
  }
  if (err.code === 'email_not_confirmed') return new LocalizedError(i18n.t('auth:errors.confirmFirst'));
  return err;
}

// Sign-up and password reset happen on the website.
const openWebsite = () => void chrome.tabs.create({ url: WEB_ORIGIN });

export function SignIn(): React.ReactElement {
  const { t } = useTranslation(['pims', 'auth', 'account']);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<void>) => {
    setError(null);
    setBusy(kind);
    try {
      await action();
    } catch (err) {
      setError(friendlyError(err, i18n.t('auth:errors.signInFailed')));
      if (kind === 'password') setPassword('');
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run('password', async () => {
      const { error: authError } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw passwordError(authError);
    });
  };

  return (
    <div className="sp-signin">
      <h1 className="sp-title">{t('pims:panel.signIn.title')}</h1>
      <p className="sp-lead">{t('pims:panel.signIn.lead')}</p>
      <form className="sp-form" onSubmit={submit}>
        <label className="sp-field">
          <span>{t('auth:login.email')}</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="sp-field">
          <span>{t('pims:panel.signIn.password')}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="sp-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="sp-primary" disabled={busy !== null}>
          {busy === 'password' ? t('pims:panel.signIn.busy') : t('pims:panel.signIn.submit')}
        </button>
      </form>
      <p className="sp-or">{t('pims:panel.signIn.or')}</p>
      <button type="button" className="sp-secondary" disabled={busy !== null} onClick={() => void run('google', () => signInWithProvider('google'))}>
        {busy === 'google' ? t('auth:google.opening') : t('auth:google.continue')}
      </button>
      {/* Same switch as the website: Apple only once its web provider is configured. */}
      {showAppleSignIn() && (
        <button type="button" className="sp-secondary" disabled={busy !== null} onClick={() => void run('apple', () => signInWithProvider('apple'))}>
          {busy === 'apple' ? t('account:auth.apple.busy') : t('account:auth.apple.continue')}
        </button>
      )}
      <div className="sp-links">
        <button type="button" className="sp-link" onClick={openWebsite}>
          {t('pims:panel.signIn.createAccount')}
        </button>
        <button type="button" className="sp-link" onClick={openWebsite}>
          {t('pims:panel.signIn.forgotPassword')}
        </button>
      </div>
    </div>
  );
}
