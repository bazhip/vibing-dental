import { render } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { findUntranslated, installPseudoLocale, restoreLocale } from './pseudo';
import i18n from '../index';

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
