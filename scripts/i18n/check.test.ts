// @vitest-environment node
import { hashEnglish } from './catalog';
import type { Catalogs, Meta } from './catalog';
import { checkCatalogs } from './check';

const en = { common: { a: 'Hello {{pet}}' } };
const fresh = { hash: hashEnglish('Hello {{pet}}'), status: 'machine' as const };

function metaFor(c: Catalogs): Meta {
  const meta: Meta = {};
  for (const [lng, nss] of Object.entries(c)) {
    if (lng === 'en') continue;
    meta[lng] = {};
    for (const [ns, tr] of Object.entries(nss)) {
      for (const key of Object.keys(tr)) {
        const enKey = key in c.en[ns] ? key : key.replace(/_[a-z]+$/, '_other');
        meta[lng][`${ns}:${key}`] = { hash: hashEnglish(c.en[ns][enKey]), status: 'machine' };
      }
    }
  }
  return meta;
}

test('clean catalogs have no problems', () => {
  const c = { en, fr: { common: { a: 'Bonjour {{pet}}' } } };
  expect(checkCatalogs(c, { fr: { 'common:a': fresh } })).toEqual(
    // other app languages are absent here, so only they are missing
    ['de', 'it', 'es'].map((lng) => ({ lng, key: 'common:a', kind: 'missing' })),
  );
});
test('flags missing translation', () => {
  expect(checkCatalogs({ en, fr: { common: {} } }, {})).toContainEqual({ lng: 'fr', key: 'common:a', kind: 'missing' });
});
test('flags stale translation when English changes', () => {
  const c = { en: { common: { a: 'Hi {{pet}}' } }, fr: { common: { a: 'Bonjour {{pet}}' } } };
  expect(checkCatalogs(c, { fr: { 'common:a': fresh } })).toContainEqual({ lng: 'fr', key: 'common:a', kind: 'stale' });
});
test('flags placeholder mismatch and empty', () => {
  const c = { en, fr: { common: { a: 'Bonjour {{animal}}' } }, de: { common: { a: ' ' } } };
  const p = checkCatalogs(c, { fr: { 'common:a': fresh }, de: { 'common:a': fresh } });
  expect(p).toContainEqual({ lng: 'fr', key: 'common:a', kind: 'placeholders' });
  expect(p).toContainEqual({ lng: 'de', key: 'common:a', kind: 'empty' });
});
test('reports keys missing from English as extra', () => {
  const c = { en, fr: { common: { a: 'Bonjour {{pet}}', gone: 'x' } } };
  expect(checkCatalogs(c, { fr: { 'common:a': fresh } })).toContainEqual({ lng: 'fr', key: 'common:gone', kind: 'extra' });
});
test('extra plural forms of an English key are allowed', () => {
  const c = {
    en: { common: { n_one: '{{count}} tooth', n_other: '{{count}} teeth' } },
    fr: { common: { n_one: '{{count}} dent', n_many: '{{count}} dents', n_other: '{{count}} dents' } },
  };
  expect(checkCatalogs(c, metaFor(c)).filter((p) => p.kind === 'extra')).toEqual([]);
});
test('pt is required for report only', () => {
  const c = { en: { report: { a: 'Hi' } } };
  expect(checkCatalogs(c, {}).filter((p) => p.lng === 'pt')).toEqual([{ lng: 'pt', key: 'report:a', kind: 'missing' }]);
  expect(checkCatalogs({ en: { common: { a: 'Hi' } } }, {}).some((p) => p.lng === 'pt')).toBe(false);
});

test('required plural forms the language needs are reported missing (fr many), de needs none', () => {
  const enP = { common: { n_one: '{{c}} tooth', n_other: '{{c}} teeth' } };
  const c: Catalogs = { en: enP };
  for (const l of ['fr', 'de', 'it', 'es']) c[l] = { common: { n_one: 'a {{c}}', n_other: 'b {{c}}' } };
  const problems = checkCatalogs(c, metaFor(c));
  expect(problems.filter((p) => p.lng === 'de')).toEqual([]);
  expect(problems.filter((p) => p.lng === 'fr')).toEqual([{ lng: 'fr', key: 'common:n_many', kind: 'missing' }]);
  expect(problems).toHaveLength(3);
});
