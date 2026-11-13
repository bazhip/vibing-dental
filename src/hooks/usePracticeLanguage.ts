import React from 'react';
import i18n from '../i18n';
import { supabase } from '../utils/supabaseClient';
import { ReportLocale, appReportLocale, isReportLocale } from '../utils/ownerReportI18n';

/** The practice's client language when it is a known one, else `fallback`. */
export function clientLanguageOf(
  row: { client_language?: string | null } | null,
  fallback: ReportLocale,
): ReportLocale {
  const v = row?.client_language;
  return isReportLocale(v) ? v : fallback;
}

export interface UsePracticeLanguageReturn {
  /** practices.client_language if set, else the app language (as a report language). */
  language: ReportLocale;
  /** A language has been chosen for the practice (vs. following the app language). */
  explicit: boolean;
  loaded: boolean;
  /** null clears the choice (back to the app language). */
  save: (lng: ReportLocale | null) => Promise<void>;
}

/**
 * The language a practice writes to pet owners in (practices.client_language).
 * A database without the column yet (migration not run) reads as "not set";
 * saving then fails with the database's message.
 */
export function usePracticeLanguage(practiceId: string | null): UsePracticeLanguageReturn {
  const [stored, setStored] = React.useState<ReportLocale | null>(null);
  const [loaded, setLoaded] = React.useState(!supabase || !practiceId);

  React.useEffect(() => {
    if (!supabase || !practiceId) {
      setStored(null);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const { data, error } = await supabase!
          .from('practices')
          .select('client_language')
          .eq('id', practiceId)
          .maybeSingle();
        if (cancelled) return;
        const v = (data as { client_language?: unknown } | null)?.client_language;
        setStored(!error && isReportLocale(v) ? v : null);
      } catch {
        if (!cancelled) setStored(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [practiceId]);

  const save = React.useCallback(
    async (lng: ReportLocale | null): Promise<void> => {
      if (!supabase || !practiceId) throw new Error(i18n.t('settings.noPractice', { ns: 'reminders' }));
      const { error } = await supabase.from('practices').update({ client_language: lng }).eq('id', practiceId);
      if (error) throw new Error(error.message);
      setStored(lng);
    },
    [practiceId],
  );

  return { language: stored ?? appReportLocale(), explicit: stored !== null, loaded, save };
}
