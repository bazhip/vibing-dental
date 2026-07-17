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

  if (!isAuthenticated) {
    return (
      <Suspense fallback={null}>
        <Landing onAuthenticate={() => setIsAuthenticated(true)} />
      </Suspense>
    );
  }

  return (
    <div className="App">
      <Suspense fallback={null}>
        <EntryGrid />
      </Suspense>
    </div>
  );
};

export default App;
