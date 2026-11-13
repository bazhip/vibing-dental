import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('../utils/supabaseClient', () => ({ supabase: { auth: {} }, cloudEnabled: true }));
const cap = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', async (orig) => ({
  ...(await orig<typeof import('@capacitor/core')>()),
  Capacitor: { isNativePlatform: () => cap.native, getPlatform: () => (cap.native ? 'ios' : 'web') },
}));

import { SessionExpiredOverlay } from './SessionExpiredOverlay';

const HINT = 'Already have an account or were invited? Sign in with your email.';

describe('SessionExpiredOverlay', () => {
  beforeEach(() => {
    cap.native = false;
    vi.unstubAllEnvs();
  });

  it('web, flag unset: Google and email sign-in, no Apple or hint (as before)', () => {
    render(<SessionExpiredOverlay email="me@vet.com" onSignOut={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in and continue charting' })).toBeInTheDocument();
  });

  it('web, VITE_APPLE_SIGNIN_WEB=true: offers Apple alongside Google, with the hint', () => {
    vi.stubEnv('VITE_APPLE_SIGNIN_WEB', 'true');
    render(<SessionExpiredOverlay email="me@vet.com" onSignOut={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it('app: always offers Apple with the hint', () => {
    cap.native = true;
    render(<SessionExpiredOverlay email="me@vet.com" onSignOut={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeInTheDocument();
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });
});
