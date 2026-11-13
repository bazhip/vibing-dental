import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const flags = vi.hoisted(() => ({ native: true, session: null as null | { user: { id: string; email: string; app_metadata: object } }, error: null as unknown }));
const auth = vi.hoisted(() => ({
  storageKey: 'sb-test-auth-token',
  getSession: vi.fn(async () => ({ data: { session: flags.session }, error: flags.error })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  startAutoRefresh: vi.fn(),
}));

vi.mock('./native/platform', () => ({ isNativeApp: () => flags.native, WEB_ORIGIN: 'https://toothops.app/' }));
vi.mock('./utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));
vi.mock('./components/Landing', () => ({ Landing: () => <div>LANDING PAGE</div> }));
vi.mock('./components/Login', () => ({
  Login: ({ appMode }: { appMode?: boolean }) => <div>{appMode ? 'APP LOGIN' : 'WEB LOGIN'}</div>,
}));
const entryGridProps = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('./EntryGrid', () => ({
  default: (props: Record<string, unknown>) => {
    entryGridProps.current = props;
    return <div>{props.trial ? 'TRIAL CHART' : 'CHART'}</div>;
  },
}));
vi.mock('./components/BillingGate', () => ({ BillingGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const lockProps = vi.hoisted(() => ({ current: null as null | { lockOnLaunch?: boolean } }));
vi.mock('./components/AppLockOverlay', () => ({
  AppLockOverlay: (props: { lockOnLaunch?: boolean }) => {
    lockProps.current = props;
    return null;
  },
}));
vi.mock('./utils/lastSeen', () => ({ touchLastSeen: vi.fn() }));
vi.mock('./utils/terms', () => ({ flushPendingTerms: vi.fn() }));

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

import App from './App';
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { act } from '@testing-library/react';
import { writeString } from './utils/storage';
import { readBillingCache, saveBillingCache } from './native/billingCache';
import { markExplicitSignOut } from './utils/signOutIntent';
import type { BillingInfo } from './hooks/useBilling';

const cachedInfo = { status: 'active', role: 'owner', practice: { id: 'p1', name: 'A Vet' } } as unknown as BillingInfo;
type AuthCb = (event: string, session: unknown) => void;
const authCallback = () => (auth.onAuthStateChange.mock.calls.at(-1) as unknown as [AuthCb])[0];

beforeEach(() => {
  flags.native = true;
  flags.session = null;
  flags.error = null;
  store.clear();
  entryGridProps.current = null;
  window.location.hash = '';
});

describe('App routing in the iOS app', () => {
  it('signed out: the sign-in-only login, never the landing page', async () => {
    render(<App />);
    expect(await screen.findByText('APP LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('LANDING PAGE')).toBeNull();
  });

  it('ignores a leftover no-account trial', async () => {
    writeString('trial', 1, '1');
    render(<App />);
    expect(await screen.findByText('APP LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('TRIAL CHART')).toBeNull();
  });

  it('signed in: the chart, with no way to the homepage', async () => {
    flags.session = { user: { id: 'u1', email: 'me@vet.com', app_metadata: {} } };
    window.location.hash = '#/home';
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    expect(screen.queryByText('LANDING PAGE')).toBeNull();
    expect(entryGridProps.current?.onGoHome).toBeUndefined();
  });
});

describe('app lock on launch', () => {
  it('opened with a session from a previous run: asks the lock to check on launch', async () => {
    flags.session = { user: { id: 'u1', email: 'me@vet.com', app_metadata: {} } };
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    expect(lockProps.current?.lockOnLaunch).toBe(true);
  });

  it('signing in during this run: no launch lock', async () => {
    render(<App />);
    expect(await screen.findByText('APP LOGIN')).toBeInTheDocument();
    act(() => authCallback()('SIGNED_IN', { user: { id: 'u1', email: 'me@vet.com' } }));
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    expect(lockProps.current?.lockOnLaunch).toBe(false);
  });

  it('signing out and back in during this run: no launch lock', async () => {
    flags.session = { user: { id: 'u1', email: 'me@vet.com', app_metadata: {} } };
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    markExplicitSignOut();
    act(() => authCallback()('SIGNED_OUT', null));
    expect(await screen.findByText('APP LOGIN')).toBeInTheDocument();
    act(() => authCallback()('SIGNED_IN', { user: { id: 'u1', email: 'me@vet.com' } }));
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    expect(lockProps.current?.lockOnLaunch).toBe(false);
  });
});

describe('offline launch in the app', () => {
  it('expired access token + no network: stays signed in on the stored session', async () => {
    store.set('sb-test-auth-token', JSON.stringify({
      access_token: 'old', refresh_token: 'r1', expires_at: 1, user: { id: 'u1', email: 'me@vet.com' },
    }));
    flags.error = new AuthRetryableFetchError('Failed to fetch', 0);
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    expect(screen.queryByText('APP LOGIN')).toBeNull();
  });

  it('auth-js reports INITIAL_SESSION(null) before getSession resolves: the billing cache survives', async () => {
    // auth-js 2.110.x: the initial refresh fails offline and
    // _emitInitialSession emits INITIAL_SESSION with no session, ahead of
    // getSession() settling with the same retryable error.
    store.set('sb-test-auth-token', JSON.stringify({
      access_token: 'old', refresh_token: 'r1', expires_at: 1, user: { id: 'u1', email: 'me@vet.com' },
    }));
    saveBillingCache(cachedInfo, Date.now(), 'u1');
    let settle!: () => void;
    auth.getSession.mockImplementationOnce(() => new Promise((resolve) => {
      settle = () => resolve({ data: { session: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    }));
    render(<App />);
    act(() => authCallback()('INITIAL_SESSION', null));
    await act(async () => { settle(); });
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    expect(readBillingCache(Date.now(), 'u1')).toEqual(cachedInfo);
  });

  it('offline with no stored session: the login', async () => {
    flags.error = new AuthRetryableFetchError('Failed to fetch', 0);
    render(<App />);
    expect(await screen.findByText('APP LOGIN')).toBeInTheDocument();
  });
});

describe('billing cache hygiene in the app', () => {
  it('a different account signing in clears the previous account\'s billing cache', async () => {
    flags.session = { user: { id: 'user-a', email: 'a@vet.com', app_metadata: {} } };
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    saveBillingCache(cachedInfo, Date.now(), 'user-a');
    act(() => authCallback()('SIGNED_IN', { user: { id: 'user-b', email: 'b@vet.com' } }));
    expect(readBillingCache(Date.now(), 'user-a')).toBeNull();
  });

  it('launching with no session clears a leftover billing cache', async () => {
    saveBillingCache(cachedInfo, Date.now(), 'u1');
    render(<App />);
    act(() => authCallback()('INITIAL_SESSION', null));
    expect(await screen.findByText('APP LOGIN')).toBeInTheDocument();
    expect(readBillingCache(Date.now(), 'u1')).toBeNull();
  });

  it('a deliberate sign-out clears the billing cache', async () => {
    flags.session = { user: { id: 'user-a', email: 'a@vet.com', app_metadata: {} } };
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    saveBillingCache(cachedInfo, Date.now(), 'user-a');
    markExplicitSignOut();
    act(() => authCallback()('SIGNED_OUT', null));
    expect(readBillingCache(Date.now(), 'user-a')).toBeNull();
    expect(await screen.findByText('APP LOGIN')).toBeInTheDocument();
  });
});

describe('App routing on the web (unchanged)', () => {
  beforeEach(() => {
    flags.native = false;
  });

  it('signed out: the landing page', async () => {
    render(<App />);
    expect(await screen.findByText('LANDING PAGE')).toBeInTheDocument();
  });

  it('INITIAL_SESSION(null) still signs out and clears the billing cache, as before', async () => {
    saveBillingCache(cachedInfo, Date.now(), 'u1');
    render(<App />);
    expect(await screen.findByText('LANDING PAGE')).toBeInTheDocument();
    act(() => authCallback()('INITIAL_SESSION', null));
    expect(readBillingCache(Date.now(), 'u1')).toBeNull();
  });

  it('signed in: the chart with a homepage action', async () => {
    flags.session = { user: { id: 'u1', email: 'me@vet.com', app_metadata: {} } };
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    expect(entryGridProps.current?.onGoHome).toEqual(expect.any(Function));
  });
});
