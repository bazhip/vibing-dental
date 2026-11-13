import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import i18n from './i18n';

// This environment has no working localStorage (as in LanguageSwitcher.test).
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, String(v)); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; email: string } } }));
vi.mock('./utils/supabaseClient', () => ({
  cloudEnabled: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: session.current } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      startAutoRefresh: () => {},
    },
  },
}));
vi.mock('./utils/lastSeen', () => ({ touchLastSeen: () => {} }));
vi.mock('./utils/terms', () => ({ flushPendingTerms: () => {} }));

import App from './App';

const realLanguages = Object.getOwnPropertyDescriptor(Navigator.prototype, 'languages')!;
function browserLanguages(langs: string[]) {
  Object.defineProperty(navigator, 'languages', { configurable: true, get: () => langs });
}

beforeEach(() => {
  store.clear();
  session.current = null;
  window.location.hash = '';
});
afterEach(async () => {
  cleanup();
  Object.defineProperty(navigator, 'languages', realLanguages);
  delete (navigator as unknown as Record<string, unknown>).languages;
  await act(() => i18n.changeLanguage('en'));
  document.documentElement.lang = 'en';
});

test('a French browser with no saved choice gets the landing page in French; picking Deutsch switches and is remembered', async () => {
  browserLanguages(['fr-FR', 'en']);
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Se connecter' }, { timeout: 4000 })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('fr');

  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Langue' }), 'de');
  expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
  expect(localStorage.getItem('app.language')).toBe('de');
  expect(document.documentElement.lang).toBe('de');
});

test('a language picked on this device beats the browser language', async () => {
  browserLanguages(['fr-FR']);
  localStorage.setItem('app.language', 'de');
  render(<App />);
  expect(await screen.findByRole('button', { name: 'Anmelden' }, { timeout: 4000 })).toBeInTheDocument();
});

test('signed in, the landing page has no device language picker: the account picker owns the choice', async () => {
  session.current = { user: { id: 'u1', email: 'vet@clinic.test' } };
  window.location.hash = '#/home';
  render(<App />);
  expect((await screen.findAllByRole('button', { name: 'Back to the app' }, { timeout: 4000 })).length).toBeGreaterThan(0);
  expect(screen.queryByRole('combobox')).toBeNull();
});
