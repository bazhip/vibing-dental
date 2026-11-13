import { render, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateUser: vi.fn(async () => ({ error: null })),
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));

import { useAppLanguage } from './useAppLanguage';
import { resetSyncedAuthLanguage } from './syncAuthLanguage';
import type { AppLanguage } from './config';

function Probe({ saved, loaded = true, sync = true }: { saved: AppLanguage | null; loaded?: boolean; sync?: boolean }) {
  useAppLanguage(saved, loaded, sync);
  return null;
}
const session = (language?: string) => ({
  data: { session: { user: { id: 'u1', user_metadata: language ? { language } : {} } } },
});

beforeEach(() => {
  vi.clearAllMocks();
  resetSyncedAuthLanguage();
});

test('records the language when the account metadata has none', async () => {
  auth.getSession.mockResolvedValue(session());
  const { rerender } = render(<Probe saved="fr" />);
  await waitFor(() => expect(auth.updateUser).toHaveBeenCalledTimes(1));
  expect(auth.updateUser).toHaveBeenCalledWith({ data: { language: 'fr' } });
  rerender(<Probe saved="fr" />);
  rerender(<Probe saved="fr" />);
  await new Promise((r) => setTimeout(r, 20));
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
});

test('does nothing when the metadata already matches', async () => {
  auth.getSession.mockResolvedValue(session('fr'));
  render(<Probe saved="fr" />);
  await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 20));
  expect(auth.updateUser).not.toHaveBeenCalled();
});

test('waits for account preferences, and skips signed-out shells and no session', async () => {
  auth.getSession.mockResolvedValue(session());
  render(<Probe saved="fr" loaded={false} />);
  render(<Probe saved="fr" sync={false} />);
  await new Promise((r) => setTimeout(r, 20));
  expect(auth.getSession).not.toHaveBeenCalled();
  auth.getSession.mockResolvedValue({ data: { session: null } });
  render(<Probe saved="fr" />);
  await waitFor(() => expect(auth.getSession).toHaveBeenCalled());
  expect(auth.updateUser).not.toHaveBeenCalled();
});

test('a language change writes the new value once', async () => {
  auth.getSession.mockResolvedValue(session('fr'));
  const { rerender } = render(<Probe saved="fr" />);
  rerender(<Probe saved="de" />);
  await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ data: { language: 'de' } }));
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
});
