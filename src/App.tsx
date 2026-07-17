import React, { useState, useEffect } from 'react';
import './styles/themes.css';
import './styles/boards.css';
import './App.css';
import EntryGrid from './EntryGrid';
import { Landing } from './components/Landing';
import { ResetPassword } from './components/ResetPassword';
import { readString, writeString, removeKey } from './utils/storage';
import { supabase, cloudEnabled } from './utils/supabaseClient';

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
    return <ResetPassword onDone={() => setRecovering(false)} />;
  }

  if (!isAuthenticated) {
    return <Landing onAuthenticate={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="App">
      <EntryGrid />
    </div>
  );
};

export default App;
