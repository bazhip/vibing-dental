import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  listeners: {} as Record<string, () => void>,
  authenticate: vi.fn(),
  native: true,
  signOut: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('./platform', () => ({ isNativeApp: () => h.native }));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (name: string, cb: () => void) => {
      h.listeners[name] = cb;
      return { remove: vi.fn() };
    }),
  },
}));
vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: { authenticate: h.authenticate },
}));
vi.mock('../hooks/useChartState', () => ({ clearChartStorage: h.clear }));
vi.mock('../utils/supabaseClient', () => ({ supabase: { auth: { signOut: h.signOut } } }));

import { shouldLock, LOCK_AFTER_MS } from './appLock';
import { AppLockOverlay } from '../components/AppLockOverlay';

const MIN = 60 * 1000;

describe('shouldLock', () => {
  it('is false just under 5 minutes, true at 5, false when never backgrounded', () => {
    expect(shouldLock(0, 5 * MIN - 1000)).toBe(false);
    expect(shouldLock(0, 5 * MIN)).toBe(true);
    expect(shouldLock(null, 10 * MIN)).toBe(false);
    expect(LOCK_AFTER_MS).toBe(5 * MIN);
  });
});

async function background(ms: number) {
  const t = Date.now();
  const spy = vi.spyOn(Date, 'now');
  spy.mockReturnValue(t);
  await act(async () => h.listeners.pause?.());
  spy.mockReturnValue(t + ms);
  await act(async () => h.listeners.resume?.());
  spy.mockRestore();
}

describe('AppLockOverlay', () => {
  beforeEach(() => {
    h.native = true;
    h.listeners = {};
    h.authenticate.mockReset();
    h.signOut.mockReset();
    h.clear.mockReset();
  });

  it('renders nothing on web', async () => {
    h.native = false;
    const { container } = render(<AppLockOverlay />);
    expect(container.firstChild).toBeNull();
  });

  it('stays hidden after a short background', async () => {
    h.authenticate.mockResolvedValue(undefined);
    render(<AppLockOverlay />);
    await waitFor(() => expect(h.listeners.resume).toBeDefined());
    await background(MIN);
    expect(screen.queryByText(/ToothOps is locked/i)).toBeNull();
  });

  it('locks after 5 minutes, prompts, and unlocks on success', async () => {
    h.authenticate.mockResolvedValue(undefined);
    render(<AppLockOverlay />);
    await waitFor(() => expect(h.listeners.resume).toBeDefined());
    await background(5 * MIN);
    await waitFor(() => expect(h.authenticate).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'Unlock ToothOps', allowDeviceCredential: true })
    ));
    await waitFor(() => expect(screen.queryByText(/ToothOps is locked/i)).toBeNull());
  });

  it('stays locked on failure with Try again and Sign out', async () => {
    h.authenticate.mockRejectedValue(new Error('nope'));
    render(<AppLockOverlay />);
    await waitFor(() => expect(h.listeners.resume).toBeDefined());
    await background(5 * MIN);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByText(/ToothOps is locked/i)).toBeTruthy();
    h.authenticate.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/ToothOps is locked/i)).toBeNull());
  });

  it('Sign out signs the user out', async () => {
    h.authenticate.mockRejectedValue(new Error('nope'));
    render(<AppLockOverlay />);
    await waitFor(() => expect(h.listeners.resume).toBeDefined());
    await background(5 * MIN);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(h.signOut).toHaveBeenCalled());
    await waitFor(() => expect(h.clear).toHaveBeenCalled());
  });
});
