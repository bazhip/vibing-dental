// @vitest-environment node
import { hashEnglish } from './catalog';
import type { Catalogs, Meta } from './catalog';
import { applyTranslations, findWork, rehashMeta } from './work';

const LNGS = ['fr', 'de', 'it', 'es'];
const en = { common: { a: 'Hello {{pet}}', b: 'Bye' } };

function full(): { c: Catalogs; m: Meta } {
  const c: Catalogs = { en };
  const m: Meta = {};
  for (const l of LNGS) {
    c[l] = { common: { a: `A {{pet}} ${l}`, b: `B ${l}` } };
    m[l] = {
      'common:a': { hash: hashEnglish(en.common.a), status: 'machine' },
      'common:b': { hash: hashEnglish(en.common.b), status: 'machine' },
    };
  }
  return { c, m };
}

test('clean catalogs have no work', () => {
  const { c, m } = full();
  expect(findWork(c, m)).toEqual({ todo: [], remove: [] });
});

test('stale key carries previous; missing key has none; extra is removed', () => {
  const { c, m } = full();
  m.fr['common:b'].hash = 'old';
  delete c.de.common.a;
  c.it.common.zzz = 'x';
  const w = findWork(c, m);
  expect(w.todo).toContainEqual({ lng: 'fr', key: 'common:b', english: 'Bye', previous: 'B fr' });
  expect(w.todo).toContainEqual({ lng: 'de', key: 'common:a', english: 'Hello {{pet}}' });
  expect(w.remove).toEqual([{ lng: 'it', key: 'common:zzz' }]);
  expect(w.todo).toHaveLength(2);
});

test('mismatched placeholders go back to todo once', () => {
  const { c, m } = full();
  c.es.common.a = 'Hola {{animal}}';
  const w = findWork(c, m);
  expect(w.todo).toEqual([{ lng: 'es', key: 'common:a', english: 'Hello {{pet}}', previous: 'Hola {{animal}}' }]);
});

test('applyTranslations rejects placeholder mismatches and stamps meta', () => {
  const { c, m } = full();
  const items = [
    { lng: 'fr', key: 'common:a', english: 'Hello {{pet}}' },
    { lng: 'fr', key: 'common:b', english: 'Bye' },
  ];
  const r = applyTranslations(c, m, 'fr', { 'common:a': 'Bonjour {{animal}}', 'common:b': 'Salut' }, items);
  expect(r.rejected).toEqual(['common:a']);
  expect(r.c.fr.common.b).toBe('Salut');
  expect(r.c.fr.common.a).toBe('A {{pet}} fr');
  expect(r.m.fr['common:b']).toEqual({ hash: hashEnglish('Bye'), status: 'machine' });
});

test('missing result counts as rejected', () => {
  const { c, m } = full();
  const r = applyTranslations(c, m, 'fr', {}, [{ lng: 'fr', key: 'common:b', english: 'Bye' }]);
  expect(r.rejected).toEqual(['common:b']);
});

test('rehashMeta stamps good keys and refuses placeholder mismatches', () => {
  const { c, m } = full();
  m.fr = {};
  c.de.common.a = 'Hallo {{tier}}';
  const r = rehashMeta(c, m);
  expect(r.refused).toEqual(['de common:a']);
  expect(r.m.fr['common:a'].hash).toBe(hashEnglish(en.common.a));
});

test('rehashMeta stamps only keys without meta, plus explicitly named ones', () => {
  const { c, m } = full();
  delete m.fr['common:a']; // no meta: stamped
  m.de['common:b'].hash = 'old'; // stale, unnamed: left alone
  m.it['common:b'].hash = 'old'; // stale, named: stamped
  const r = rehashMeta(c, m, ['it:common:b']);
  expect(r.stamped.sort()).toEqual(['fr common:a', 'it common:b']);
  expect(r.stale).toEqual(['de common:b']);
  expect(r.m.de['common:b'].hash).toBe('old');
  expect(r.m.it['common:b'].hash).toBe(hashEnglish('Bye'));
  expect(r.m.fr['common:a'].hash).toBe(hashEnglish(en.common.a));
});

test('rehashMeta refuses a named key with placeholder mismatch', () => {
  const { c, m } = full();
  c.de.common.a = 'Hallo {{tier}}';
  const r = rehashMeta(c, m, ['de:common:a']);
  expect(r.refused).toEqual(['de common:a']);
  expect(r.stamped).toEqual([]);
});

const enP = { common: { n_one: '{{count}} tooth', n_other: '{{count}} teeth' } };
function plural(): { c: Catalogs; m: Meta } {
  const c: Catalogs = { en: enP };
  const m: Meta = {};
  for (const l of LNGS) {
    c[l] = { common: { n_one: 'un {{count}}', n_other: 'des {{count}}', ...(l === 'de' ? {} : { n_many: 'de {{count}}' }) } };
    m[l] = {};
    for (const k of Object.keys(c[l].common)) {
      m[l][`common:${k}`] = { hash: hashEnglish(enP.common[k.endsWith('_one') ? 'n_one' : 'n_other']), status: 'machine' };
    }
  }
  return { c, m };
}

test('stale target-only plural form resolves english via _other', () => {
  const { c, m } = plural();
  c.en.common.n_other = '{{count}} teeth!';
  const w = findWork(c, m);
  const many = w.todo.find((t) => t.lng === 'fr' && t.key === 'common:n_many')!;
  expect(many.english).toBe('{{count}} teeth!');
  expect(many.previous).toBe('de {{count}}');
});

test('applyTranslations works for a plural-only key', () => {
  const { c, m } = plural();
  const r = applyTranslations(c, m, 'fr', { 'common:n_many': 'X {{count}}' }, [
    { lng: 'fr', key: 'common:n_many', english: '{{count}} teeth' },
  ]);
  expect(r.rejected).toEqual([]);
});
