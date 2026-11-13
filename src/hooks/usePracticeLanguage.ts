import React from 'react';
import i18n from '../i18n';
import { supabase } from '../utils/supabaseClient';
import { standardReminderText } from '../utils/reminderDefaults';
import { REPORT_LOCALES, ReportLocale, appReportLocale, isReportLocale } from '../utils/ownerReportI18n';
import { LocalizedError } from '../utils/apiErrors';

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
type Listener = (practiceId: string, lng: ReportLocale | null) => void;
const listeners = new Set<Listener>();

export function usePracticeLanguage(practiceId: string | null, open = true): UsePracticeLanguageReturn {
  const [stored, setStored] = React.useState<ReportLocale | null>(null);
  const [loaded, setLoaded] = React.useState(!supabase || !practiceId);

  // Other instances (e.g. Practice settings) changing the language reach this one at once.
  React.useEffect(() => {
    const onChange: Listener = (id, lng) => { if (id === practiceId) setStored(lng); };
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, [practiceId]);

  React.useEffect(() => {
    if (!open) return;
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
  }, [practiceId, open]);

  const current = stored ?? appReportLocale();
  const save = React.useCallback(
    async (lng: ReportLocale | null): Promise<void> => {
      if (!supabase || !practiceId) throw new LocalizedError(i18n.t('settings.noPractice', { ns: 'reminders' }));
      // The auto-send job reads only the stored reminder text, so text that is still the old
      // language's standard follows the switch; anything the owner edited stays as written.
      const payload: Record<string, string | null> = { client_language: lng };
      try {
        const { data } = await supabase.from('practices').select('reminder_subject, reminder_body, reminder_auto').eq('id', practiceId).maybeSingle();
        const row = data as { reminder_subject?: string | null; reminder_body?: string | null; reminder_auto?: boolean | null } | null;
        // "Standard" means the standard text of ANY report language (an English default stored
        // by an older version stays standard for an owner whose app is French).
        const standards = REPORT_LOCALES.map((l) => standardReminderText(l));
        const to = standardReminderText(lng ?? appReportLocale());
        // With auto-send on, an empty field would make the job send its English fallback.
        const fill = !!row?.reminder_auto;
        if (row && (row.reminder_subject ? standards.some((s) => s.subject === row.reminder_subject) : fill)) payload.reminder_subject = to.subject;
        if (row && (row.reminder_body ? standards.some((s) => s.body === row.reminder_body) : fill)) payload.reminder_body = to.body;
      } catch {
        // Reminder text is best effort; the language change itself still goes through.
      }
      const { error } = await supabase.from('practices').update(payload).eq('id', practiceId);
      if (error) throw new Error(error.message);
      setStored(lng);
      listeners.forEach((l) => l(practiceId, lng));
    },
    [practiceId],
  );

  return { language: current, explicit: stored !== null, loaded, save };
}
