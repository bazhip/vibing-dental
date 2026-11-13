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

  it('web: the centred modal, as before', () => {
    render(<SessionExpiredOverlay email="me@vet.com" onSignOut={vi.fn()} />);
    expect(document.querySelector('.ai-settings-overlay .session-expired-modal')).not.toBeNull();
    expect(screen.getByLabelText(/^Email/).closest('.login-field')).not.toBeNull();
    expect(document.querySelector('.ios-form-group')).toBeNull();
  });

  it('app: a full-screen iOS sign-in (no way to dismiss), grouped fields and iOS buttons', () => {
    cap.native = true;
    render(<SessionExpiredOverlay email="me@vet.com" onSignOut={vi.fn()} />);
    const screenEl = screen.getByRole('dialog', { name: 'Session expired — sign in to continue' });
    expect(screenEl).toHaveClass('ios-auth-screen');
    expect(document.querySelector('.ai-settings-overlay')).toBeNull();
    const group = screenEl.querySelector('.ios-form-group')!;
    expect(group.contains(screen.getByLabelText(/^Email/))).toBe(true);
    expect(group.contains(screen.getByLabelText(/^Password/))).toBe(true);
    expect(screen.getByRole('button', { name: 'Sign in and continue charting' })).toHaveClass('ios-button--filled');
    expect(screen.getByRole('button', { name: 'Sign out instead — leave this chart' })).toHaveClass('ios-button--plain');
    expect(screen.queryByRole('button', { name: /Close|Cancel/ })).toBeNull();
  });
});

