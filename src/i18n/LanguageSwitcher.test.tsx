import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import i18n, { catalogLoaders } from './index';

// This test environment has no working localStorage (as in useChartSettings.test).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

const langFlag = vi.hoisted(() => ({ on: true }));
vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  get LANGUAGE_SWITCHING_ENABLED() {
    return langFlag.on;
  },
}));

import { LanguageSwitcher } from './LanguageSwitcher';

const realLoaders = { ...catalogLoaders };
const realCatalogs = Object.fromEntries(['fr', 'de'].map((l) => [l, i18n.getResourceBundle(l, 'common')]));

beforeEach(() => localStorage.clear());
afterEach(async () => {
  langFlag.on = true;
  await i18n.changeLanguage('en');
  Object.assign(catalogLoaders, realLoaders);
  for (const [l, cat] of Object.entries(realCatalogs)) i18n.addResourceBundle(l, 'common', cat, true, true);
});

function deferred() {
  let resolve!: (v: Record<string, unknown>) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<Record<string, unknown>>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('lists every language by its own name and switches', async () => {
  render(<LanguageSwitcher />);
  const select = screen.getByRole('combobox');
  expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
    'English', 'Français', 'Deutsch', 'Italiano', 'Español',
  ]);
  await userEvent.selectOptions(select, 'de');
  expect(localStorage.getItem('app.language')).toBe('de');
  await waitFor(() => expect(i18n.language).toBe('de'));
});

test('renders nothing while switching is disabled', () => {
  langFlag.on = false;
  const { container } = render(<LanguageSwitcher compact />);
  expect(container).toBeEmptyDOMElement();
});

test('a failed load keeps the current language and reverts the selection; a retry works', async () => {
  i18n.removeResourceBundle('de', 'common');
  let fail = true;
  catalogLoaders['de/common'] = async () => {
    if (fail) throw new Error('offline');
    return realCatalogs.de;
  };
  document.documentElement.lang = 'en';
  render(<LanguageSwitcher />);
  const select = screen.getByRole<HTMLSelectElement>('combobox');
  await userEvent.selectOptions(select, 'de');
  await waitFor(() => expect(select.value).toBe('en'));
  expect(i18n.language).toBe('en');
  expect(document.documentElement.lang).toBe('en');
  expect(localStorage.getItem('app.language')).toBeNull();

  fail = false;
  await userEvent.selectOptions(select, 'de');
  await waitFor(() => expect(i18n.language).toBe('de'));
  expect(select.value).toBe('de');
  expect(localStorage.getItem('app.language')).toBe('de');
});

test('rapid changes: the last choice wins even if an earlier load finishes later', async () => {
  i18n.removeResourceBundle('fr', 'common');
  i18n.removeResourceBundle('de', 'common');
  const fr = deferred();
  const de = deferred();
  catalogLoaders['fr/common'] = () => fr.promise;
  catalogLoaders['de/common'] = () => de.promise;
  render(<LanguageSwitcher />);
  const select = screen.getByRole<HTMLSelectElement>('combobox');
  await userEvent.selectOptions(select, 'fr');
  expect(select.value).toBe('fr'); // pending choice shows while loading
  await userEvent.selectOptions(select, 'de');
  expect(select.value).toBe('de');
  de.resolve(realCatalogs.de);
  await waitFor(() => expect(i18n.language).toBe('de'));
  fr.resolve(realCatalogs.fr);
  await new Promise((r) => setTimeout(r, 10));
  expect(i18n.language).toBe('de');
  expect(select.value).toBe('de');
  expect(localStorage.getItem('app.language')).toBe('de');
});
