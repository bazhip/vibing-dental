import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const flags = vi.hoisted(() => ({ native: true, session: null as null | { user: { id: string; email: string; app_metadata: object } } }));
const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: flags.session } })),
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

describe('billing cache hygiene in the app', () => {
  it('a different account signing in clears the previous account\'s billing cache', async () => {
    flags.session = { user: { id: 'user-a', email: 'a@vet.com', app_metadata: {} } };
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    saveBillingCache(cachedInfo, Date.now(), 'user-a');
    act(() => authCallback()('SIGNED_IN', { user: { id: 'user-b', email: 'b@vet.com' } }));
    expect(readBillingCache(Date.now(), 'user-a')).toBeNull();
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

  it('signed in: the chart with a homepage action', async () => {
    flags.session = { user: { id: 'u1', email: 'me@vet.com', app_metadata: {} } };
    render(<App />);
    expect(await screen.findByText('CHART')).toBeInTheDocument();
    expect(entryGridProps.current?.onGoHome).toEqual(expect.any(Function));
  });
});
