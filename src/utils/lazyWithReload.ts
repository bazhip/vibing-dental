import React from 'react';

/**
 * React.lazy that survives redeploys. Every deploy renames the hashed
 * chunk files; a tab still running the previous index.html asks for the
 * old names, gets the SPA fallback HTML instead ("'text/html' is not a
 * valid JavaScript MIME type"), and crashes the Suspense boundary. One
 * forced reload picks up the fresh index — chart work is safe, the
 * working copy lives in localStorage. A time guard stops reload loops
 * when the network is genuinely broken rather than stale.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    factory().catch((error: unknown) => {
      const RELOADED_AT_KEY = 'toothops.chunk-reload-at';
      let recentlyReloaded = false;
      try {
        const last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
        recentlyReloaded = Date.now() - last < 30_000;
        if (!recentlyReloaded) sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
      } catch {
        // sessionStorage unavailable — a reload can still only happen
        // once per page lifetime, since success replaces this module.
      }
      if (!recentlyReloaded) {
        window.location.reload();
        // Keep Suspense pending while the reload happens.
        return new Promise<never>(() => {});
      }
      throw error;
    })
  );
}
