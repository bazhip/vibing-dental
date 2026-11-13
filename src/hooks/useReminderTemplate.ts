import React from 'react';
import i18n from '../i18n';
import { supabase } from '../utils/supabaseClient';
import type { ReportLocale } from '../utils/ownerReportI18n';
import { usePracticeLanguage } from './usePracticeLanguage';

/**
 * The practice's recheck-reminder email template (subject + body with
 * {{patient}} {{owner}} {{practice}} {{recheck_date}} placeholders) and
 * the auto-send toggle. Read by the composer to prefill; edited by owners
 * in Practice settings. Both the manual composer and the scheduled cron
 * job use the same template.
 */

export interface ReminderTemplate {
  subject: string;
  body: string;
  auto: boolean;
  /** Days before the recheck date to auto-send (0 = on the date). */
  leadDays: number;
}

/** Literal placeholders passed back to the catalog so t() leaves them in the text. */
const KEPT = { patient: '{{patient}}', owner: '{{owner}}', practice: '{{practice}}', recheck_date: '{{recheck_date}}' };

/** The standard reminder, in the practice's client language. */
export function defaultReminder(lng: ReportLocale): ReminderTemplate {
  const t = i18n.getFixedT(lng, 'client');
  return {
    subject: t('reminder.subject', KEPT),
    body: t('reminder.body', KEPT),
    auto: false,
    leadDays: 0,
  };
}

/** Substitute the placeholders; blanks fall back to wording in `lng`. */
export function fillTemplate(
  text: string,
  vars: { patient?: string; owner?: string; practice?: string; recheckDate?: string },
  lng: ReportLocale,
): string {
  const t = i18n.getFixedT(lng, 'client');
  return text
    .replace(/\{\{patient\}\}/g, () => vars.patient || t('reminder.fallback.pet'))
    .replace(/\{\{owner\}\}/g, () => vars.owner || t('reminder.fallback.owner'))
    .replace(/\{\{practice\}\}/g, () => vars.practice || t('reminder.fallback.practice'))
    .replace(/\{\{recheck_date\}\}/g, () => vars.recheckDate || '');
}

interface StoredReminder {
  subject: string;
  body: string;
  auto: boolean;
  leadDays: number;
}

export function useReminderTemplate(practiceId: string, open: boolean) {
  const { language, loaded: languageLoaded } = usePracticeLanguage(practiceId || null);
  // What the database holds; empty text means "use the standard reminder".
  const [stored, setStored] = React.useState<StoredReminder | null>(null);
  const [rowLoaded, setRowLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!supabase || !practiceId) {
        if (!cancelled) setRowLoaded(true);
        return;
      }
      const { data } = await supabase
        .from('practices')
        .select('reminder_subject, reminder_body, reminder_auto, reminder_lead_days')
        .eq('id', practiceId)
        .maybeSingle();
      if (!cancelled) {
        if (data) {
          setStored({
            subject: data.reminder_subject || '',
            body: data.reminder_body || '',
            auto: !!data.reminder_auto,
            leadDays: data.reminder_lead_days ?? 0,
          });
        }
        setRowLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [practiceId, open]);

  const loaded = rowLoaded && languageLoaded;
  const template = React.useMemo<ReminderTemplate>(() => {
    const d = defaultReminder(language);
    return stored
      ? { subject: stored.subject || d.subject, body: stored.body || d.body, auto: stored.auto, leadDays: stored.leadDays }
      : d;
  }, [stored, language]);

  const save = React.useCallback(async (next: ReminderTemplate): Promise<void> => {
    if (!supabase || !practiceId) throw new Error(i18n.t('settings.noPractice', { ns: 'reminders' }));
    // Untouched standard text stays empty in the database (it follows the practice
    // language) — unless auto-send is on: the scheduled job only reads these columns,
    // so the text as shown must be stored for it to send.
    const d = defaultReminder(language);
    const field = (text: string, standard: string) => (text === standard && !next.auto ? '' : text);
    const row: StoredReminder = {
      subject: field(next.subject, d.subject),
      body: field(next.body, d.body),
      auto: next.auto,
      leadDays: next.leadDays,
    };
    const { error } = await supabase
      .from('practices')
      .update({
        reminder_subject: row.subject,
        reminder_body: row.body,
        reminder_auto: row.auto,
        reminder_lead_days: row.leadDays,
      })
      .eq('id', practiceId);
    if (error) throw new Error(error.message);
    setStored(row);
  }, [practiceId, language]);

  return { template, loaded, save, language };
}
