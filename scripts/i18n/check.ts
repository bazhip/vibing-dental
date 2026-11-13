import { hashEnglish, languagesFor, loadCatalogs, loadMeta, englishKeyFor, placeholders } from './catalog';
import type { Catalogs, Meta } from './catalog';

export type Problem = {
  lng: string;
  key: string; // "ns:key"
  kind: 'missing' | 'stale' | 'extra' | 'empty' | 'placeholders';
};

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

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
  // Translations for namespaces English does not have are extra.
  for (const [lng, nss] of Object.entries(c)) {
    if (lng === 'en') continue;
    for (const [ns, tr] of Object.entries(nss)) {
      if (ns in enNs) continue;
      for (const key of Object.keys(tr)) problems.push({ lng, key: `${ns}:${key}`, kind: 'extra' });
    }
  }
  return problems;
}

function main() {
  const problems = checkCatalogs(loadCatalogs(), loadMeta('src/locales'));
  const kinds: Problem['kind'][] = ['missing', 'stale', 'extra', 'empty', 'placeholders'];
  for (const kind of kinds) {
    for (const p of problems.filter((x) => x.kind === kind)) console.error(`${p.lng} ${p.key} ${kind}`);
  }
  console.log(`i18n:check ${problems.length} problems`);
  if (problems.length) {
    console.error('run `npm run i18n:translate`');
    process.exit(1);
  }
}

// Run only as a CLI, not when imported by tests.
if (process.argv[1]?.endsWith('check.ts')) main();
