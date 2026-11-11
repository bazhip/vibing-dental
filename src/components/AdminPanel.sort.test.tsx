import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('../utils/supabaseClient', () => ({
  supabase: { functions: { invoke }, auth: {} },
  cloudEnabled: true,
}));

import { AdminPanel, lastActiveAt, sortAccounts } from './AdminPanel';
import { DialogHost } from './ui/dialogs';

type U = Parameters<typeof sortAccounts>[0][number];
const u = (email: string, over: Partial<U> = {}): U => ({
  id: email, email, createdAt: '2026-01-01T00:00:00Z', lastSignInAt: null, lastSeenAt: null,
  emailConfirmed: true, isAdmin: false, practiceName: '', doctorName: '', hasLogo: false,
  chartCount: 0, teamPractice: '', teamRole: '', ...over,
});

describe('lastActiveAt', () => {
  it('takes the later of app use and sign-in', () => {
    expect(lastActiveAt({ lastSignInAt: '2026-11-01T10:00:00Z', lastSeenAt: '2026-11-10T09:00:00Z' })).toBe('2026-11-10T09:00:00Z');
    expect(lastActiveAt({ lastSignInAt: '2026-11-11T10:00:00Z', lastSeenAt: '2026-11-10T09:00:00Z' })).toBe('2026-11-11T10:00:00Z');
    expect(lastActiveAt({ lastSignInAt: '2026-11-01T10:00:00Z', lastSeenAt: null })).toBe('2026-11-01T10:00:00Z');
    expect(lastActiveAt({ lastSignInAt: null, lastSeenAt: undefined })).toBeNull();
  });
});

describe('sortAccounts', () => {
  const users = [
    u('carol@x.vet', { chartCount: 5, practiceName: 'Zeta Vet', lastSignInAt: '2026-11-01T00:00:00Z' }),
    u('alice@x.vet', { chartCount: 0, practiceName: '', lastSeenAt: '2026-11-11T00:00:00Z' }),
    u('bob@x.vet', { chartCount: 12, teamPractice: 'Alpha Dental', isAdmin: true }),
  ];
  const emails = (list: U[]) => list.map((x) => x.email.split('@')[0]);

  it('sorts each column both ways', () => {
    expect(emails(sortAccounts(users, 'email', 'asc'))).toEqual(['alice', 'bob', 'carol']);
    expect(emails(sortAccounts(users, 'email', 'desc'))).toEqual(['carol', 'bob', 'alice']);
    expect(emails(sortAccounts(users, 'charts', 'desc'))).toEqual(['bob', 'carol', 'alice']);
    expect(emails(sortAccounts(users, 'charts', 'asc'))).toEqual(['alice', 'carol', 'bob']);
  });

  it('keeps blanks at the bottom in either direction', () => {
    // alice has no practice; bob was never active; only bob has flags.
    expect(emails(sortAccounts(users, 'practice', 'asc'))).toEqual(['bob', 'carol', 'alice']);
    expect(emails(sortAccounts(users, 'practice', 'desc'))).toEqual(['carol', 'bob', 'alice']);
    expect(emails(sortAccounts(users, 'active', 'desc'))).toEqual(['alice', 'carol', 'bob']);
    expect(emails(sortAccounts(users, 'active', 'asc'))).toEqual(['carol', 'alice', 'bob']);
    expect(emails(sortAccounts(users, 'flags', 'asc'))[0]).toBe('bob');
  });
});

describe('Accounts table', () => {
  it('opens sorted by Last active, and headers re-sort on click', async () => {
    const list = [
      u('old@x.vet', { lastSignInAt: '2026-10-01T00:00:00Z', chartCount: 9 }),
      u('new@x.vet', { lastSignInAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-11-11T00:00:00Z', chartCount: 1 }),
    ];
    invoke.mockImplementation(async (_fn: string, { body }: { body: { action: string } }) => {
      if (body.action === 'stats') return { data: { users: 2, charts: 10, templates: 0 }, error: null };
      if (body.action === 'list_users') return { data: { users: list }, error: null };
      if (body.action === 'list_practices') return { data: { practices: [] }, error: null };
      return { data: { ok: true }, error: null };
    });
    render(<><AdminPanel open onClose={vi.fn()} /><DialogHost /></>);
    const table = await screen.findByRole('table', { name: 'Users' });
    const order = () => within(table).getAllByRole('row').slice(1).map((r) => r.textContent?.split('@')[0]);
    expect(within(table).getByRole('columnheader', { name: /Last active/ })).toHaveAttribute('aria-sort', 'descending');
    expect(order()).toEqual(['new', 'old']); // app use beats an older sign-in
    await userEvent.click(within(table).getByRole('button', { name: /Charts/ }));
    expect(order()).toEqual(['old', 'new']);
    await userEvent.click(within(table).getByRole('button', { name: /Charts/ }));
    expect(order()).toEqual(['new', 'old']);
    expect(within(table).getByRole('columnheader', { name: /Charts/ })).toHaveAttribute('aria-sort', 'ascending');
  });
});
