import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const auth = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { email: 'me@vet.com' } } })),
  updateUser: vi.fn(async () => ({ error: null as null | Error })),
}));
const langFlag = vi.hoisted(() => ({ on: false }));
vi.mock('../i18n/config', async (orig) => ({
  ...(await orig<typeof import('../i18n/config')>()),
  get LANGUAGE_SWITCHING_ENABLED() {
    return langFlag.on;
  },
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));

import { AccountModal } from './AccountModal';
import { DialogHost } from './ui/dialogs';
import type { UseProfileReturn } from '../hooks/useProfile';

const profile = {
  practiceName: 'SoCal Vet',
  doctorName: 'Dr. Ng',
  update: vi.fn().mockResolvedValue(undefined),
} as unknown as UseProfileReturn;

const renderModal = (onClose = vi.fn(), extra: Partial<React.ComponentProps<typeof AccountModal>> = {}) => {
  render(
    <>
      <AccountModal open onClose={onClose} profile={profile} {...extra} />
      <DialogHost />
    </>
  );
  return onClose;
};

beforeEach(() => {
  auth.updateUser.mockClear();
  langFlag.on = false;
});

describe('AccountModal', () => {
  it('requires the confirmation to match before updating the password', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText('New password'), 'longenough1');
    await user.type(screen.getByLabelText('Confirm new password'), 'longenough2');
    expect(screen.getByText(/don’t match yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/don’t match/);
    expect(auth.updateUser).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('Confirm new password'), 'longenough1');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: 'longenough1' }));
    // Fields clear on success.
    await waitFor(() => expect(screen.getByLabelText('New password')).toHaveValue(''));
  });

  it('keeps Update password disabled under 8 characters and toggles visibility', async () => {
    const user = userEvent.setup();
    renderModal();
    const pw = screen.getByLabelText('New password');
    await user.type(pw, 'short');
    await user.type(screen.getByLabelText('Confirm new password'), 'short');
    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show passwords' }));
    expect(pw).toHaveAttribute('type', 'text');
  });

  it('shows email errors in the email section', async () => {
    const user = userEvent.setup();
    auth.updateUser.mockResolvedValueOnce({ error: new Error('Email address already registered') });
    renderModal();
    const field = screen.getByLabelText('Sign-in email');
    await waitFor(() => expect(field).toHaveValue('me@vet.com'));
    await user.clear(field);
    await user.type(field, 'taken@vet.com{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email address already registered');
    expect(alert.closest('form')?.contains(field)).toBe(true);
  });

  it('asks before discarding typed values on Done', async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await user.type(screen.getByLabelText('Doctor name'), ', DVM');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/doctor name/);
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes straight away when nothing is unsaved', async () => {
    const user = userEvent.setup();
    const onClose = renderModal();
    await waitFor(() => expect(screen.getByLabelText('Sign-in email')).toHaveValue('me@vet.com'));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('hides the language select while switching is disabled', () => {
    renderModal();
    expect(screen.queryByRole('combobox', { name: /language/i })).not.toBeInTheDocument();
  });

  it('offers the five languages by their own names and reports a choice', async () => {
    langFlag.on = true;
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();
    renderModal(vi.fn(), { language: 'en', onLanguageChange });
    const select = screen.getByRole('combobox', { name: /language/i });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'English', 'Français', 'Deutsch', 'Italiano', 'Español',
    ]);
    await user.selectOptions(select, 'Français');
    expect(onLanguageChange).toHaveBeenCalledWith('fr');
  });
});
