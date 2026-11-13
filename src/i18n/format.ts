import i18n from './index';
import { PSEUDO_LOCALE } from './config';

// en renders as en-GB: day-first dates and no Oxford comma, matching the app's
// existing English text.
const locale = (lng: string) => (lng === 'en' || lng === PSEUDO_LOCALE ? 'en-GB' : lng);
// Under the test pseudo-locale formatted output is wrapped like catalog text, so
// findUntranslated doesn't report it.
const mark = (s: string, lng: string) => (lng === PSEUDO_LOCALE ? `⟦${s}⟧` : s);

const DATE_STYLES: Record<'short' | 'medium' | 'long', Intl.DateTimeFormatOptions> = {
  short: { dateStyle: 'short' },
  medium: { dateStyle: 'medium' },
  long: { dateStyle: 'long' },
};

/** A `yyyy-mm-dd` string is a local calendar date (not UTC midnight). */
function toDate(value: Date | string): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = ymd ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3]) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A date in the active language. Unparseable input is returned unchanged. */
export function formatDate(
  value: Date | string,
  style: 'short' | 'medium' | 'long' = 'medium',
  lng = i18n.language,
): string {
  const d = toDate(value);
  return d ? mark(new Intl.DateTimeFormat(locale(lng), DATE_STYLES[style]).format(d), lng) : String(value);
}

/** A short date with time in the active language. Unparseable input is returned unchanged. */
export function formatDateTime(value: Date | string, lng = i18n.language): string {
  const d = toDate(value);
  if (!d) return String(value);
  return mark(new Intl.DateTimeFormat(locale(lng), { dateStyle: 'short', timeStyle: 'short' }).format(d), lng);
}

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions, lng = i18n.language): string {
  return mark(new Intl.NumberFormat(locale(lng), opts).format(n), lng);
}

/** "a, b and c" in the active language. */
export function formatList(items: string[], lng = i18n.language): string {
  return mark(new Intl.ListFormat(locale(lng), { style: 'long', type: 'conjunction' }).format(items), lng);
}
