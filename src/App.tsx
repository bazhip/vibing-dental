import React, { useState, useEffect, Suspense } from 'react';
import './styles/themes.css';
import './styles/boards.css';
import './App.css';
import { readString, writeString, removeKey } from './utils/storage';
import { supabase, cloudEnabled } from './utils/supabaseClient';

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

const AUTH_KEY = 'auth';
const AUTH_VERSION = 1;
const TRIAL_KEY = 'trial';
const TRIAL_NOTIFIED_KEY = 'trial.notified';

/** Tell the practice owner someone started a trial — fire-and-forget,
 *  once per browser. No personal data leaves the page (there is none
 *  to send; trials are anonymous). */
function notifyTrialStarted(): void {
  if (readString(TRIAL_NOTIFIED_KEY, 1, '') === '1') return;
  writeString(TRIAL_NOTIFIED_KEY, 1, '1');
  fetch('https://hiefwyyoyiqxmxaxyxmx.supabase.co/functions/v1/signup-alert', {
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

  const endTrial = (nextAuth: 'signup' | null) => {
    removeKey(TRIAL_KEY, 1);
    setTrialMode(false);
    setLandingAuth(nextAuth);
  };

  // "Homepage" from the app menu — view the landing page without
  // leaving the session (or the trial); "Back to the app" returns.
  const [showHome, setShowHome] = useState(false);

  useEffect(() => {
    if (!cloudEnabled || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setIsAuthenticated(!!data.session);
      setSessionChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setIsAuthenticated(!!session);
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

  if (recovering) {
    return (
      <Suspense fallback={null}>
        <ResetPassword onDone={() => setRecovering(false)} />
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
            onRequestAccount={() => endTrial('signup')}
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
        <EntryGrid onGoHome={() => setShowHome(true)} />
      </Suspense>
    </div>
  );
};

export default App;
