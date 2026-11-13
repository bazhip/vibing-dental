import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_LANGUAGES } from '../../src/i18n/config';

export type Catalogs = Record<string, Record<string, Record<string, string>>>;
export type MetaEntry = { hash: string; status: 'machine' | 'reviewed' };
export type Meta = Record<string, Record<string, MetaEntry>>;

const META_FILE = '.meta.json';

type Nested = { [k: string]: string | Nested };

function flatten(obj: Nested, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

function nest(flat: Record<string, string>): Nested {
  const root: Nested = {};
  for (const key of Object.keys(flat).sort()) {
    const parts = key.split('.');
    let node = root;
    for (const p of parts.slice(0, -1)) {
      const next = node[p];
      if (typeof next === 'string') throw new Error(`Key conflict at ${key}`);
      node = (node[p] ??= {}) as Nested;
    }
    node[parts[parts.length - 1]] = flat[key];
  }
  return root;
}

function sortDeep(n: Nested): Nested {
  return Object.fromEntries(
    Object.keys(n)
      .sort()
      .map((k) => [k, typeof n[k] === 'string' ? n[k] : sortDeep(n[k] as Nested)]),
  );
}

export function loadCatalogs(dir = 'src/locales'): Catalogs {
  const out: Catalogs = {};
  for (const lng of readdirSync(dir, { withFileTypes: true })) {
    if (!lng.isDirectory()) continue;
    out[lng.name] = {};
    for (const file of readdirSync(join(dir, lng.name))) {
      if (!file.endsWith('.json')) continue;
      const ns = file.slice(0, -'.json'.length);
      out[lng.name][ns] = flatten(JSON.parse(readFileSync(join(dir, lng.name, file), 'utf8')));
    }
  }
  return out;
}

/** The canonical on-disk form of a catalog file: nested, keys sorted, trailing newline. */
export function serializeCatalog(flat: Record<string, string>): string {
  return JSON.stringify(sortDeep(nest(flat)), null, 2) + '\n';
}

/** Writes one catalog file, but only if its content would change. */
export function writeCatalogFile(dir: string, lng: string, ns: string, flat: Record<string, string>): void {
  const file = join(dir, lng, `${ns}.json`);
  const text = serializeCatalog(flat);
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return;
  mkdirSync(join(dir, lng), { recursive: true });
  writeFileSync(file, text);
}

/** English is the hand-edited source of truth and is never written; unchanged files are skipped. */
export function writeCatalogs(dir: string, catalogs: Catalogs): void {
  for (const [lng, nss] of Object.entries(catalogs)) {
    if (lng === 'en') continue;
    for (const [ns, flat] of Object.entries(nss)) writeCatalogFile(dir, lng, ns, flat);
  }
}

export function loadMeta(dir = 'src/locales'): Meta {
  const file = join(dir, META_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Meta) : {};
}

export function writeMeta(dir: string, meta: Meta): void {
  const sorted: Meta = {};
  for (const lng of Object.keys(meta).sort()) {
    sorted[lng] = {};
    for (const k of Object.keys(meta[lng]).sort()) sorted[lng][k] = meta[lng][k];
  }
  writeFileSync(join(dir, META_FILE), JSON.stringify(sorted, null, 2) + '\n');
}

export function hashEnglish(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

/** Sorted unique `{{name}}` names. */
export function placeholders(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([^}\s,]+)[^}]*\}\}/g)) names.add(m[1]);
  return [...names].sort();
}

/** Report is also translated to Portuguese; everything else is app languages only. */
export function languagesFor(ns: string): string[] {
  return ns === 'report' ? [...APP_LANGUAGES, 'pt'] : [...APP_LANGUAGES];
}

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/**
 * The English key a translated key is measured against. Exact match wins; otherwise a
 * plural form English lacks (e.g. fr `_many`) maps to its `_other` base.
 */
export function englishKeyFor(key: string, en: Record<string, string>): string | undefined {
  if (key in en) return key;
  const m = PLURAL_SUFFIX.exec(key);
  if (!m) return undefined;
  const other = key.slice(0, m.index) + '_other';
  return other in en ? other : undefined;
}
