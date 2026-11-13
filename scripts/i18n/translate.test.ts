// @vitest-environment node
import { mkdtempSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalogs, loadMeta, hashEnglish, writeCatalogs, writeCatalogFile, writeMeta } from './catalog';
import type { Catalogs, Meta } from './catalog';
import { checkCatalogs } from './check';
import { readFileSync, writeFileSync, utimesSync } from 'node:fs';
import { runRehash, runTranslate } from './translate';
import type { Translator } from './work';
import { parseReply } from './claudeTranslator';

const LNGS = ['fr', 'de', 'it', 'es'];
let dir: string;

// Test seeding helper: unlike writeCatalogs it also writes English.
function writeAll(d: string, c: Catalogs) {
  for (const [lng, nss] of Object.entries(c)) for (const [ns, flat] of Object.entries(nss)) writeCatalogFile(d, lng, ns, flat);
}

function seed(opts: { frA?: boolean } = {}) {
  const en = { common: { a: 'Hello {{pet}}', b: 'Bye' } };
  const c: Catalogs = { en };
  const m: Meta = {};
  for (const l of LNGS) {
    c[l] = { common: { a: `A {{pet}}`, b: 'B' } };
    m[l] = {
      'common:a': { hash: hashEnglish(en.common.a), status: 'machine' },
      'common:b': { hash: hashEnglish(en.common.b), status: 'machine' },
    };
  }
  if (opts.frA === false) {
    delete c.fr.common.a;
    delete m.fr['common:a'];
  }
  writeAll(dir, c);
  writeMeta(dir, m);
}

