import React from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', cb: () => void) => void;
}
interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/**
 * Keep the screen on while `active` (Screen Wake Lock API). Dictation needs
 * it: on a phone, the screen sleeping cuts the mic and ends the session.
 *
 * The browser drops the lock whenever the page is hidden (app switch,
 * lock button), so it's re-requested when the page is visible again.
 * Unsupported browsers (iOS before 16.4) or a refused request just leave
 * the screen's normal auto-lock in charge.
 */
export function useWakeLock(active: boolean): void {
  React.useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!active || !wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const s = await wakeLock.request('screen');
        if (cancelled) { s.release().catch(() => {}); return; }
        sentinel = s;
      } catch {
        /* refused (battery saver, not allowed) — normal auto-lock applies */
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') acquire(); };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release().catch(() => {});
    };
  }, [active]);
}
