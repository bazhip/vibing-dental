import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { user: { email: 'newvet@socal.vet' } } } })),
  updateUser: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));

import { ResetPassword } from './ResetPassword';
import { consumeExplicitSignOut } from '../utils/signOutIntent';

describe('ResetPassword', () => {
  it('shows which account an invite is for', async () => {
    render(<ResetPassword mode="invite" onDone={vi.fn()} />);
    expect(await screen.findByText('newvet@socal.vet')).toBeInTheDocument();
    expect(screen.getByText(/Account for/)).toBeInTheDocument();
  });

  it('toggles password visibility for both fields', async () => {
    const user = userEvent.setup();
    render(<ResetPassword onDone={vi.fn()} />);
    const pw = screen.getByLabelText('New password');
    const confirm = screen.getByLabelText('Confirm new password');
    expect(pw).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show passwords' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(confirm).toHaveAttribute('type', 'text');
  });

  it('"Back to sign in" signs out deliberately and leaves the screen', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<ResetPassword onDone={onDone} />);
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(auth.signOut).toHaveBeenCalled();
    // Marked as an explicit sign-out, so App goes to the landing page
    // rather than treating it as an expired session.
    expect(consumeExplicitSignOut()).toBe(true);
  });
});
