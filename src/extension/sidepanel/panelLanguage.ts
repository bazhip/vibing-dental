import { useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { normalizeChartPrefs } from '../../utils/chartSettings';
import { applyLanguage } from '../../i18n/applyLanguage';
import { resolveLanguage } from '../../i18n/resolveLanguage';
import type { AppLanguage } from '../../i18n/config';

/** The account's language setting (profiles.chart_prefs.language, as in the app), or null. */
async function accountLanguage(userId: string): Promise<AppLanguage | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('profiles').select('chart_prefs').eq('id', userId).maybeSingle();
    const stored = (data as { chart_prefs?: unknown } | null)?.chart_prefs;
    if (error || stored == null) return null;
    return normalizeChartPrefs(stored).language;
  } catch {
    return null;
  }
}

/** Applies the signed-in account's language, else the browser's, else English. */
export function usePanelLanguage(userId: string | null): void {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = userId ? await accountLanguage(userId) : null;
      if (!cancelled) await applyLanguage(resolveLanguage(saved, navigator.languages ?? [], true));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
