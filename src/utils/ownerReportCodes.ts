import { codeDefinition, findCodesInText } from '../constants/dentalCodes';
import { ReportLocale, reportStrings } from './ownerReportI18n';

/** Report languages with an AVDC definitions catalog (locales/<lng>/codes.json). */
const CODE_CATALOG_LOCALES: ReadonlySet<ReportLocale> = new Set(['en', 'fr', 'de', 'it', 'es']);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A vet's note with its AVDC codes put in plain words for the owner:
 * "T/FX/CCF" → "a broken tooth with the nerve exposed". Only the code
 * tokens change; the rest of the note is kept as written. Codes are found
 * with the same rules as the chart (findCodesInText: whole tokens only,
 * one-letter codes only when they are the whole entry). A code with no
 * owner phrase uses its AVDC definition in the report's language when one
 * exists, otherwise it stays as written.
 */
export function ownerFriendlyText(text: string, locale: ReportLocale, species?: string): string {
  const codes = findCodesInText(text, species);
  if (codes.length === 0) return text;
  const t = reportStrings(locale);
  let out = text;
  // Longest first, so T/FX/CCF is replaced before T/FX could be.
  for (const { code } of [...codes].sort((a, b) => b.code.length - a.code.length)) {
    const phrase = t.plainCode(code) ?? (CODE_CATALOG_LOCALES.has(locale) ? codeDefinition(code, locale) : code);
    if (code.length === 1) {
      // One-letter codes (X, B) count only as a whole list item, so only
      // those items change — never the X of "X-ray".
      out = out.split(/([\n,;]+)/).map((part) => (part.trim() === code ? part.replace(code, phrase) : part)).join('');
      continue;
    }
    const re = new RegExp(`(^|[^A-Za-z0-9/*])${escapeRe(code)}(?![A-Za-z0-9/*])`, 'g');
    out = out.replace(re, (_m, before: string) => `${before}${phrase}`);
  }
  return out;
}
