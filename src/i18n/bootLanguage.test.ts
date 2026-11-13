import { vi } from 'vitest';
import i18n, { catalogLoaders } from './index';
import { holdLanguage, restoreLoaders } from './testing/holdLanguage';
import { bootLanguage } from './bootLanguage';

const browserLanguages = (langs: string[]) => vi.spyOn(navigator, 'languages', 'get').mockReturnValue(langs);

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  restoreLoaders();
  await i18n.changeLanguage('en');
  document.documentElement.removeAttribute('lang');
});

test('a French browser is switched to French before the first render', async () => {
  browserLanguages(['fr-FR']);
  holdLanguage('fr').release(); // nothing loaded yet, as on a first visit
  const boot = bootLanguage();
  expect(boot).not.toBeNull();
  await boot;
  expect(i18n.language).toBe('fr');
  expect(document.documentElement.lang).toBe('fr');
  expect(i18n.t('actions.save')).not.toBe('Save');
});

test('English renders at once, without loading anything', () => {
  browserLanguages(['en-GB', 'fr']);
  const spy = vi.spyOn(catalogLoaders, 'fr/common');
  expect(bootLanguage()).toBeNull();
  expect(spy).not.toHaveBeenCalled();
  expect(i18n.language).toBe('en');
});

test('catalogs that never arrive fall back to English after the timeout', async () => {
  vi.useFakeTimers();
  browserLanguages(['de-DE']);
  holdLanguage('de'); // never released
  let done = false;
  void bootLanguage(1500)!.then(() => { done = true; });
  await vi.advanceTimersByTimeAsync(1499);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(done).toBe(true);
  expect(i18n.language).toBe('en');
});
