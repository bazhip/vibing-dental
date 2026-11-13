import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import React from 'react';

const native = vi.hoisted(() => ({ value: false }));
const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://auth.example/apple' }, error: null as null | Error })),
  signInWithIdToken: vi.fn(async () => ({ data: {}, error: null as null | Error })),
  updateUser: vi.fn(async () => ({ data: {}, error: null })),
}));
const apple = vi.hoisted(() => ({ authorize: vi.fn() }));

vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => native.value },
}));
vi.mock('@capacitor-community/apple-sign-in', () => ({ SignInWithApple: apple }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(), close: vi.fn() } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), getLaunchUrl: vi.fn() } }));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));

import { AppleSignInButton } from './AppleSignInButton';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  native.value = false;
  vi.clearAllMocks();
});

describe('AppleSignInButton', () => {
  it('web: starts Supabase Apple OAuth back to this page', async () => {
    const onStart = vi.fn();
    render(<AppleSignInButton onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Apple' }));
    expect(onStart).toHaveBeenCalled();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'apple',
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    expect(apple.authorize).not.toHaveBeenCalled();
  });

  it('app: native Apple sheet with a hashed nonce, then an ID-token sign-in with the raw nonce', async () => {
    native.value = true;
    apple.authorize.mockResolvedValue({
      response: { user: 'u', email: null, givenName: 'Jane', familyName: 'Smith', identityToken: 'id-token', authorizationCode: 'c' },
    });
    render(<AppleSignInButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Apple' }));
    await waitFor(() => expect(auth.signInWithIdToken).toHaveBeenCalled());
    const opts = apple.authorize.mock.calls[0][0];
    expect(opts.clientId).toBe('app.toothops.ios');
    expect(opts.scopes).toContain('email');
    const [{ provider, token, nonce: rawNonce }] = auth.signInWithIdToken.mock.calls[0] as unknown as [{ provider: string; token: string; nonce: string }];
    expect(provider).toBe('apple');
    expect(token).toBe('id-token');
    expect(rawNonce).toMatch(/^[0-9a-f]{32,}$/);
    expect(opts.nonce).toBe(sha256(rawNonce));
    expect(auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('app: cancelling the Apple sheet (error 1001) shows no error', async () => {
    native.value = true;
    apple.authorize.mockRejectedValue(new Error('The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)'));
    const onError = vi.fn();
    render(<AppleSignInButton onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Apple' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeEnabled());
    expect(onError).not.toHaveBeenCalled();
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('app: a real failure is reported', async () => {
    native.value = true;
    apple.authorize.mockResolvedValue({
      response: { user: 'u', email: null, givenName: null, familyName: null, identityToken: 'id-token', authorizationCode: 'c' },
    });
    auth.signInWithIdToken.mockResolvedValueOnce({ data: {}, error: new Error('Unacceptable audience') });
    const onError = vi.fn();
    render(<AppleSignInButton onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Apple' }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeEnabled();
  });
});
