import { vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock('../../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));

import { signInWithProvider } from './oauth';
import { LocalizedError } from '../../utils/apiErrors';

const REDIRECT = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/auth';
const identity = { getRedirectURL: vi.fn(() => REDIRECT), launchWebAuthFlow: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' }, error: null });
  auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
  vi.stubGlobal('chrome', { identity });
});
afterEach(() => vi.unstubAllGlobals());

describe('signInWithProvider', () => {
  it('exchanges the code from the returned URL', async () => {
    identity.launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?code=abc123`);
    await signInWithProvider('google');
    expect(identity.getRedirectURL).toHaveBeenCalledWith('auth');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect(identity.launchWebAuthFlow).toHaveBeenCalledWith({
      url: 'https://project.supabase.co/auth/v1/authorize?provider=google',
      interactive: true,
    });
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
  });

  it('cancelled OAuth stays on sign-in', async () => {
    for (const message of ['The user did not approve access.', 'User cancelled the sign-in.', 'canceled']) {
      identity.launchWebAuthFlow.mockRejectedValueOnce(new Error(message));
      await expect(signInWithProvider('apple')).resolves.toBeUndefined();
    }
    // Declined on the provider's consent page.
    identity.launchWebAuthFlow.mockResolvedValueOnce(`${REDIRECT}?error=access_denied&error_description=declined`);
    await expect(signInWithProvider('google')).resolves.toBeUndefined();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('other window failures are errors, even if they mention cancelling', async () => {
    for (const message of ['Authorization page could not be loaded.', 'Request to the provider was cancelled by the server']) {
      identity.launchWebAuthFlow.mockRejectedValueOnce(new Error(message));
      await expect(signInWithProvider('google')).rejects.toBeInstanceOf(LocalizedError);
    }
  });

  it('a provider error in the returned URL fails with a translated message', async () => {
    identity.launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?error=server_error&error_description=boom`);
    await expect(signInWithProvider('google')).rejects.toBeInstanceOf(LocalizedError);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('a URL that is not our redirect is never exchanged', async () => {
    identity.launchWebAuthFlow.mockResolvedValue('https://evil.example/auth?code=abc123');
    await expect(signInWithProvider('google')).rejects.toBeInstanceOf(LocalizedError);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('a failed exchange fails with a translated message', async () => {
    identity.launchWebAuthFlow.mockResolvedValue(`${REDIRECT}?code=abc123`);
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: new Error('invalid flow state') });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(signInWithProvider('google')).rejects.toBeInstanceOf(LocalizedError);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Supabase refusing to start throws its error', async () => {
    const error = new Error('Unsupported provider');
    auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error });
    await expect(signInWithProvider('apple')).rejects.toBe(error);
    expect(identity.launchWebAuthFlow).not.toHaveBeenCalled();
  });
});
