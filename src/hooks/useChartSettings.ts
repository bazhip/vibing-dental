import React from 'react';
import { supabase } from '../utils/supabaseClient';
import { readJson, writeJson } from '../utils/storage';
import { ChartPrefs, DEFAULT_CHART_PREFS, normalizeChartPrefs } from '../utils/chartSettings';

/**
 * Per-person chart settings (see utils/chartSettings).
 *
 * Signed in: loaded from and saved to the user's own profile row
 * (profiles.chart_prefs), so they follow the person to every device.
 * Also cached in this browser so the chart opens with them before the
 * profile loads, and used as-is without an account.
 *
 * Starting point (nothing saved to the account yet): this browser's
 * existing choices from before the settings page, then the defaults —
 * nobody's current setup changes. A database without the column yet
 * (migration not run) just keeps the local values.
 */

const LOCAL_KEY = 'chart.prefs';

/** This browser's pre-settings choices (the old per-browser keys). */
function legacyLocal(): ChartPrefs {
  return {
    ...DEFAULT_CHART_PREFS,
    mirrorToDiagnosis: readJson('charting.mirrorToDiagnosis', 1, DEFAULT_CHART_PREFS.mirrorToDiagnosis),
    pdfIncludeGrid: readJson('charting.pdfIncludeGrid', 1, DEFAULT_CHART_PREFS.pdfIncludeGrid),
    chartingView: readJson('charting.view', 1, DEFAULT_CHART_PREFS.chartingView),
    pdfIncludeImages: readJson('imaging.pdfIncludeImages', 1, DEFAULT_CHART_PREFS.pdfIncludeImages),
  };
}

export interface UseChartSettingsReturn {
  prefs: ChartPrefs;
  /** Change some settings; saves to the account (or this browser). */
  update: (patch: Partial<ChartPrefs>) => Promise<void>;
  /** Saved to the account (vs. only this browser). */
  followsAccount: boolean;
  /** The account's settings have been read (or there's no account) —
   *  wait for this before acting on a setting, e.g. "What's new". */
  loaded: boolean;
}

export function useChartSettings(profileLoaded: boolean): UseChartSettingsReturn {
  const [prefs, setPrefs] = React.useState<ChartPrefs>(() =>
    normalizeChartPrefs(readJson(LOCAL_KEY, 1, null), legacyLocal()),
  );
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const [userId, setUserId] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState(!supabase);

  React.useEffect(() => {
    if (!supabase || !profileLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: s } = await supabase!.auth.getSession();
        const uid = s.session?.user.id ?? null;
        if (cancelled || !uid) return;
        setUserId(uid);
        const { data, error } = await supabase!.from('profiles').select('chart_prefs').eq('id', uid).maybeSingle();
        if (cancelled || error) return;
        const stored = (data as { chart_prefs?: unknown } | null)?.chart_prefs;
        if (stored == null) return; // nothing on the account yet: keep this browser's
        const next = normalizeChartPrefs(stored, prefsRef.current);
        setPrefs(next);
        writeJson(LOCAL_KEY, 1, next);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [profileLoaded]);

  const update = React.useCallback(async (patch: Partial<ChartPrefs>) => {
    const next = normalizeChartPrefs({ ...prefsRef.current, ...patch });
    prefsRef.current = next;
    setPrefs(next);
    writeJson(LOCAL_KEY, 1, next);
    if (supabase && userId) {
      const { error } = await supabase.from('profiles').update({ chart_prefs: next }).eq('id', userId);
      if (error) throw new Error(error.message);
    }
  }, [userId]);

  return { prefs, update, followsAccount: !!supabase && !!userId, loaded };
}
