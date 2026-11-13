import { hashEnglish, languagesFor, loadCatalogs, loadMeta, englishKeyFor, placeholders } from './catalog';
import type { Catalogs, Meta } from './catalog';
import { emailStringsProblem } from './gen-email-strings';

export type Problem = {
  lng: string;
  key: string; // "ns:key"
  kind: 'missing' | 'stale' | 'extra' | 'empty' | 'placeholders';
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Plural forms `lng` needs beyond English's, for every English base key with _one and _other. */
function requiredPluralForms(lng: string, en: Record<string, string>): string[] {
  const cats = new Intl.PluralRules(lng).resolvedOptions().pluralCategories.filter((c) => c !== 'zero');
  const out: string[] = [];
  for (const key of Object.keys(en)) {
    if (!key.endsWith('_other')) continue;
    const base = key.slice(0, -'_other'.length);
    if (!(`${base}_one` in en)) continue;
    for (const cat of cats) out.push(`${base}_${cat}`);
  }
  return out;
}

export function checkCatalogs(c: Catalogs, m: Meta): Problem[] {
  const problems: Problem[] = [];
  const enNs = c.en ?? {};
  for (const [ns, en] of Object.entries(enNs)) {
    for (const lng of languagesFor(ns)) {
      if (lng === 'en') continue;
      const tr = c[lng]?.[ns] ?? {};
      for (const key of Object.keys(en)) {
        if (!(key in tr)) problems.push({ lng, key: `${ns}:${key}`, kind: 'missing' });
      }
      for (const key of requiredPluralForms(lng, en)) {
        if (!(key in tr) && !(key in en)) problems.push({ lng, key: `${ns}:${key}`, kind: 'missing' });
      }
      for (const [key, text] of Object.entries(tr)) {
        const id = `${ns}:${key}`;
        const enKey = englishKeyFor(key, en);
        if (!enKey) {
          problems.push({ lng, key: id, kind: 'extra' });
          continue;
        }
        if (text.trim() === '') {
          problems.push({ lng, key: id, kind: 'empty' });
          continue;
        }
        if (m[lng]?.[id]?.hash !== hashEnglish(en[enKey])) problems.push({ lng, key: id, kind: 'stale' });
        if (!same(placeholders(text), placeholders(en[enKey]))) problems.push({ lng, key: id, kind: 'placeholders' });
      }
    }
  }
  // Stray files are extra: a namespace English does not have, a language the
  // namespace is not translated into (pt/common.json), or an unknown language (ja/).
  for (const [lng, nss] of Object.entries(c)) {
    if (lng === 'en') continue;
    if (Object.keys(nss).length === 0) problems.push({ lng, key: '*', kind: 'extra' });
    for (const [ns, tr] of Object.entries(nss)) {
      if (ns in enNs && languagesFor(ns).includes(lng)) continue;
      for (const key of Object.keys(tr)) problems.push({ lng, key: `${ns}:${key}`, kind: 'extra' });
    }
  }
  return problems;
}

function main() {
  const catalogs = loadCatalogs();
  const problems = checkCatalogs(catalogs, loadMeta('src/locales'));
  const kinds: Problem['kind'][] = ['missing', 'stale', 'extra', 'empty', 'placeholders'];
  for (const kind of kinds) {
    for (const p of problems.filter((x) => x.kind === kind)) console.error(`${p.lng} ${p.key} ${kind}`);
  }
  // Edge-function email text is generated from the email namespace.
  const emails = emailStringsProblem(catalogs);
  if (emails) console.error(emails);
  console.log(`i18n:check ${problems.length + (emails ? 1 : 0)} problems`);
  if (problems.length) console.error('run `npm run i18n:translate`');
  if (problems.length || emails) process.exit(1);
}

// Run only as a CLI, not when imported by tests.
if (process.argv[1]?.endsWith('check.ts')) main();