// Only fr:a is ever translated in most tests; keep other languages clean.
const echo: Translator = async (_l, items) =>
  Object.fromEntries(items.map((i) => [i.key, i.english.replace('Hello', 'Bonjour')]));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'i18n-'));
  mkdirSync(dir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('no work means no API call and no writes', async () => {
  seed();
  const before = statSync(join(dir, 'fr', 'common.json')).mtimeMs;
  const spy = vi.fn(echo);
  const r = await runTranslate(dir, spy);
  expect(spy).not.toHaveBeenCalled();
  expect(r).toEqual({ translated: 0, removed: 0, failed: [] });
  expect(statSync(join(dir, 'fr', 'common.json')).mtimeMs).toBe(before);
});

test('translates missing and stale keys only', async () => {
  seed();
  const m = loadMeta(dir);
  m.fr['common:b'].hash = 'old';
  writeMeta(dir, m);
  const c = loadCatalogs(dir);
  delete c.de.common.a;
  writeAll(dir, c);
  // rewriting drops nothing else; de.a now missing
  const spy = vi.fn(echo);
  await runTranslate(dir, spy);
  const calls = spy.mock.calls.map(([l, items]) => [l, items.map((i) => i.key)]);
  expect(calls).toContainEqual(['fr', ['common:b']]);
  expect(calls).toContainEqual(['de', ['common:a']]);
  expect(calls).toHaveLength(2);
  expect(spy.mock.calls.find(([l]) => l === 'fr')![1][0].previous).toBe('B');
});

test('rejects translation with mismatched placeholders', async () => {
  seed({ frA: false });
  const fake: Translator = async (_l, items) => Object.fromEntries(items.map((i) => [i.key, 'Bonjour {{animal}}']));
  const r = await runTranslate(dir, fake);
  expect(r.failed).toEqual(['fr common:a']);
  expect(loadCatalogs(dir).fr.common.a).toBeUndefined();
});

test('retries once and accepts a corrected answer', async () => {
  seed({ frA: false });
  let n = 0;
  const fake: Translator = async (_l, items) => {
    n++;
    return Object.fromEntries(items.map((i) => [i.key, n === 1 ? 'Bonjour {{animal}}' : 'Bonjour {{pet}}']));
  };
  const r = await runTranslate(dir, fake);
  expect(n).toBe(2);
  expect(r).toEqual({ translated: 1, removed: 0, failed: [] });
  expect(loadCatalogs(dir).fr.common.a).toBe('Bonjour {{pet}}');
});

test('removes extra keys', async () => {
  seed();
  const c = loadCatalogs(dir);
  c.fr.common.gone = 'x';
  writeAll(dir, c);
  const m = loadMeta(dir);
  m.fr['common:gone'] = { hash: 'h', status: 'machine' };
  writeMeta(dir, m);
  const r = await runTranslate(dir, echo);
  expect(r.removed).toBe(1);
  expect(loadCatalogs(dir).fr.common.gone).toBeUndefined();
  expect(loadMeta(dir).fr['common:gone']).toBeUndefined();
});

test('after a run the checker is clean', async () => {
  seed({ frA: false });
  await runTranslate(dir, echo);
  expect(checkCatalogs(loadCatalogs(dir), loadMeta(dir))).toEqual([]);
});

test('batches of at most 40', async () => {
  const en: Record<string, string> = {};
  for (let i = 0; i < 85; i++) en[`k${i}`] = `Text ${i}`;
  const c: Catalogs = { en: { common: en } };
  for (const l of LNGS) c[l] = { common: {} };
  writeAll(dir, c);
  const sizes: number[] = [];
  const fake: Translator = async (l, items) => {
    if (l === 'fr') sizes.push(items.length);
    return Object.fromEntries(items.map((i) => [i.key, `T ${i.english}`]));
  };
  const r = await runTranslate(dir, fake);
  expect(sizes).toEqual([40, 40, 5]);
  expect(r.failed).toEqual([]);
});

test('--rehash stamps hashes without translating', () => {
  seed();
  writeMeta(dir, {});
  expect(runRehash(dir).refused).toEqual([]);
  expect(checkCatalogs(loadCatalogs(dir), loadMeta(dir))).toEqual([]);
});

test('--rehash refuses placeholder mismatches', () => {
  seed();
  const c = loadCatalogs(dir);
  c.fr.common.a = 'Bonjour {{animal}}';
  writeAll(dir, c);
  writeMeta(dir, {});
  expect(runRehash(dir).refused).toEqual(['fr common:a']);
  expect(loadMeta(dir).fr?.['common:a']).toBeUndefined();
});

test('parseReply strips fences and validates shape', () => {
  expect(parseReply('```json\n{"a":"b"}\n```')).toEqual({ a: 'b' });
  expect(parseReply('{"a":1}')).toBeNull();
  expect(parseReply('nope')).toBeNull();
  expect(parseReply('["a"]')).toBeNull();
});

test('runTranslate fills fr n_many and handles a changed plural base without throwing', async () => {
  const en = { common: { n_one: '{{count}} tooth', n_other: '{{count}} teeth' } };
  const c: Catalogs = { en };
  const m: Meta = {};
  for (const l of LNGS) {
    c[l] = { common: { n_one: 'un {{count}}', n_other: 'des {{count}}' } };
    m[l] = {
      'common:n_one': { hash: hashEnglish(en.common.n_one), status: 'machine' },
      'common:n_other': { hash: hashEnglish(en.common.n_other), status: 'machine' },
    };
  }
  c.fr.common.n_many = 'de {{count}}';
  m.fr['common:n_many'] = { hash: 'old', status: 'machine' };
  writeAll(dir, c);
  writeMeta(dir, m);
  const seen: Record<string, string> = {};
  const fake: Translator = async (l, items) => {
    for (const i of items) if (l === 'fr') seen[i.key] = i.english;
    return Object.fromEntries(items.map((i) => [i.key, `T ${i.english}`]));
  };
  const r = await runTranslate(dir, fake);
  expect(r.failed).toEqual([]);
  expect(seen['common:n_many']).toBe('{{count}} teeth');
  // it/es need n_many too, filled; de does not get one
  const out = loadCatalogs(dir);
  expect(out.it.common.n_many).toBeDefined();
  expect(out.de.common.n_many).toBeUndefined();
  expect(checkCatalogs(out, loadMeta(dir))).toEqual([]);
});

test('a run that adds one fr key rewrites only that fr file; en and others are untouched', async () => {
  seed({ frA: false });
  const files = ['en', ...LNGS].map((l) => join(dir, l, 'common.json'));
  // Hand-written (unsorted) English, as committed.
  writeFileSync(files[0], '{\n  "b": "Bye",\n  "a": "Hello {{pet}}"\n}\n');
  const past = new Date(Date.now() - 100000);
  for (const f of files) utimesSync(f, past, past);
  const before = files.map((f) => [readFileSync(f, 'utf8'), statSync(f).mtimeMs]);
  await runTranslate(dir, echo);
  const after = files.map((f) => [readFileSync(f, 'utf8'), statSync(f).mtimeMs]);
  expect(after[0]).toEqual(before[0]);
  for (const i of [2, 3, 4]) expect(after[i]).toEqual(before[i]);
  expect(after[1][0]).not.toBe(before[1][0]);
  expect(JSON.parse(after[1][0] as string).a).toBe('Bonjour {{pet}}');
});

test('writeCatalogs never writes en and skips unchanged files', () => {
  seed();
  const en = join(dir, 'en', 'common.json');
  writeFileSync(en, '{"a":"changed"}');
  const c = loadCatalogs(dir);
  c.en.common.a = 'other';
  writeCatalogs(dir, c);
  expect(readFileSync(en, 'utf8')).toBe('{"a":"changed"}');
});

test('flatten then nest round-trips nested content', () => {
  writeFileSync(join(dir, 'x.json'), '');
  mkdirSync(join(dir, 'fr'), { recursive: true });
  const nested = { actions: { save: 'Save', cancel: 'Cancel' }, title: 'T', n_one: '1', n_other: 'many' };
  writeFileSync(join(dir, 'fr', 'common.json'), JSON.stringify(nested));
  const c = loadCatalogs(dir);
  rmSync(join(dir, 'fr', 'common.json'));
  writeCatalogFile(dir, 'fr', 'common', c.fr.common);
  expect(JSON.parse(readFileSync(join(dir, 'fr', 'common.json'), 'utf8'))).toEqual(nested);
});

test('--rehash reports names that match nothing', () => {
  seed();
  writeMeta(dir, {});
  expect(runRehash(dir, ['fr:common:a', 'fr:common:typo']).unmatched).toEqual(['fr:common:typo']);
});

test('--check summary exposes todo and remove counts', async () => {
  const { checkSummary } = await import('./translate');
  seed({ frA: false });
  const c = loadCatalogs(dir);
  c.de.common.gone = 'x';
  writeAll(dir, c);
  expect(checkSummary(dir)).toBe('todo=1 remove=1');
});
