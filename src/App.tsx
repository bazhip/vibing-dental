import React, { useState, useEffect, useRef, Suspense } from 'react';
import './styles/themes.css';
import './styles/boards.css';
import './App.css';
import { readString, writeString, removeKey } from './utils/storage';
import { supabase, cloudEnabled } from './utils/supabaseClient';
import { clearChartStorage } from './hooks/useChartState';
import { consumeExplicitSignOut, markExplicitSignOut } from './utils/signOutIntent';
import { SessionExpiredOverlay } from './components/SessionExpiredOverlay';
import { useHashRoute } from './hooks/useHashRoute';

// Split the two halves of the app: visitors on the marketing page don't
// download the charting screen (data grid, diagrams, voice pipeline),
// and signed-in users skip the landing animation bundle.
const EntryGrid = React.lazy(() => import('./EntryGrid'));
const Landing = React.lazy(() =>
  import('./components/Landing').then((m) => ({ default: m.Landing }))
);
const ResetPassword = React.lazy(() =>
  import('./components/ResetPassword').then((m) => ({ default: m.ResetPassword }))
);
const BillingGate = React.lazy(() =>
  import('./components/BillingGate').then((m) => ({ default: m.BillingGate }))
);

const AUTH_KEY = 'auth';
const AUTH_VERSION = 1;
const TRIAL_KEY = 'trial';
const TRIAL_NOTIFIED_KEY = 'trial.notified';

/** Tell the practice owner someone started a trial — fire-and-forget,
 *  once per browser. No personal data leaves the page (there is none
 *  to send; trials are anonymous). */
function notifyTrialStarted(): void {
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return;
  if (readString(TRIAL_NOTIFIED_KEY, 1, '') === '1') return;
  writeString(TRIAL_NOTIFIED_KEY, 1, '1');
  fetch(`${base}/functions/v1/signup-alert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trial: true }),
  }).catch(() => {
    // best-effort — never bother the trial user about it
  });
}

/**
 * Root application component with authentication.
 *
 * With Supabase configured, the session IS the auth state — Supabase
 * persists and refreshes it, and signing out anywhere flips the app back
 * to the login screen. Without Supabase (local dev / tests), the legacy
 * shared-password flag in localStorage keeps standalone mode working.
 */
const App: React.FC = () => {
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
    () => /[#&]type=(invite|signup)\b/.test(window.location.hash)
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
    notifyTrialStarted();
  };

  const endTrial = (nextAuth: 'signup' | 'signin' | null) => {
    // Signing IN to an existing account is usually a different person on
    // a shared clinic machine — don't let the trial's patient data leak
    // into their session. Signing UP keeps the trial chart so the new
    // account can save the work that convinced them.
    if (nextAuth === 'signin') clearChartStorage();
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
        }
        lastUserIdRef.current = session.user.id;
        setLastEmail(session.user.email ?? '');
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
        setSessionExpired(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (cloudEnabled) return; // session lives with Supabase, not our flag
    if (isAuthenticated) writeString(AUTH_KEY, AUTH_VERSION, '1');
    else removeKey(AUTH_KEY, AUTH_VERSION);
  }, [isAuthenticated]);

  if (!sessionChecked) {
    return null;
  }

  if (recovering || invited) {
    return (
      <Suspense fallback={null}>
        <ResetPassword
          mode={invited ? 'invite' : 'recovery'}
          onDone={() => {
            setRecovering(false);
            setInvited(false);
          }}
        />
      </Suspense>
    );
  }

  if (showHome && (isAuthenticated || trialMode)) {
    return (
      <Suspense fallback={null}>
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
        <Suspense fallback={null}>
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
      <Suspense fallback={null}>
        <Landing
          onAuthenticate={() => {
            removeKey(TRIAL_KEY, 1);
            setTrialMode(false);
            setIsAuthenticated(true);
          }}
          onTryFree={startTrial}
          initialAuth={landingAuth}
        />
      </Suspense>
    );
  }

  return (
    <div className="App">
      <Suspense fallback={null}>
        {/* Signed in — but the charting app is behind the subscription
            gate (trials, comps, and admins pass straight through). */}
        <BillingGate>
          <EntryGrid onGoHome={() => setShowHome(true)} />
        </BillingGate>
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
