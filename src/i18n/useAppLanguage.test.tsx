import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import i18n from './index';

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

import { DeviceLanguage, useAppLanguage } from './useAppLanguage';
import { LanguageSwitcher } from './LanguageSwitcher';
import { holdLanguage, restoreLoaders } from './testing/holdLanguage';
import type { AppLanguage } from './config';

let seen: AppLanguage[] = [];
function Probe({ saved, loaded }: { saved: AppLanguage | null; loaded: boolean }) {
  seen.push(useAppLanguage(saved, loaded));
  return null;
}

beforeEach(() => {
  seen = [];
  localStorage.clear();
  document.documentElement.removeAttribute('lang');
});
afterEach(async () => {
  vi.restoreAllMocks();
  restoreLoaders();
  await i18n.changeLanguage('en');
});

const browserLanguages = (langs: string[]) => vi.spyOn(navigator, 'languages', 'get').mockReturnValue(langs);

test('uses saved logged-out language', async () => {
  localStorage.setItem('app.language', 'de');
  render(<Probe saved={null} loaded={false} />);
  expect(seen[0]).toBe('de');
  await waitFor(() => expect(i18n.language).toBe('de'));
  expect(document.documentElement.lang).toBe('de');
});

test('no English flash while prefs load', async () => {
  localStorage.setItem('app.language', 'fr');
  const langs: string[] = [];
  const observer = new MutationObserver(() => langs.push(document.documentElement.lang));
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render(<Probe saved={null} loaded={false} />);
  await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
  await new Promise((r) => setTimeout(r, 0));
  observer.disconnect();
  expect(seen.every((l) => l === 'fr')).toBe(true);
  expect(langs[0]).toBe('fr');
});

test('the account choice wins once loaded', async () => {
  localStorage.setItem('app.language', 'fr');
  const { rerender } = render(<Probe saved={null} loaded={false} />);
  rerender(<Probe saved="it" loaded />);
  expect(seen[seen.length - 1]).toBe('it');
  await waitFor(() => expect(i18n.language).toBe('it'));
  expect(document.documentElement.lang).toBe('it');
});

test('always English while switching is disabled', () => {
  langFlag.on = false;
  try {
    localStorage.setItem('app.language', 'fr');
    render(<Probe saved="de" loaded />);
    expect(seen[0]).toBe('en');
  } finally {
    langFlag.on = true;
  }
});

test('a device language still applies when DeviceLanguage unmounts before its catalogs arrive', async () => {
  browserLanguages(['fr-FR']);
  const fr = holdLanguage('fr');
  const { unmount } = render(<DeviceLanguage />);
  unmount(); // e.g. the session restored and the landing page gave way
  fr.release();
  await waitFor(() => expect(i18n.language).toBe('fr'));
  expect(document.documentElement.lang).toBe('fr');
});

test('a slow device language never overrides a later pick in the switcher', async () => {
  browserLanguages(['fr-FR']);
  const fr = holdLanguage('fr');
  render(<><DeviceLanguage /><LanguageSwitcher /></>);
  await userEvent.selectOptions(screen.getByRole('combobox'), 'de');
  await waitFor(() => expect(i18n.language).toBe('de'));
  fr.release();
  await new Promise((r) => setTimeout(r, 20));
  expect(i18n.language).toBe('de');
  expect(document.documentElement.lang).toBe('de');
});
