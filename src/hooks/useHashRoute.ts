import React from 'react';

/**
 * Hand-rolled hash routing — no router dependency for three routes.
 *
 *   #/chart                the working chart (default for any unknown hash)
 *   #/chart/:id            a specific saved chart (deep-linkable)
 *   #/chart/:id/:section   a chart section (patient, charting, …)
 *   #/chart/:section       a section of the working chart (trial mode)
 *   #/library              the My charts dialog
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
  'exam',
  'anesthesia',
  'charting',
  'diagnosis',
  'procedure',
  'imaging',
  'treatment',
] as const;

export interface HashRoute {
  view: 'chart' | 'library' | 'home';
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
  if (h === '#/library') return { view: 'library' };
  if (h === '#/home') return { view: 'home' };
  const m = h.match(/^#\/chart(?:\/([A-Za-z0-9-]+))?(?:\/([A-Za-z0-9-]+))?\/?$/);
  if (m) {
    const [, first, second] = m;
    // '#/chart/patient' — a bare section, no chart id (trial mode).
    if (isSection(first)) return { view: 'chart', section: first };
    return { view: 'chart', chartId: first, section: isSection(second) ? second : undefined };
  }
  return { view: 'chart' };
}

export function useHashRoute(): {
  route: HashRoute;
  /** Go to a hash. `replace` swaps the current history entry instead of
   *  pushing (used to canonicalize, so Back isn't polluted). */
  navigate: (hash: string, opts?: { replace?: boolean }) => void;
} {
  const [route, setRoute] = React.useState<HashRoute>(parse);

  React.useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = React.useCallback((hash: string, opts?: { replace?: boolean }) => {
    if (window.location.hash === hash) return;
    if (opts?.replace) {
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search + hash
      );
      // replaceState doesn't fire hashchange — broadcast it so every
      // useHashRoute instance (App, EntryGrid) stays in sync.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = hash;
    }
  }, []);

  return { route, navigate };
}
