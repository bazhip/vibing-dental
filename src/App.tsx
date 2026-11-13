import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import './styles/themes.css';
import './styles/boards.css';
import './App.css';
import { readString, writeString, removeKey } from './utils/storage';
import { supabase, cloudEnabled } from './utils/supabaseClient';
import { clearChartStorage } from './hooks/useChartState';
import { consumeExplicitSignOut, markExplicitSignOut } from './utils/signOutIntent';
import { confirmDialog } from './components/ui/dialogs';
import { AppLoading } from './components/AppLoading';
import { JoinPracticeModal } from './components/JoinPracticeModal';
import { SessionExpiredOverlay } from './components/SessionExpiredOverlay';
import { touchLastSeen } from './utils/lastSeen';
import { flushPendingTerms } from './utils/terms';
import { useHashRoute } from './hooks/useHashRoute';
import { lazyWithReload } from './utils/lazyWithReload';

// Split the two halves of the app: visitors on the marketing page don't
// download the charting screen (data grid, diagrams, voice pipeline),
// and signed-in users skip the landing animation bundle.
const EntryGrid = lazyWithReload(() => import('./EntryGrid'));
const Landing = lazyWithReload(() =>
  import('./components/Landing').then((m) => ({ default: m.Landing }))
);
const ResetPassword = lazyWithReload(() =>
  import('./components/ResetPassword').then((m) => ({ default: m.ResetPassword }))
);
const BillingGate = lazyWithReload(() =>
  import('./components/BillingGate').then((m) => ({ default: m.BillingGate }))
);

const AUTH_KEY = 'auth';
const AUTH_VERSION = 1;
const TRIAL_KEY = 'trial';
/**
 * Root application component with authentication.
 *
 * With Supabase configured, the session IS the auth state — Supabase
 * persists and refreshes it, and signing out anywhere flips the app back
 * to the login screen. Without Supabase (local dev / tests), the legacy
 * shared-password flag in localStorage keeps standalone mode working.
 */
/** True only when the session is genuinely gone (refresh token rejected),
 *  not merely when a refresh attempt failed for a transient reason. */
async function confirmSessionLost(): Promise<boolean> {
  if (!supabase) return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    // Offline: wait for the connection instead of declaring expiry.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await new Promise<void>((resolve) => window.addEventListener('online', () => resolve(), { once: true }));
    }
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (data.session) return false;
      // An auth error (revoked / expired refresh token) is a real end.
      const status = (error as { status?: number } | null)?.status ?? 0;
      if (error && status >= 400 && status < 500) return true;
    } catch {
      /* network hiccup — retry */
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  const { data } = await supabase.auth.getSession();
  return !data.session;
}

