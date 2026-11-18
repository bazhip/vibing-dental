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

test('Romanian pending-review counts keep the meaning “to review” in every plural form', async () => {
  await loadLanguage('ro');
  const t = i18n.getFixedT('ro', 'voice');
  for (const count of [0, 1, 2, 19, 20, 101]) {
    expect(t('toReview', { count })).toBe(`${count} de verificat`);
    expect(t('peek.review', { count })).toContain(`${count} de verificat`);
  }
});
