import { vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

type AuthListener = (event: string, session: unknown) => void;
const fake = vi.hoisted(() => {
  const state: { listener: ((event: string, session: unknown) => void) | null; prefs: unknown } = { listener: null, prefs: null };
  const auth = {
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      state.listener = cb;
      return { data: { subscription: { unsubscribe: () => { state.listener = null; } } } };
    }),
  };
  const maybeSingle = vi.fn(async () => ({ data: { chart_prefs: state.prefs }, error: null }));
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
  const client = { auth, from };
  return { state, auth, from, client, current: client as unknown };
});
vi.mock('../../utils/supabaseClient', () => ({
  get supabase() { return fake.current; },
  get cloudEnabled() { return fake.current !== null; },
}));

import i18n from '../../i18n';
import { SidePanelApp } from './SidePanelApp';

const session = { user: { id: 'u1', email: 'vet@clinic.test' } };
const emit = (event: string, s: unknown) => act(() => (fake.state.listener as AuthListener)(event, s));
const tabs = { create: vi.fn() };
const identity = { getRedirectURL: vi.fn(() => 'https://id.chromiumapp.org/auth'), launchWebAuthFlow: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  fake.current = fake.client;
  fake.state.prefs = null;
  vi.stubGlobal('chrome', { tabs, identity });
});
afterEach(async () => {
  cleanup();
  vi.unstubAllEnvs();
  delete (navigator as { languages?: unknown }).languages;
  vi.unstubAllGlobals();
  await i18n.changeLanguage('en');
});

async function signedOut() {
  render(<SidePanelApp />);
  await emit('INITIAL_SESSION', null);
  return screen.getByRole('button', { name: 'Sign in' });
}

function fillIn(password = 'secret') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' vet@clinic.test ' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
}

describe('side panel sign-in', () => {
  it('password sign-in calls signInWithPassword and shows the signed-in header', async () => {
    fake.auth.signInWithPassword.mockImplementation(async () => {
      fake.state.listener?.('SIGNED_IN', session);
      return { data: { session }, error: null };
    });
    const submit = await signedOut();
    fillIn();
    fireEvent.click(submit);
    await screen.findByText('Signed in as vet@clinic.test');
    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'vet@clinic.test', password: 'secret' });
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('a bad password shows a translated error', async () => {
    fake.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials', status: 400 }),
    });
    // Signed out, the panel follows the browser language.
    Object.defineProperty(navigator, 'languages', { value: ['fr-FR'], configurable: true });
    render(<SidePanelApp />);
    await emit('INITIAL_SESSION', null);
    await waitFor(() => expect(i18n.language).toBe('fr'));
    fireEvent.change(screen.getByLabelText(i18n.t('auth:login.email')), { target: { value: 'vet@clinic.test' } });
    fireEvent.change(screen.getByLabelText(i18n.t('pims:panel.signIn.password')), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: i18n.t('pims:panel.signIn.submit') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('auth:errors.invalidCredentials'));
    expect(i18n.t('auth:errors.invalidCredentials')).not.toBe('Incorrect email or password.');
    expect(screen.getByLabelText(i18n.t('pims:panel.signIn.password'))).toHaveValue('');
  });

  it('expired session returns to sign-in', async () => {
    render(<SidePanelApp />);
    await emit('INITIAL_SESSION', session);
    expect(screen.getByText('Signed in as vet@clinic.test')).toBeInTheDocument();
    // supabase-js reports a refresh that failed as SIGNED_OUT; a refresh without a session too.
    await emit('TOKEN_REFRESHED', null);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    await emit('SIGNED_IN', session);
    await emit('SIGNED_OUT', null);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Signed in as vet@clinic.test')).toBeNull();
  });

  it('sign out ends only the panel session', async () => {
    render(<SidePanelApp />);
    await emit('INITIAL_SESSION', session);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(fake.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('cancelled OAuth stays on sign-in', async () => {
    fake.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://project.supabase.co/authorize' }, error: null });
    identity.launchWebAuthFlow.mockRejectedValue(new Error('The user did not approve access.'));
    await signedOut();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(identity.launchWebAuthFlow).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(fake.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('Apple sign-in goes through the same flow', async () => {
    vi.stubEnv('VITE_APPLE_SIGNIN_WEB', 'true');
    fake.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://project.supabase.co/authorize' }, error: null });
    identity.launchWebAuthFlow.mockRejectedValue(new Error('The user did not approve access.'));
    await signedOut();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Apple' }));
    await waitFor(() => expect(fake.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'apple' })));
  });

  it('Apple is hidden unless the build enables it, as on the website', async () => {
    vi.stubEnv('VITE_APPLE_SIGNIN_WEB', '');
    await signedOut();
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('create an account and forgot password open toothops.app in a new tab', async () => {
    await signedOut();
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(tabs.create).toHaveBeenCalledTimes(2);
    expect(tabs.create).toHaveBeenCalledWith({ url: 'https://toothops.app/' });
  });

  it('without a Supabase project the panel says it is not connected', () => {
    fake.current = null;
    render(<SidePanelApp />);
    expect(screen.getByText('This build isn’t connected to ToothOps.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  it('signed in, the account language applies', async () => {
    fake.state.prefs = { language: 'de' };
    render(<SidePanelApp />);
    await emit('INITIAL_SESSION', session);
    await waitFor(() => expect(i18n.language).toBe('de'));
    expect(fake.from).toHaveBeenCalledWith('profiles');
  });
});