const App: React.FC = () => {
  const { t } = useTranslation('app');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => !cloudEnabled && readString(AUTH_KEY, AUTH_VERSION, '') === '1'
  );
  // With Supabase, wait for the initial session check before rendering
  // either screen — avoids a login flash for signed-in users.
  const [sessionChecked, setSessionChecked] = useState<boolean>(!cloudEnabled);
  // True when the user arrived via a password-recovery email link.
  const [recovering, setRecovering] = useState(false);
  // True when the user arrived via a team-invite link (Supabase invite
  // establishes a session but no password is set yet). Captured from the
  // URL hash before supabase-js consumes it. Both land on ResetPassword.
  const [invited, setInvited] = useState<boolean>(
    () =>
      /[#&]type=(invite|signup)\b/.test(window.location.hash) ||
      // Invite reminder emails use a password link tagged ?invite=1 —
      // show the invite wording, but only alongside a real recovery link.
      (new URLSearchParams(window.location.search).get('invite') === '1' &&
        /[#&]type=recovery\b/.test(window.location.hash))
  );
  // No-account trial (persisted so a refresh mid-trial doesn't bounce
  // back to the landing page). Signing in/up ends it.
  const [trialMode, setTrialMode] = useState<boolean>(
    () => readString(TRIAL_KEY, 1, '') === '1'
  );
  // When the trial's "Create free account" CTA sends the user back to
  // the landing page, open the signup overlay right away.
  const [landingAuth, setLandingAuth] = useState<'signin' | 'signup' | null>(null);

  const startTrial = () => {
    writeString(TRIAL_KEY, 1, '1');
    setTrialMode(true);
  };

  const endTrial = async (nextAuth: 'signup' | 'signin' | null) => {
    // Signing IN to an existing account is usually a different person on
    // a shared clinic machine — don't let the trial's patient data leak
    // into their session. Signing UP keeps the trial chart so the new
    // account can save the work that convinced them. Say so first.
    if (nextAuth === 'signin') {
      const ok = await confirmDialog({
        title: t('trialSignIn.title'),
        message: t('trialSignIn.message'),
        confirmLabel: t('trialSignIn.confirm'),
        cancelLabel: t('trialSignIn.cancel'),
      });
      if (!ok) return;
      clearChartStorage();
    }
    removeKey(TRIAL_KEY, 1);
    setTrialMode(false);
    setLandingAuth(nextAuth);
  };

  // "Homepage" from the app menu — view the landing page without
  // leaving the session (or the trial); "Back to the app" (or the Back
  // button, now that it's a route) returns.
  const { route, navigate } = useHashRoute();
  const showHome = route.view === 'home';
  const setShowHome = (next: boolean) =>
    navigate(next ? '#/home' : '#/chart', { replace: !next });

  // Session expired out from under a signed-in user (token expiry on
  // clinic Wi-Fi, revoked session, …). The chart stays mounted and a
  // sign-in overlay floats above it — see SessionExpiredOverlay.
  const [sessionExpired, setSessionExpired] = useState(false);
  // Who was signed in when the session died — prefills the overlay, and
  // detects a DIFFERENT account re-authenticating (shared machine).
  const lastUserIdRef = useRef('');
  const [lastEmail, setLastEmail] = useState('');
  // Mirror of isAuthenticated for the auth-event handler (registered
  // once, so it can't read the state directly without going stale).
  const isAuthedRef = useRef(isAuthenticated);
  useEffect(() => { isAuthedRef.current = isAuthenticated; }, [isAuthenticated]);

  useEffect(() => {
    if (!cloudEnabled || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
      if (data.session) {
        touchLastSeen();
        // Returning from Google sign-in: record the terms notice they
        // signed in next to.
        flushPendingTerms(data.session.user.id);
        lastUserIdRef.current = data.session.user.id;
        setLastEmail(data.session.user.email ?? '');
      }
      setSessionChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (session) {
        // A different account signing in over an expired session must not
        // inherit the previous patient's working chart (shared machines).
        if (lastUserIdRef.current && session.user.id !== lastUserIdRef.current) {
          clearChartStorage();
          // The previous user's chart, profile and practice are still in
          // memory — start clean so nothing of theirs is shown or saved.
          window.location.reload();
          return;
        }
        lastUserIdRef.current = session.user.id;
        setLastEmail(session.user.email ?? '');
        touchLastSeen();
        flushPendingTerms(session.user.id);
        setSessionExpired(false);
        setIsAuthenticated(true);
        return;
      }
      // No session. Deliberate sign-outs go to the landing page; anything
      // else while signed in is an expiry — keep the chart mounted.
      if (consumeExplicitSignOut() || !isAuthedRef.current) {
        setSessionExpired(false);
        setIsAuthenticated(false);
      } else {
        // Don't take "no session" at face value: a background token
        // refresh that failed (laptop asleep, flaky clinic Wi-Fi) reports
        // the same thing. Retry the refresh, wait out an offline spell,
        // and only show the sign-in overlay if the session is really gone.
        void confirmSessionLost().then((lost) => { if (lost) setSessionExpired(true); });
      }
    });

    // Keep the session fresh around real use: coming back to the tab,
    // reconnecting, or interacting after a while all renew it, so an
    // active user is never bounced. (supabase-js refreshes on a timer
    // too, but timers stall while a laptop sleeps.)
    const client = supabase;
    let lastNudge = 0;
    const nudge = () => {
      const now = Date.now();
      if (now - lastNudge < 5 * 60_000) return;
      lastNudge = now;
      void client.auth.getSession(); // refreshes the token if it's near expiry
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (isAuthedRef.current) touchLastSeen();
        client.auth.startAutoRefresh();
        lastNudge = 0;
        nudge();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('pointerdown', nudge, { passive: true });
    window.addEventListener('keydown', nudge);
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pointerdown', nudge);
      window.removeEventListener('keydown', nudge);
    };
  }, []);

  useEffect(() => {
    if (cloudEnabled) return; // session lives with Supabase, not our flag
    if (isAuthenticated) writeString(AUTH_KEY, AUTH_VERSION, '1');
    else removeKey(AUTH_KEY, AUTH_VERSION);
  }, [isAuthenticated]);

  if (!sessionChecked) {
    return <AppLoading />;
  }

  if (recovering || invited) {
    return (
      <Suspense fallback={<AppLoading />}>
        <ResetPassword
          mode={invited ? 'invite' : 'recovery'}
          onDone={() => {
            setRecovering(false);
            setInvited(false);
            // Drop the ?invite=1 tag so a reload doesn't reopen this screen.
            if (window.location.search) {
              window.history.replaceState(null, '', window.location.pathname + window.location.hash);
            }
          }}
        />
      </Suspense>
    );
  }

  if (showHome && (isAuthenticated || trialMode)) {
    return (
      <Suspense fallback={<AppLoading />}>
        <Landing
          onAuthenticate={() => {
            removeKey(TRIAL_KEY, 1);
            setTrialMode(false);
            setIsAuthenticated(true);
            setShowHome(false);
          }}
          onOpenApp={() => setShowHome(false)}
        />
      </Suspense>
    );
  }

  if (!isAuthenticated && trialMode) {
    return (
      <div className="App">
        <Suspense fallback={<AppLoading />}>
          <EntryGrid
            trial
            onRequestAccount={(mode) => endTrial(mode)}
            onGoHome={() => setShowHome(true)}
          />
        </Suspense>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<AppLoading />}>
        <Landing
          onAuthenticate={() => {
            removeKey(TRIAL_KEY, 1);
            setTrialMode(false);
            setIsAuthenticated(true);
          }}
          onTryFree={startTrial}
          // An invitation link opens sign-in straight away; the join
          // dialog follows once they're signed in.
          initialAuth={landingAuth ?? (route.view === 'join' ? 'signin' : null)}
        />
      </Suspense>
    );
  }

  return (
    <div className="App">
      <Suspense fallback={<AppLoading />}>
        {/* Signed in — but the charting app is behind the subscription
            gate (trials, comps, and admins pass straight through). */}
        <BillingGate>
          <EntryGrid onGoHome={() => setShowHome(true)} />
        </BillingGate>
        {/* Invitation link for an existing account (#/join/<token>). */}
        {route.view === 'join' && route.joinToken && (
          <JoinPracticeModal
            token={route.joinToken}
            onDone={(joined) => {
              // Joining changes the practice everything is scoped to —
              // reload so profile, team and charts load fresh.
              window.location.replace(`${window.location.pathname}#/chart`);
              if (joined) window.location.reload();
            }}
          />
        )}
      </Suspense>
      {/* Session expired mid-work: the chart stays mounted (every edit is
          in localStorage) and this overlay re-authenticates in place. */}
      {sessionExpired && (
        <SessionExpiredOverlay
          email={lastEmail}
          onSignOut={() => {
            // The user chose the landing page over re-auth. The session is
            // already gone server-side; sweep the working chart exactly
            // like a normal sign-out would (shared clinic machines), and
            // mark intent in case a stray SIGNED_OUT event still fires.
            markExplicitSignOut();
            clearChartStorage();
            setSessionExpired(false);
            setIsAuthenticated(false);
          }}
        />
      )}
    </div>
  );
};

export default App;
