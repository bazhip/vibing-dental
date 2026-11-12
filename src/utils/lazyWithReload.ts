import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReloadingLazy<T extends React.ComponentType<any>> = React.LazyExoticComponent<T> & {
  /** Fetch the chunk now, in the background, so a later deploy can't
   *  strand this tab without it (see below). Safe to call repeatedly. */
  preload: () => void;
};

/**
 * React.lazy that survives redeploys. Every deploy renames the hashed
 * chunk files; a tab still running the previous index.html asks for the
 * old names, gets the SPA fallback HTML instead ("'text/html' is not a
 * valid JavaScript MIME type"), and crashes the Suspense boundary. One
 * forced reload picks up the fresh index — chart work is safe, the
 * working copy lives in localStorage. A time guard stops reload loops
 * when the network is genuinely broken rather than stale.
 *
 * That reload swallows whatever the user clicked (the screen flashes and
 * nothing opens — they have to click again), so components opened from
 * a click should also be `preload()`ed soon after the page loads: once
 * the chunk is in memory, no deploy can break it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): ReloadingLazy<T> {
  // One shared load: a preload that's already finished (or in flight)
  // is what the lazy component renders from. A failed load is forgotten
  // so the next attempt can retry (and, if the chunk is stale, reload).
  let pending: Promise<{ default: T }> | null = null;
  const load = () => {
    if (!pending) {
      pending = factory().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
  const Lazy = React.lazy(() =>
    load().catch((error: unknown) => {
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
  return Object.assign(Lazy, {
    preload: () => {
      // Background warm-up only: a failure here is silent (the real
      // render retries and handles it).
      load().catch(() => {});
    },
  });
}

/** Run `fn` when the browser is idle (or after `fallbackMs` where
 *  requestIdleCallback isn't available, e.g. older Safari). */
export function whenIdle(fn: () => void, fallbackMs = 2500): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout: fallbackMs * 2 });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(fn, fallbackMs);
  return () => window.clearTimeout(t);
}
