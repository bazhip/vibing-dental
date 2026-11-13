// @vitest-environment node
import { mkdtempSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCatalogs, loadMeta, hashEnglish, writeCatalogs, writeMeta } from './catalog';
import type { Catalogs, Meta } from './catalog';
import { checkCatalogs } from './check';
import { runRehash, runTranslate } from './translate';
import type { Translator } from './work';
import { parseReply } from './claudeTranslator';

const LNGS = ['fr', 'de', 'it', 'es'];
let dir: string;

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
  writeCatalogs(dir, c);
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
  writeCatalogs(dir, c);
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
  writeCatalogs(dir, c);
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
  writeCatalogs(dir, c);
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
  writeCatalogs(dir, c);
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
