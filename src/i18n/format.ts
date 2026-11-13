import i18n from './index';

// en renders as en-GB: day-first dates and no Oxford comma, matching the app's
// existing English text.
const locale = (lng: string) => (lng === 'en' ? 'en-GB' : lng);

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
  return d ? new Intl.DateTimeFormat(locale(lng), DATE_STYLES[style]).format(d) : String(value);
}

/** A short date with time in the active language. Unparseable input is returned unchanged. */
export function formatDateTime(value: Date | string, lng = i18n.language): string {
  const d = toDate(value);
  return d ? new Intl.DateTimeFormat(locale(lng), { dateStyle: 'short', timeStyle: 'short' }).format(d) : String(value);
}

export function formatNumber(n: number, opts?: Intl.NumberFormatOptions, lng = i18n.language): string {
  return new Intl.NumberFormat(locale(lng), opts).format(n);
}

/** "a, b and c" in the active language. */
export function formatList(items: string[], lng = i18n.language): string {
  return new Intl.ListFormat(locale(lng), { style: 'long', type: 'conjunction' }).format(items);
}
