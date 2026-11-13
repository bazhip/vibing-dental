import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { isNativeApp } from './platform';
import { readJson, writeJson, removeKey } from '../utils/storage';

/** Lock after this long in the background. */
export const LOCK_AFTER_MS = 5 * 60 * 1000;

/** When the app last went to the background. Kept in storage because iOS
 *  may kill a backgrounded app; the next cold start reads it back. */
const BACKGROUNDED_KEY = 'toothops.backgroundedAt';
const BACKGROUNDED_VERSION = 1;

/** Face ID / passcode errors that no retry can fix: the device has no
 *  passcode (or no usable authentication at all). */
const UNAVAILABLE_CODES = new Set(['passcodeNotSet', 'noDeviceCredential', 'biometryNotAvailable']);

export function shouldLock(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= LOCK_AFTER_MS;
}

/** Cold start with a session from a previous run: lock when the app was
 *  backgrounded 5+ minutes ago, or when we never saw it go to the
 *  background (killed some other way) — err on the side of locking. */
export function shouldLockOnLaunch(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt === null || shouldLock(backgroundedAt, now);
}

function readBackgroundedAt(): number | null {
  const v = readJson<unknown>(BACKGROUNDED_KEY, BACKGROUNDED_VERSION, null);
  return typeof v === 'number' ? v : null;
}

export interface AppLockState {
  locked: boolean;
  /** Opaque cover while the app is in the background, so the app-switcher
   *  snapshot never shows a chart. */
  covered: boolean;
  /** Face ID / passcode can't work on this device (no passcode set). */
  unavailable: boolean;
  unlock: () => Promise<void>;
}

/** Locks the app after 5 minutes in the background (including across iOS
 *  killing it: pass `lockOnLaunch` when the app opened with a session from
 *  a previous run); unlock via Face ID with device-passcode fallback.
 *  Inert on web. */
export function useAppLock({ lockOnLaunch = false }: { lockOnLaunch?: boolean } = {}): AppLockState {
  const [locked, setLocked] = useState(
    () => lockOnLaunch && isNativeApp() && shouldLockOnLaunch(readBackgroundedAt(), Date.now())
  );
  const [covered, setCovered] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  // One system prompt at a time: overlapping authenticate() calls (resume
  // + a "Try again" tap, StrictMode double effects) would stack prompts.
  const inFlight = useRef(false);
  const lockedAtMount = useRef(locked);

  const unlock = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await BiometricAuth.authenticate({ reason: 'Unlock ToothOps', allowDeviceCredential: true });
      setUnavailable(false);
      setLocked(false);
    } catch (e) {
      // Cancelled or failed: stay locked so the user can retry. If the
      // device can't authenticate at all, say so instead of re-prompting.
      const code = (e as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && UNAVAILABLE_CODES.has(code)) setUnavailable(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    if (lockedAtMount.current) void unlock();
    let cancelled = false;
    const handles: Array<{ remove: () => unknown }> = [];
    const track = (p: Promise<{ remove: () => unknown }>) =>
      p.then((hd) => (cancelled ? hd.remove() : handles.push(hd))).catch(() => undefined);
    track(App.addListener('pause', () => {
      const now = Date.now();
      backgroundedAt.current = now;
      writeJson(BACKGROUNDED_KEY, BACKGROUNDED_VERSION, now);
      setCovered(true);
    }));
    track(App.addListener('resume', () => {
      const lock = shouldLock(backgroundedAt.current ?? readBackgroundedAt(), Date.now());
      backgroundedAt.current = null;
      removeKey(BACKGROUNDED_KEY, BACKGROUNDED_VERSION);
      if (lock) {
        setLocked(true);
        void unlock();
      }
      setCovered(false);
    }));
    return () => {
      cancelled = true;
      handles.forEach((hd) => hd.remove());
    };
  }, [unlock]);

  return { locked, covered, unavailable, unlock };
}
