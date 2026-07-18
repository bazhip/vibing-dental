import React from 'react';
import { supabase } from '../utils/supabaseClient';

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

export const DEFAULT_REMINDER: ReminderTemplate = {
  subject: "Time for {{patient}}'s dental recheck",
  body:
    'Hi {{owner}},\n\n' +
    'This is a friendly reminder that {{patient}} is due for a dental recheck. ' +
    'Please give us a call to schedule an appointment.\n\n' +
    'Thank you,\n{{practice}}',
  auto: false,
  leadDays: 0,
};

/** Substitute the placeholders. */
export function fillTemplate(
  text: string,
  vars: { patient?: string; owner?: string; practice?: string; recheckDate?: string }
): string {
  return text
    .replace(/\{\{patient\}\}/g, vars.patient || 'your pet')
    .replace(/\{\{owner\}\}/g, vars.owner || 'there')
    .replace(/\{\{practice\}\}/g, vars.practice || 'your veterinary practice')
    .replace(/\{\{recheck_date\}\}/g, vars.recheckDate || '');
}

export function useReminderTemplate(practiceId: string, open: boolean) {
  const [template, setTemplate] = React.useState<ReminderTemplate>(DEFAULT_REMINDER);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      if (!supabase || !practiceId) {
        if (!cancelled) setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from('practices')
        .select('reminder_subject, reminder_body, reminder_auto, reminder_lead_days')
        .eq('id', practiceId)
        .maybeSingle();
      if (!cancelled) {
        if (data) {
          setTemplate({
            subject: data.reminder_subject || DEFAULT_REMINDER.subject,
            body: data.reminder_body || DEFAULT_REMINDER.body,
            auto: !!data.reminder_auto,
            leadDays: data.reminder_lead_days ?? 0,
          });
        }
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [practiceId, open]);

  const save = React.useCallback(async (next: ReminderTemplate): Promise<void> => {
    if (!supabase || !practiceId) throw new Error('No practice to save to.');
    const { error } = await supabase
      .from('practices')
      .update({
        reminder_subject: next.subject,
        reminder_body: next.body,
        reminder_auto: next.auto,
        reminder_lead_days: next.leadDays,
      })
      .eq('id', practiceId);
    if (error) throw new Error(error.message);
    setTemplate(next);
  }, [practiceId]);

  return { template, loaded, save };
}
