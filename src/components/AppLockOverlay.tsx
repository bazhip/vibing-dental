import React from 'react';
import { useAppLock } from '../native/appLock';
import { markExplicitSignOut } from '../utils/signOutIntent';
import { supabase } from '../utils/supabaseClient';

/** Full-screen cover shown after the app has been backgrounded for a
 *  while. Renders nothing on web. */
export const AppLockOverlay: React.FC = () => {
  const { locked, unlock } = useAppLock();
  if (!locked) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ToothOps is locked"
      style={{
        position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center',
        background: 'var(--bg, #fff)', color: 'var(--text, #111)',
      }}
    >
      <h2>ToothOps is locked</h2>
      <p>Unlock to protect patient records.</p>
      <button type="button" onClick={() => void unlock()}>Try again</button>
      <button
        type="button"
        onClick={() => {
          markExplicitSignOut();
          void supabase?.auth.signOut();
        }}
        style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit' }}
      >
        Sign out
      </button>
    </div>
  );
};
