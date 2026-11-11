import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../utils/supabaseClient', () => ({
  supabase: { functions: { invoke }, auth: {} },
  cloudEnabled: true,
}));

import { AdminPanel } from './AdminPanel';
import { DialogHost } from './ui/dialogs';

const user = (id: string, email: string, practiceName: string) => ({
  id,
  email,
  createdAt: '2026-01-01T00:00:00Z',
  lastSignInAt: null,
  emailConfirmed: true,
  isAdmin: false,
  practiceName,
  doctorName: '',
  hasLogo: false,
  chartCount: 2,
  teamPractice: '',
  teamRole: '',
});

const respond = (overrides: Record<string, unknown> = {}) => {
  invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => {
    if (body.action in overrides) {
      const v = overrides[body.action];
      return v instanceof Error ? { data: null, error: v } : { data: v, error: null };
    }
    switch (body.action) {
      case 'stats':
        return { data: { users: 2, charts: 4, templates: 1 }, error: null };
      case 'list_users':
        return {
          data: { users: [user('a', 'alice@socal.vet', 'SoCal Vet'), user('b', 'bob@pdx.vet', 'Portland Dental')] },
          error: null,
        };
      case 'list_practices':
        return { data: { practices: [] }, error: null };
      default:
        return { data: { ok: true }, error: null };
    }
  });
};

const renderPanel = () =>
  render(
    <>
      <AdminPanel open onClose={vi.fn()} />
      <DialogHost />
    </>
  );

beforeEach(() => {
  invoke.mockReset();
});

describe('AdminPanel', () => {
  it('says "users", and filters the accounts table by search', async () => {
    respond();
    const u = userEvent.setup();
    renderPanel();
    expect(await screen.findByText(/2 users · 4 charts · 1 report template$/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Users' })).toHaveTextContent('alice@socal.vet');

    await u.type(screen.getByRole('searchbox', { name: 'Search users' }), 'portland');
    const table = screen.getByRole('table', { name: 'Users' });
    expect(table).toHaveTextContent('bob@pdx.vet');
    expect(table).not.toHaveTextContent('alice@socal.vet');

    await u.clear(screen.getByRole('searchbox', { name: 'Search users' }));
    await u.type(screen.getByRole('searchbox', { name: 'Search users' }), 'nobody');
    expect(screen.getByText(/No users match/)).toBeInTheDocument();
  });

  it('shows loading, then an empty state for the Accounts tab', async () => {
    respond({ list_users: { users: [] } });
    renderPanel();
    expect(screen.getByText('Loading users…')).toBeInTheDocument();
    expect(await screen.findByText('No users yet.')).toBeInTheDocument();
  });

  it('keeps errors on screen until dismissed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      respond({ list_users: new Error('Admin only') });
      renderPanel();
      const alert = await screen.findByText('Admin only');
      await act(async () => {
        vi.advanceTimersByTime(10000);
      });
      expect(alert).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
      expect(screen.queryByText('Admin only')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sets a password through the in-app prompt, enforcing 8 characters', async () => {
    respond();
    const u = userEvent.setup();
    renderPanel();
    await u.click(await screen.findByRole('button', { name: /alice@socal\.vet/ }));
    await u.click(screen.getByRole('button', { name: 'Set password…' }));

    const field = await screen.findByLabelText('New password');
    expect(field).toHaveAttribute('type', 'password');
    await u.type(field, 'short{Enter}');
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();

    await u.clear(field);
    await u.type(field, 'longenough{Enter}');
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin-api', {
        body: { action: 'set_password', userId: 'a', password: 'longenough' },
      })
    );
    expect(await screen.findByText('Password updated.')).toBeInTheDocument();
  });

  it('confirms in-app before deleting a user', async () => {
    respond();
    const u = userEvent.setup();
    renderPanel();
    await u.click(await screen.findByRole('button', { name: /alice@socal\.vet/ }));
    await u.click(screen.getByRole('button', { name: 'Delete account…' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('cannot be undone');
    await u.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(invoke).not.toHaveBeenCalledWith('admin-api', expect.objectContaining({ body: expect.objectContaining({ action: 'delete_user' }) }));
  });
});
