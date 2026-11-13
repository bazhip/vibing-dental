import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadCatalogs, loadMeta, writeCatalogs, writeMeta } from './catalog';
import { applyTranslations, findWork, rehashMeta } from './work';
import type { GlossaryTerm, Translator, WorkItem } from './work';

const BATCH = 40;

function loadGlossary(dir: string): GlossaryTerm[] {
  const file = join(dir, 'glossary.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { terms: GlossaryTerm[] }).terms : [];
}

const chunks = <T,>(xs: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += BATCH) out.push(xs.slice(i, i + BATCH));
  return out;
};

export async function runTranslate(
  dir: string,
  translator: Translator,
): Promise<{ translated: number; removed: number; failed: string[] }> {
  let c = loadCatalogs(dir);
  let m = loadMeta(dir);
  const { todo, remove } = findWork(c, m);
  if (!todo.length && !remove.length) return { translated: 0, removed: 0, failed: [] };

  for (const { lng, key } of remove) {
    const i = key.indexOf(':');
    delete c[lng]?.[key.slice(0, i)]?.[key.slice(i + 1)];
    delete m[lng]?.[key];
  }

  const glossary = loadGlossary(dir);
  const failed: string[] = [];
  let translated = 0;
  const byLng = new Map<string, WorkItem[]>();
  for (const item of todo) byLng.set(item.lng, [...(byLng.get(item.lng) ?? []), item]);

  try {
    for (const [lng, items] of byLng) {
      let pending = items;
      for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
        const rejected: WorkItem[] = [];
        for (const batch of chunks(pending)) {
          const results = await translator(lng, batch, glossary);
          const r = applyTranslations(c, m, lng, results, batch);
          c = r.c;
          m = r.m;
          translated += batch.length - r.rejected.length;
          rejected.push(...batch.filter((b) => r.rejected.includes(b.key)));
        }
        pending = rejected;
      }
      failed.push(...pending.map((p) => `${lng} ${p.key}`));
    }
  } finally {
    writeCatalogs(dir, c);
    writeMeta(dir, m);
  }
  return { translated, removed: remove.length, failed };
}

/** `todo=<n> remove=<m>`: keys needing translation vs orphans to delete (CI gates the API key on todo>0). */
export function checkSummary(dir: string): string {
  const { todo, remove } = findWork(loadCatalogs(dir), loadMeta(dir));
  return `todo=${todo.length} remove=${remove.length}`;
}

export function runRehash(dir: string, named: string[] = []) {
  const c = loadCatalogs(dir);
  const r = rehashMeta(c, loadMeta(dir), named);
  writeMeta(dir, r.m);
  return r;
}

const USAGE = `Usage: i18n:translate [--check | --rehash [lng:ns:key ...]]
  (none)    translate missing/stale/empty keys with Claude (needs ANTHROPIC_API_KEY)
  --check   print todo=<n> remove=<m>, exit 1 if there is any work; no API call
  --rehash  stamp hashes on translations with no meta entry, plus the keys named as lng:ns:key,
            e.g. npm run i18n:translate -- --rehash fr:common:actions.save de:common:actions.save`;

async function main() {
  const dir = 'src/locales';
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(USAGE);
    return;
  }
  if (args.includes('--rehash')) {
    const named = args.slice(args.indexOf('--rehash') + 1).filter((a) => !a.startsWith('--'));
    const { stamped, refused, stale, unmatched } = runRehash(dir, named);
    for (const k of stamped) console.log(`stamped ${k}`);
    for (const k of refused) console.error(`${k} placeholder mismatch (not rehashed)`);
    if (stale.length) {
      for (const k of stale) console.error(`${k} stale (not rehashed)`);
      console.error('to bless a stale key, name it: npm run i18n:translate -- --rehash <lng>:<ns>:<key>');
    }
    for (const k of unmatched) console.error(`warning: ${k} matches no translation (typo?)`);
    process.exit(refused.length || stale.length || unmatched.length ? 1 : 0);
  }
  if (args.includes('--check')) {
    const summary = checkSummary(dir);
    console.log(summary);
    process.exit(summary === 'todo=0 remove=0' ? 0 : 1);
  }
  const w = findWork(loadCatalogs(dir), loadMeta(dir));
  if (!w.todo.length && !w.remove.length) {
    console.log('i18n:translate nothing to do');
    return;
  }
  const { claudeTranslator } = await import('./claudeTranslator');
  const r = await runTranslate(dir, claudeTranslator);
  console.log(`i18n:translate ${r.translated} translated, ${r.removed} removed, ${r.failed.length} failed`);
  for (const f of r.failed) console.error(`${f} failed`);
  if (r.failed.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
