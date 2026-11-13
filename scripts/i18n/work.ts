import { englishKeyFor, hashEnglish, placeholders } from './catalog';
import type { Catalogs, Meta } from './catalog';
import { checkCatalogs } from './check';

export type GlossaryTerm = {
  id: string;
  en: string;
  fr: string;
  de: string;
  it: string;
  es: string;
  note?: string;
};

export type WorkItem = {
  lng: string;
  key: string; // "ns:key"
  english: string;
  previous?: string; // old translation, when stale
};

export type Translator = (lng: string, items: WorkItem[], glossary: GlossaryTerm[]) => Promise<Record<string, string>>;

const split = (id: string): [string, string] => {
  const i = id.indexOf(':');
  return [id.slice(0, i), id.slice(i + 1)];
};

/** Missing, stale, empty and placeholder-mismatched keys need translating; extra keys are removed. */
export function findWork(c: Catalogs, m: Meta): { todo: WorkItem[]; remove: { lng: string; key: string }[] } {
  const todo = new Map<string, WorkItem>();
  const remove: { lng: string; key: string }[] = [];
  for (const p of checkCatalogs(c, m)) {
    if (p.kind === 'extra') {
      remove.push({ lng: p.lng, key: p.key });
      continue;
    }
    const id = `${p.lng}|${p.key}`;
    if (todo.has(id)) continue;
    const [ns, key] = split(p.key);
    const english = c.en[ns][key];
    const previous = c[p.lng]?.[ns]?.[key];
    todo.set(id, { lng: p.lng, key: p.key, english, ...(previous ? { previous } : {}) });
  }
  return { todo: [...todo.values()], remove };
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Writes a result only if its placeholders match the English; others are returned as rejected. */
export function applyTranslations(
  c: Catalogs,
  m: Meta,
  lng: string,
  results: Record<string, string>,
  items: WorkItem[],
): { c: Catalogs; m: Meta; rejected: string[] } {
  const nc: Catalogs = structuredClone(c);
  const nm: Meta = structuredClone(m);
  const rejected: string[] = [];
  for (const item of items) {
    const text = results[item.key];
    if (typeof text !== 'string' || text.trim() === '' || !same(placeholders(text), placeholders(item.english))) {
      rejected.push(item.key);
      continue;
    }
    const [ns, key] = split(item.key);
    ((nc[lng] ??= {})[ns] ??= {})[key] = text;
    (nm[lng] ??= {})[item.key] = { hash: hashEnglish(item.english), status: 'machine' };
  }
  return { c: nc, m: nm, rejected };
}

/** Stamp current English hashes on existing translations. Returns keys refused for placeholder mismatch. */
export function rehashMeta(c: Catalogs, m: Meta): { m: Meta; refused: string[] } {
  const nm: Meta = structuredClone(m);
  const refused: string[] = [];
  for (const [lng, nss] of Object.entries(c)) {
    if (lng === 'en') continue;
    for (const [ns, tr] of Object.entries(nss)) {
      const en = c.en?.[ns] ?? {};
      for (const [key, text] of Object.entries(tr)) {
        const enKey = englishKeyFor(key, en);
        if (!enKey || text.trim() === '') continue;
        const id = `${ns}:${key}`;
        if (!same(placeholders(text), placeholders(en[enKey]))) {
          refused.push(`${lng} ${id}`);
          continue;
        }
        (nm[lng] ??= {})[id] = { hash: hashEnglish(en[enKey]), status: nm[lng]?.[id]?.status ?? 'machine' };
      }
    }
  }
  return { m: nm, refused };
}
