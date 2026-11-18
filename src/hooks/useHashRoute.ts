import React from 'react';

// All route consumers consult the same gate before reading the browser URL.
// This prevents a parent route from unmounting an editor during a guarded traversal.
let routeGate: ((event: HashChangeEvent) => boolean) | null = null;
const gatedEvents = new WeakMap<Event, boolean>();
function allowRouteEvent(event: HashChangeEvent): boolean {
  if (!gatedEvents.has(event)) gatedEvents.set(event, routeGate?.(event) ?? true);
  return gatedEvents.get(event)!;
}

/**
 * Hand-rolled hash routing — no router dependency for three routes.
 *
 *   #/chart                the working chart (default for any unknown hash)
 *   #/chart/:id            a specific saved chart (deep-linkable)
 *   #/chart/:id/:section   a chart section (patient, charting, …)
 *   #/chart/:section       a section of the working chart (trial mode)
 *   #/library              the Patients workspace
 *   #/rechecks             due and overdue rechecks
 *   #/home                 the landing page viewed from inside the app
 *
 * Why hashes: the Back button/gesture previously exited the site (the
 * whole app lived on one history entry), nothing was linkable, and a
 * refresh in the library landed back on the chart. Supabase also parks
 * its auth callbacks in the hash (#access_token=…, #type=invite) — only
 * hashes that start with "#/" are treated as routes, so those pass
 * through untouched.
 */

/** The chart's section rail, in order — used to tell a section segment
 *  from a chart id in #/chart/… hashes (ids are uuids, never these). */
export const CHART_SECTION_IDS = [
  'patient',
  'consultation',
  'exam',
  'anesthesia',
  'charting',
  'diagnosis',
  'procedure',
  'imaging',
  'treatment',
  'discharge',
  'owner-report', // Legacy deep-link alias for discharge.
] as const;

export interface HashRoute {
  view: 'chart' | 'library' | 'rechecks' | 'home' | 'join' | 'settings';
  /** Present on #/join/:token (an invite to join a practice). */
  joinToken?: string;
  /** Present on #/chart/:id links. */
  chartId?: string;
  /** Present when the hash names a chart section. */
  section?: string;
}

function isSection(segment: string | undefined): segment is string {
  return !!segment && (CHART_SECTION_IDS as readonly string[]).includes(segment);
}

function parse(): HashRoute {
  const h = window.location.hash;
  if (h === '#/settings') return { view: 'settings' };
  if (h === '#/rechecks') return { view: 'rechecks' };
  if (h === '#/library') return { view: 'library' };
  if (h === '#/home') return { view: 'home' };
  const join = h.match(/^#\/join\/([A-Za-z0-9_.-]+)$/);
  if (join) return { view: 'join', joinToken: join[1] };
  const m = h.match(/^#\/chart(?:\/([A-Za-z0-9-]+))?(?:\/([A-Za-z0-9-]+))?\/?$/);
  if (m) {
    const [, first, second] = m;
    // '#/chart/patient' — a bare section, no chart id (trial mode).
    if (isSection(first)) return { view: 'chart', section: first === 'owner-report' ? 'discharge' : first };
    return { view: 'chart', chartId: first, section: isSection(second) ? second === 'owner-report' ? 'discharge' : second : undefined };
  }
  return { view: 'chart' };
}

export function useHashRoute(): {
  route: HashRoute;
  /** Go to a hash. `replace` swaps the current history entry instead of
   *  pushing (used to canonicalize, so Back isn't polluted). */
  navigate: (hash: string, opts?: { replace?: boolean }) => void;
} {
  const [route, setRoute] = React.useState<HashRoute>(() => {
    if (typeof window.history.state?.workspaceIndex !== 'number') {
      window.history.replaceState({ ...window.history.state, workspaceIndex: 0 }, '', window.location.href);
    }
    return parse();
  });

  React.useEffect(() => {
    const onHash = (event: HashChangeEvent) => { if (allowRouteEvent(event)) setRoute(parse()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = React.useCallback((hash: string, opts?: { replace?: boolean }) => {
    if (window.location.hash === hash) return;
    if (opts?.replace) {
      try {
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname + window.location.search + hash
        );
      } catch (err) {
        // Safari throws (SecurityError) past 100 replaceState calls per
        // 10s. A canonical hash is cosmetic — never crash the app over it.
        console.warn('Skipped a URL update', err);
        return;
      }
      // replaceState doesn't fire hashchange — broadcast it so every
      // useHashRoute instance (App, EntryGrid) stays in sync.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.history.pushState({ ...window.history.state, workspaceIndex: (window.history.state?.workspaceIndex ?? 0) + 1 }, '', window.location.pathname + window.location.search + hash);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  }, []);

  return { route, navigate };
}

/** Intercept departures before any route consumer can unmount a draft editor.
 * The shared route gate covers browser Back/Forward and links outside this component.
 */
export function useHashRouteGuard(guard: () => Promise<boolean>, enabled: boolean): void {
  React.useEffect(() => {
    if (!enabled) return;
    const acceptedHash = window.location.hash;
    const acceptedIndex = window.history.state?.workspaceIndex;
    let restored: (() => void) | undefined;
    let pending = false;
    let approved = false;
    let active = true;
    const replaceHash = (hash: string) => window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + hash);
    const onChange = () => {
      if (approved) return true;
      if (window.location.hash === acceptedHash) { restored?.(); restored = undefined; return true; }
      const destination = window.location.hash;
      if (pending) return false;
      pending = true;
      const destinationIndex = window.history.state?.workspaceIndex;
      const delta = typeof acceptedIndex === 'number' && typeof destinationIndex === 'number'
        ? acceptedIndex - destinationIndex : 0;
      const restoration = delta ? new Promise<void>((resolve) => {
        restored = resolve;
        window.history.go(delta);
      }) : Promise.resolve();
      if (!delta) replaceHash(acceptedHash);
      void Promise.all([guard(), restoration]).then(([leave]) => {
        if (!active || !leave) return;
        approved = true;
        if (delta) window.history.go(-delta);
        else { replaceHash(destination); window.dispatchEvent(new HashChangeEvent('hashchange')); }
      }).finally(() => { pending = false; });
      return false;
    };
    routeGate = onChange;
    return () => { active = false; if (routeGate === onChange) routeGate = null; };
  }, [enabled, guard]);
}
