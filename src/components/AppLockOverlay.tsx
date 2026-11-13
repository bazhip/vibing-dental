import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppLock } from '../native/appLock';
import { signOutAndSweep } from '../utils/signOutAndSweep';

const coverStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center',
  background: 'var(--bg, #fff)', color: 'var(--text, #111)',
};

/** While the cover is up, everything else on the page is inert: no taps,
 *  no keyboard focus, hidden from VoiceOver. Restores on removal. */
function useInertBackground(active: boolean, cover: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const marked: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === cover.current || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      marked.push(el);
    }
    return () => marked.forEach((el) => el.removeAttribute('inert'));
  }, [active, cover]);
}

/** Full-screen cover shown after the app has been backgrounded for a
 *  while (and, blank, while it's in the background so the app-switcher
 *  snapshot shows no chart). Renders nothing on web.
 *  `lockOnLaunch`: the app opened with a session from a previous run. */
export const AppLockOverlay: React.FC<{ lockOnLaunch?: boolean }> = ({ lockOnLaunch }) => {
  const { locked, covered, unavailable, unlock } = useAppLock({ lockOnLaunch });
  const ref = useRef<HTMLDivElement>(null);
  const active = locked || covered;
  useInertBackground(active, ref);
  useEffect(() => {
    if (locked) ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, [locked, unavailable]);

  if (!active) return null;
  if (!locked) {
    return createPortal(<div ref={ref} data-testid="privacy-cover" aria-hidden="true" style={coverStyle} />, document.body);
  }
  return createPortal(
    <div ref={ref} role="dialog" aria-modal="true" aria-label="ToothOps is locked" style={coverStyle}>
      <h2>ToothOps is locked</h2>
      {unavailable ? (
        // No automatic re-prompt: it can only fail again. "Try again" is
        // for after they've set a passcode in Settings.
        <p>
          Face ID and the device passcode aren't available on this device. To unlock ToothOps,
          set a passcode in the Settings app and tap Try again, or sign out.
        </p>
      ) : (
        <p>Unlock to protect patient records.</p>
      )}
      <button type="button" onClick={() => void unlock()}>Try again</button>
      <button
        type="button"
        // No unsaved-changes prompt here: the lock screen hides the chart,
        // and signing out from it must still clear patient data.
        onClick={() => void signOutAndSweep()}
        style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit' }}
      >
        Sign out
      </button>
    </div>,
    document.body
  );
};
