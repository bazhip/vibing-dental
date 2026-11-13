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
import { writeString } from './utils/storage';

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
