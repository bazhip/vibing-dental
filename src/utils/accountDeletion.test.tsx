import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const mocks = vi.hoisted(() => ({
  teamCall: vi.fn(async () => ({ ok: true })),
  signOut: vi.fn(async () => ({ error: null })),
  clearChartStorage: vi.fn(),
}));
vi.mock('../hooks/useTeam', () => ({ call: mocks.teamCall }));
vi.mock('./supabaseClient', () => ({ supabase: { auth: { signOut: mocks.signOut } }, cloudEnabled: true }));
vi.mock('../hooks/useChartState', () => ({ clearChartStorage: mocks.clearChartStorage }));

import { deleteMyAccount, deleteMyPractice } from './accountDeletion';
import { DialogHost } from '../components/ui/dialogs';

beforeEach(() => {
  mocks.teamCall.mockReset().mockResolvedValue({ ok: true });
  mocks.signOut.mockClear();
  mocks.clearChartStorage.mockClear();
  render(<DialogHost />);
});

describe('deleteMyAccount', () => {
  it('needs the email typed exactly, then deletes, signs out and clears local data', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const done = deleteMyAccount('me@vet.com', reload);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    const input = await screen.findByLabelText('Email');
    await user.type(input, 'wrong@vet.com');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await screen.findByText('Type your email exactly.')).toBeInTheDocument();
    expect(mocks.teamCall).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, 'ME@vet.com');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await done).toBe(true);
    expect(mocks.teamCall).toHaveBeenCalledWith({ action: 'delete_account', confirm: 'ME@vet.com' });
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.clearChartStorage).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('cancelling at the first step changes nothing', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const done = deleteMyAccount('me@vet.com', reload);
    await user.click(await screen.findByRole('button', { name: /cancel/i }));
    expect(await done).toBe(false);
    expect(mocks.teamCall).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('a refusal from the server (e.g. primary owner with a team) keeps the user signed in', async () => {
    mocks.teamCall.mockRejectedValue(new Error('You’re the primary owner of “SoCal Vet”, which has 2 other members. Transfer ownership or delete the practice first.'));
    const user = userEvent.setup();
    const reload = vi.fn();
    const done = deleteMyAccount('me@vet.com', reload);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Email'), 'me@vet.com');
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(await done).toBe(false);
    await waitFor(() => expect(screen.getByText(/Transfer ownership or delete the practice first/)).toBeInTheDocument());
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.clearChartStorage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('deleteMyPractice', () => {
  it('needs the practice name typed exactly', async () => {
    const user = userEvent.setup();
    const reload = vi.fn();
    const done = deleteMyPractice('SoCal Vet', reload);
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Practice name'), 'SoCal Vet');
    await user.click(screen.getByRole('button', { name: 'Delete practice' }));
    expect(await done).toBe(true);
    expect(mocks.teamCall).toHaveBeenCalledWith({ action: 'delete_practice', confirm: 'SoCal Vet' });
    expect(mocks.clearChartStorage).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('an unnamed practice asks for DELETE', async () => {
    const user = userEvent.setup();
    const done = deleteMyPractice('', vi.fn());
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Confirmation'), 'DELETE');
    await user.click(screen.getByRole('button', { name: 'Delete practice' }));
    expect(await done).toBe(true);
    expect(mocks.teamCall).toHaveBeenCalledWith({ action: 'delete_practice', confirm: 'DELETE' });
  });
});
