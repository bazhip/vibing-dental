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

// This jsdom build has no Web Storage.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
});

import { shouldLock, shouldLockOnLaunch, LOCK_AFTER_MS } from './appLock';
import { readJson, writeJson } from '../utils/storage';
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

describe('shouldLockOnLaunch', () => {
  it('locks when the last background was 5+ minutes ago or is unknown', () => {
    expect(shouldLockOnLaunch(0, 5 * MIN - 1000)).toBe(false);
    expect(shouldLockOnLaunch(0, 5 * MIN)).toBe(true);
    expect(shouldLockOnLaunch(null, 0)).toBe(true);
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
    store.clear();
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

  it('records the background time in storage on pause (survives iOS killing the app)', async () => {
    render(<AppLockOverlay />);
    await waitFor(() => expect(h.listeners.pause).toBeDefined());
    const spy = vi.spyOn(Date, 'now').mockReturnValue(1234);
    await act(async () => h.listeners.pause());
    spy.mockRestore();
    expect(readJson('toothops.backgroundedAt', 1, null)).toBe(1234);
  });

  it('cold start with a session, last backgrounded 5+ minutes ago: locked and prompts', async () => {
    h.authenticate.mockReturnValue(new Promise(() => {}));
    writeJson('toothops.backgroundedAt', 1, Date.now() - 6 * MIN);
    render(<AppLockOverlay lockOnLaunch />);
    expect(screen.getByText(/ToothOps is locked/i)).toBeTruthy();
    await waitFor(() => expect(h.authenticate).toHaveBeenCalledTimes(1));
  });

  it('cold start with a session and no recorded background time: locked', async () => {
    h.authenticate.mockReturnValue(new Promise(() => {}));
    render(<AppLockOverlay lockOnLaunch />);
    expect(screen.getByText(/ToothOps is locked/i)).toBeTruthy();
  });

  it('cold start shortly after backgrounding: not locked', async () => {
    writeJson('toothops.backgroundedAt', 1, Date.now() - MIN);
    render(<AppLockOverlay lockOnLaunch />);
    expect(screen.queryByText(/ToothOps is locked/i)).toBeNull();
    expect(h.authenticate).not.toHaveBeenCalled();
  });

  it('a fresh sign-in (no lockOnLaunch) is never locked by an old background time', async () => {
    writeJson('toothops.backgroundedAt', 1, Date.now() - 60 * MIN);
    render(<AppLockOverlay />);
    expect(screen.queryByText(/ToothOps is locked/i)).toBeNull();
  });

  it('covers the screen on pause (app-switcher privacy) and uncovers on a short resume', async () => {
    const { container } = render(<div><p>patient chart</p><AppLockOverlay /></div>);
    await waitFor(() => expect(h.listeners.pause).toBeDefined());
    await act(async () => h.listeners.pause());
    expect(screen.getByTestId('privacy-cover')).toBeTruthy();
    expect(container.hasAttribute('inert')).toBe(true);
    await act(async () => h.listeners.resume());
    expect(screen.queryByTestId('privacy-cover')).toBeNull();
    expect(container.hasAttribute('inert')).toBe(false);
  });

  it('marks the app behind the lock screen inert and focuses the lock screen', async () => {
    h.authenticate.mockRejectedValue(new Error('nope'));
    const { container } = render(<div><button>chart button</button><AppLockOverlay /></div>);
    await waitFor(() => expect(h.listeners.resume).toBeDefined());
    await background(5 * MIN);
    await screen.findByRole('button', { name: 'Try again' });
    expect(container.hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('never runs two Face ID prompts at once', async () => {
    let finish: () => void = () => {};
    h.authenticate.mockImplementation(() => new Promise<void>((r) => { finish = r; }));
    render(<AppLockOverlay />);
    await waitFor(() => expect(h.listeners.resume).toBeDefined());
    await background(5 * MIN);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(h.authenticate).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByText(/ToothOps is locked/i)).toBeNull());
  });

  it('no passcode on the device: explains, keeps Sign out, does not re-prompt on its own', async () => {
    h.authenticate.mockRejectedValue(Object.assign(new Error('Passcode not set'), { code: 'passcodeNotSet' }));
    render(<AppLockOverlay />);
    await waitFor(() => expect(h.listeners.resume).toBeDefined());
    await background(5 * MIN);
    expect(await screen.findByText(/set a passcode/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.authenticate).toHaveBeenCalledTimes(1);
  });
});
