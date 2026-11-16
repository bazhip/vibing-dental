import { describe, expect, it, vi } from 'vitest';
import { findAuthUserByEmail, isPendingAccount, markInviteRevoked, resetInviteState, safeAppUrl } from './pendingInvites';

const users = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => ({ id: `u${i + offset}`, email: `user${i + offset}@vet.com` }));

describe('findAuthUserByEmail', () => {
  it('finds accounts past the first 1000 (pages until a short page)', async () => {
    const pages = [users(1000), users(1000, 1000), users(5, 2000)];
    const listUsers = vi.fn(async ({ page }: { page: number }) => ({ data: { users: pages[page - 1] ?? [] }, error: null }));
    const admin = { auth: { admin: { listUsers } } };
    expect((await findAuthUserByEmail(admin, 'USER1500@vet.com'))?.id).toBe('u1500');
    expect(await findAuthUserByEmail(admin, 'nobody@vet.com')).toBeNull();
    expect(listUsers).toHaveBeenCalledTimes(2 + 3);
  });
});

describe('isPendingAccount', () => {
  it('only accounts that never confirmed and never signed in', () => {
    expect(isPendingAccount({ email_confirmed_at: null, last_sign_in_at: null })).toBe(true);
    expect(isPendingAccount({ email_confirmed_at: '2026-01-01', last_sign_in_at: null })).toBe(false);
    expect(isPendingAccount({ email_confirmed_at: null, last_sign_in_at: '2026-01-01' })).toBe(false);
    expect(isPendingAccount(null)).toBe(false);
  });
});

describe('invite state in app_metadata', () => {
  const adminWith = () => {
    const updateUserById = vi.fn(async () => ({ error: null }));
    return { admin: { auth: { admin: { updateUserById } } }, updateUserById };
  };
  const user = { id: 'u1', app_metadata: { role: 'admin', provider: 'email', invite_reminders: 2, invite_expires_at: '2026-12-01' } };

  it('a resent invite starts over: reminder/expiry/revoked cleared with null (merge semantics), other keys kept', async () => {
    const { admin, updateUserById } = adminWith();
    await resetInviteState(admin, user);
    expect(updateUserById).toHaveBeenCalledWith('u1', {
      app_metadata: {
        role: 'admin', provider: 'email',
        invite_revoked_at: null, invite_reminders: null, invite_reminded_at: null, invite_expires_at: null,
      },
    });
  });

  it('revoking keeps the other keys', async () => {
    const { admin, updateUserById } = adminWith();
    await markInviteRevoked(admin, user);
    const meta = (updateUserById.mock.calls[0] as unknown as [string, { app_metadata: Record<string, unknown> }])[1].app_metadata;
    expect(meta.role).toBe('admin');
    expect(typeof meta.invite_revoked_at).toBe('string');
  });
});

describe('safeAppUrl', () => {
  it('only our own app (no open redirects in emails)', () => {
    expect(safeAppUrl('https://toothops.app/chart?x=1')).toBe('https://toothops.app/chart');
    expect(safeAppUrl('https://vibing-dental-git-x.vercel.app/')).toBe('https://vibing-dental-git-x.vercel.app/');
    expect(safeAppUrl('https://evil.example/')).toBe('https://toothops.app/');
    expect(safeAppUrl(undefined)).toBe('https://toothops.app/');
  });
});
