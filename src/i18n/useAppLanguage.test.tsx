import { render, waitFor } from '@testing-library/react';
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

import { useAppLanguage } from './useAppLanguage';
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
  await i18n.changeLanguage('en');
});

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
