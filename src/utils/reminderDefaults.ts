import i18n from '../i18n';
import type { ReportLocale } from './ownerReportI18n';

/** Literal placeholders passed back to the catalog so t() leaves them in the text. */
const KEPT = { patient: '{{patient}}', owner: '{{owner}}', practice: '{{practice}}', recheck_date: '{{recheck_date}}' };

/** The standard recheck-reminder subject and body in `lng` (placeholders intact). */
export function standardReminderText(lng: ReportLocale): { subject: string; body: string } {
  const t = i18n.getFixedT(lng, 'client');
  return { subject: t('reminder.subject', KEPT), body: t('reminder.body', KEPT) };
}
