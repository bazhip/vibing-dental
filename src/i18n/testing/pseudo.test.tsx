import { render } from '@testing-library/react';
import { Trans, useTranslation } from 'react-i18next';
import { findUntranslated, installPseudoLocale, restoreLocale } from './pseudo';
import i18n from '../index';
import { formatDate, formatDateTime, formatList, formatNumber } from '../format';

function Sample({ name }: { name: string }) {
  const { t } = useTranslation('common');
  return (
    <div>
      <button title={t('actions.cancel')}>{t('actions.save')}</button>
      <span>Oops</span>
      <p>{name}</p>
      <input placeholder="Search" aria-label={t('actions.save')} />
      <span>12 / 3</span>
    </div>
  );
}

beforeEach(installPseudoLocale);
afterEach(restoreLocale);

test('pseudo-locale wraps catalog strings and keeps placeholders', () => {
  expect(i18n.language).toBe('xx');
  expect(i18n.t('common:actions.save')).toBe('⟦Save⟧');
});

test('reports literal text and attributes, ignores translated and allowed text', () => {
  const { container } = render(<Sample name="Biscuit" />);
  expect(findUntranslated(container, ['Biscuit'])).toEqual(['Oops', 'Search']);
});

test('allow accepts regular expressions', () => {
  const { container } = render(<Sample name="Biscuit" />);
  expect(findUntranslated(container, [/^Bis/, 'Oops', 'Search'])).toEqual([]);
});

test('restoreLocale switches back to English', async () => {
  await restoreLocale();
  expect(i18n.language).toBe('en');
});

test('nested and adjacent wrapped segments are not reported; a miss beside one is', () => {
  const div = document.createElement('div');
  div.innerHTML = '<p>⟦Hello ⟦B⟧⟧</p><p>⟦a⟧⟦b⟧</p><p>⟦a⟧ Oops</p>';
  expect(findUntranslated(div)).toEqual(['⟦a⟧ Oops']);
});

test('formatted dates, numbers and lists are wrapped under the pseudo-locale', () => {
  const { container } = render(
    <p>
      <span>{formatDate('2026-07-19', 'long')}</span>
      <span>{formatDateTime(new Date(2026, 6, 19, 14, 5))}</span>
      <span>{formatList(['⟦a⟧', '⟦b⟧', '⟦c⟧'])}</span>
      <span>{formatNumber(1234.5, { style: 'currency', currency: 'EUR' })}</span>
    </p>,
  );
  expect(findUntranslated(container)).toEqual([]);
  expect(formatDate('2026-07-19', 'long')).toBe(`⟦${new Date(2026, 6, 19).toLocaleDateString(undefined, { dateStyle: 'long' })}⟧`);
});

test('arrays in catalogs stay arrays (returnObjects)', async () => {
  i18n.addResourceBundle('en', 'common', { test: { list: ['One', 'Two'] } }, true, true);
  await installPseudoLocale();
  const t = i18n.t as unknown as (key: string, opts: object) => unknown;
  expect(t('common:test.list', { returnObjects: true })).toEqual(['⟦One⟧', '⟦Two⟧']);
});

describe('<Trans> markup', () => {
  // Test-only keys are not in the typed catalog.
  const tr = (key: string, opts?: object) => (i18n.t as unknown as (k: string, o?: object) => string)(key, opts);
  const add = async (messages: Record<string, string>) => {
    i18n.addResourceBundle('en', 'common', { transTest: messages }, true, true);
    await installPseudoLocale();
  };
  afterEach(() => {
    // Drop only the test messages (and their pseudo copies); beforeEach re-installs the rest.
    for (const lng of ['en', 'xx']) {
      const { transTest: _drop, ...rest } = i18n.getResourceBundle(lng, 'common') as Record<string, unknown>;
      i18n.removeResourceBundle(lng, 'common');
      i18n.addResourceBundle(lng, 'common', rest);
    }
  });

  test('each text run is wrapped separately, tags and placeholders stay intact', async () => {
    await add({
      numbered: 'Click <1>here</1> to go',
      named: 'Sent to <strong>{{email}}</strong>.',
      selfClosing: 'Line one<br/>Line two',
      nested: 'A <1>b <2>c</2></1>',
    });
    expect(tr('common:transTest.numbered')).toBe('⟦Click ⟧<1>⟦here⟧</1>⟦ to go⟧');
    expect(tr('common:transTest.named', { email: 'a@b.c' })).toBe('⟦Sent to ⟧<strong>⟦a@b.c⟧</strong>⟦.⟧');
    expect(tr('common:transTest.selfClosing')).toBe('⟦Line one⟧<br/>⟦Line two⟧');
    expect(tr('common:transTest.nested')).toBe('⟦A ⟧<1>⟦b ⟧<2>⟦c⟧</2></1>');
  });

  test('a rendered <Trans> has no unwrapped text, even inside its elements', async () => {
    await add({ link: 'Read the <a>terms</a> and <strong>agree</strong>.' });
    const { container } = render(
      <Trans ns="common" i18nKey={'transTest.link' as never} components={{ a: <a href="/terms" />, strong: <strong /> }} />,
    );
    expect(container.textContent).toBe('⟦Read the ⟧⟦terms⟧⟦ and ⟧⟦agree⟧⟦.⟧');
    expect(findUntranslated(container)).toEqual([]);
  });
});
