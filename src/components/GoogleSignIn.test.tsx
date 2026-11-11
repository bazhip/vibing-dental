import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ data: {}, error: null as null | Error })),
  getUser: vi.fn(),
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));

import { GoogleSignInButton } from './GoogleSignInButton';
import { FinishSetupModal, useFinishSetup } from './FinishSetupModal';
import { DialogHost } from './ui/dialogs';
import type { UseProfileReturn } from '../hooks/useProfile';

const makeProfile = (over: Partial<UseProfileReturn> = {}) =>
  ({ loaded: true, practiceName: '', doctorName: '', practiceId: '', update: vi.fn().mockResolvedValue(undefined), ...over }) as unknown as UseProfileReturn;

const googleUser = (meta: Record<string, unknown> = { full_name: 'Jane Smith' }, providers = ['google']) => ({
  data: { user: { id: 'u1', app_metadata: { provider: providers[0], providers }, user_metadata: meta } },
});

function Harness({ profile }: { profile: UseProfileReturn }) {
  const setup = useFinishSetup(profile, true);
  return (
    <>
      <span data-testid="checked">{String(setup.checked)}</span>
      {setup.need && <FinishSetupModal need={setup.need} profile={profile} onDone={setup.done} />}
      <DialogHost />
    </>
  );
}

// This jsdom build has no Web Storage — give the "Later" flag somewhere to live.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

beforeEach(() => {
  localStorage.clear();
  auth.signInWithOAuth.mockClear();
  auth.getUser.mockReset();
});

describe('GoogleSignInButton', () => {
  it('starts Supabase Google OAuth back to this page', async () => {
    render(<GoogleSignInButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
  });

  it('reports a failure to start', async () => {
    auth.signInWithOAuth.mockResolvedValueOnce({ data: {}, error: new Error('Unsupported provider: provider is not enabled') });
    const onError = vi.fn();
    render(<GoogleSignInButton onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
  });
});

describe('finish setup', () => {
  it('asks a new Google account for both names, doctor pre-filled from Google', async () => {
    auth.getUser.mockResolvedValue(googleUser());
    const profile = makeProfile();
    render(<Harness profile={profile} />);
    expect(await screen.findByText('Finish setting up')).toBeInTheDocument();
    expect(screen.getByLabelText('Doctor name')).toHaveValue('Jane Smith');
    await userEvent.type(screen.getByLabelText('Practice name'), 'Coastal Vet');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(profile.update).toHaveBeenCalledWith({ practiceName: 'Coastal Vet', doctorName: 'Jane Smith' }));
    await waitFor(() => expect(screen.queryByText('Finish setting up')).toBeNull());
  });

  it('team members (practice name comes from the practice) are only asked for a doctor name', async () => {
    auth.getUser.mockResolvedValue(googleUser({}));
    render(<Harness profile={makeProfile({ practiceId: 'p1', practiceName: 'Team Vet' })} />);
    expect(await screen.findByLabelText('Doctor name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Practice name')).toBeNull();
  });

  it('never shows for email/password accounts or complete profiles', async () => {
    auth.getUser.mockResolvedValue(googleUser({}, ['email']));
    const { unmount } = render(<Harness profile={makeProfile()} />);
    await waitFor(() => expect(screen.getByTestId('checked')).toHaveTextContent('true'));
    expect(screen.queryByText('Finish setting up')).toBeNull();
    unmount();
    auth.getUser.mockResolvedValue(googleUser());
    render(<Harness profile={makeProfile({ practiceName: 'Coastal Vet', doctorName: 'Dr. Smith' })} />);
    await waitFor(() => expect(screen.getAllByTestId('checked')[0]).toHaveTextContent('true'));
    expect(screen.queryByText('Finish setting up')).toBeNull();
  });

  it('"Later" hides it on this browser', async () => {
    auth.getUser.mockResolvedValue(googleUser());
    const { unmount } = render(<Harness profile={makeProfile()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Later' }));
    expect(screen.queryByText('Finish setting up')).toBeNull();
    unmount();
    render(<Harness profile={makeProfile()} />);
    await waitFor(() => expect(screen.getByTestId('checked')).toHaveTextContent('true'));
    expect(screen.queryByText('Finish setting up')).toBeNull();
  });
});
