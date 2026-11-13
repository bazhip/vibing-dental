// Writes supabase/functions/_shared/emailStrings.ts from src/locales/<lng>/email.json.
// Edge functions are deployed from supabase/functions alone and can't import
// src/, so their email text is copied there as a plain TS module (no imports:
// Deno and vitest both load it). `npm run i18n:check` fails when it is stale.
//   npm run i18n:emails
import { readFileSync, writeFileSync } from 'node:fs';
import { APP_LANGUAGES } from '../../src/i18n/config';
import { loadCatalogs } from './catalog';
import type { Catalogs } from './catalog';

export const EMAIL_STRINGS_FILE = 'supabase/functions/_shared/emailStrings.ts';
const NS = 'email';

export function generateEmailStrings(catalogs: Catalogs): string {
  const en = catalogs.en?.[NS] ?? {};
  const keys = Object.keys(en).sort();
  const table = (lng: string) => {
    const tr = catalogs[lng]?.[NS] ?? {};
    // A missing translation falls back to English (i18n:check reports it anyway).
    return keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(tr[k] ?? en[k])},`).join('\n');
  };
  return `// Generated — run npm run i18n:emails. Do not edit by hand.
// Source: src/locales/<lng>/email.json (edge functions can't import src/).

export const EMAIL_LANGUAGES = [${APP_LANGUAGES.map((l) => `'${l}'`).join(', ')}] as const;
export type EmailLanguage = (typeof EMAIL_LANGUAGES)[number];

export type EmailKey =
${keys.map((k) => `  | ${JSON.stringify(k)}`).join('\n')};

export const EMAIL_STRINGS: Record<EmailLanguage, Record<EmailKey, string>> = {
${APP_LANGUAGES.map((lng) => `  ${lng}: {\n${table(lng)}\n  },`).join('\n')}
};

/** An app language for \`v\` ('fr-CA' → 'fr'); anything else → 'en'. */
export function emailLanguage(v: unknown): EmailLanguage {
  if (typeof v !== 'string') return 'en';
  const base = v.toLowerCase().split('-')[0];
  return (EMAIL_LANGUAGES as readonly string[]).includes(base) ? (base as EmailLanguage) : 'en';
}

/** True only for a supported language (base tag), so callers can try the next source. */
export function isEmailLanguage(v: unknown): boolean {
  return typeof v === 'string' && (EMAIL_LANGUAGES as readonly string[]).includes(v.toLowerCase().split('-')[0]);
}

/** The \`key\` string in \`lng\` with {{var}} placeholders filled. */
export function emailT(lng: string, key: EmailKey, vars: Record<string, string> = {}): string {
  return EMAIL_STRINGS[emailLanguage(lng)][key].replace(/\\{\\{\\s*(\\w+)\\s*\\}\\}/g, (m, name: string) =>
    name in vars ? vars[name] : m,
  );
}
`;
}

/** null when the committed file is current, else a message for i18n:check. */
export function emailStringsProblem(catalogs: Catalogs, file = EMAIL_STRINGS_FILE): string | null {
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch {
    /* missing → stale */
  }
  return current === generateEmailStrings(catalogs)
    ? null
    : `${file} is out of date with src/locales/*/email.json — run \`npm run i18n:emails\``;
}

// Run only as a CLI, not when imported by tests.
if (process.argv[1]?.endsWith('gen-email-strings.ts')) {
  writeFileSync(EMAIL_STRINGS_FILE, generateEmailStrings(loadCatalogs()));
  console.log(`wrote ${EMAIL_STRINGS_FILE}`);
}
