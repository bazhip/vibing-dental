import i18n, { catalogLoaders, loadLanguage } from './index';

const real = { ...catalogLoaders };
afterEach(() => {
  Object.assign(catalogLoaders, real);
  delete catalogLoaders['zz/common'];
  i18n.removeResourceBundle('zz', 'common');
});

test('resolves true once every lazy namespace is loaded', async () => {
  catalogLoaders['zz/common'] = async () => ({ actions: { save: 'Zave' } });
  expect(await loadLanguage('zz')).toBe(true);
  expect(i18n.getFixedT('zz', 'common')('actions.save')).toBe('Zave');
});

test('a failed chunk load resolves false, and a later attempt refetches', async () => {
  let fail = true;
  const load = vi.fn(async () => {
    if (fail) throw new Error('chunk failed');
    return { actions: { save: 'Zave' } };
  });
  catalogLoaders['zz/common'] = load;
  expect(await loadLanguage('zz')).toBe(false);
  expect(i18n.hasResourceBundle('zz', 'common')).toBe(false);
  fail = false;
  expect(await loadLanguage('zz')).toBe(true);
  expect(load).toHaveBeenCalledTimes(2);
  expect(i18n.getFixedT('zz', 'common')('actions.save')).toBe('Zave');
});

test('languages with nothing to fetch resolve true', async () => {
  expect(await loadLanguage('en')).toBe(true);
});
