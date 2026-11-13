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

import { LanguageSwitcher } from './LanguageSwitcher';

beforeEach(() => localStorage.clear());
afterEach(async () => {
  langFlag.on = true;
  await i18n.changeLanguage('en');
});

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
