import { vi } from 'vitest';
import i18n, { catalogLoaders, loadLanguage } from './index';
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
  const boot = bootLanguage(10_000); // generous: chunk imports are slow on a cold test run
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
  const de = holdLanguage('de'); // not released until the end
  let done = false;
  void bootLanguage(1500)!.then(() => { done = true; });
  await vi.advanceTimersByTimeAsync(1499);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(done).toBe(true);
  expect(i18n.language).toBe('en');
  // Free i18next's read slots for the next tests (it caps parallel reads).
  vi.useRealTimers();
  de.release();
  await loadLanguage('de');
});

test('a failing switch still lets the app render', async () => {
  browserLanguages(['it-IT']);
  holdLanguage('it').release();
  vi.spyOn(i18n, 'changeLanguage').mockRejectedValueOnce(new Error('boom'));
  await expect(bootLanguage(10_000)).resolves.toBeUndefined();
  expect(i18n.changeLanguage).toHaveBeenCalledWith('it');
});
