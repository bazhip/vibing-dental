import { render } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
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
  expect(formatDate('2026-07-19', 'long')).toBe('⟦19 July 2026⟧');
});

test('arrays in catalogs stay arrays (returnObjects)', async () => {
  i18n.addResourceBundle('en', 'common', { test: { list: ['One', 'Two'] } }, true, true);
  await installPseudoLocale();
  const t = i18n.t as unknown as (key: string, opts: object) => unknown;
  expect(t('common:test.list', { returnObjects: true })).toEqual(['⟦One⟧', '⟦Two⟧']);
});
