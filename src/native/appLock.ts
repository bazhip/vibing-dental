import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { isNativeApp } from './platform';

/** Lock after this long in the background. */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

export function shouldLock(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= LOCK_AFTER_MS;
}

/** Locks the app after 5 minutes in the background; unlock via Face ID
 *  with device-passcode fallback. Inert on web. */
export function useAppLock(): { locked: boolean; unlock: () => Promise<void> } {
  const [locked, setLocked] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    try {
      await BiometricAuth.authenticate({ reason: 'Unlock ToothOps', allowDeviceCredential: true });
      setLocked(false);
    } catch {
      /* cancelled or failed: stay locked so the user can retry */
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    const handles: Array<{ remove: () => unknown }> = [];
    const track = (p: Promise<{ remove: () => unknown }>) =>
      p.then((hd) => (cancelled ? hd.remove() : handles.push(hd))).catch(() => undefined);
    track(App.addListener('pause', () => {
      backgroundedAt.current = Date.now();
    }));
    track(App.addListener('resume', () => {
      const lock = shouldLock(backgroundedAt.current, Date.now());
      backgroundedAt.current = null;
      if (lock) {
        setLocked(true);
        void unlock();
      }
    }));
    return () => {
      cancelled = true;
      handles.forEach((hd) => hd.remove());
    };
  }, [unlock]);

  return { locked, unlock };
}
