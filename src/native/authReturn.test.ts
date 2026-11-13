import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ data: { url: 'https://auth.example/authorize' }, error: null as null | Error })),
  exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null })),
  setSession: vi.fn(async () => ({ data: {}, error: null })),
}));
const browser = vi.hoisted(() => ({
  open: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
}));
const app = vi.hoisted(() => ({
  addListener: vi.fn(async () => ({ remove: vi.fn() })),
  getLaunchUrl: vi.fn(async () => undefined as undefined | { url: string }),
}));

const dialogs = vi.hoisted(() => ({ toastWhenReady: vi.fn() }));

function mockNative(native: boolean) {
  vi.doMock('../components/ui/dialogs', () => dialogs);
  vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native } }));
  vi.doMock('../utils/supabaseClient', () => ({ supabase: { auth }, cloudEnabled: true }));
  vi.doMock('@capacitor/browser', () => ({ Browser: browser }));
  vi.doMock('@capacitor/app', () => ({ App: app }));
}

const load = () => import('./authReturn');
const here = () => window.location.origin + window.location.pathname;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('authRedirectUrl / emailLinkOrigin', () => {
  it('web: back to this page', async () => {
    mockNative(false);
    const { authRedirectUrl, emailLinkOrigin } = await load();
    expect(authRedirectUrl()).toBe(here());
    expect(emailLinkOrigin()).toBe(here());
  });

  it('app: auth returns to the app, email links go to the website', async () => {
    mockNative(true);
    const { authRedirectUrl, emailLinkOrigin } = await load();
    expect(authRedirectUrl()).toBe('toothops://auth-callback');
    expect(emailLinkOrigin()).toBe('https://toothops.app/');
    expect(emailLinkOrigin()).not.toMatch(/capacitor:|localhost/);
  });
});

describe('startOAuth', () => {
  it('web: plain Supabase redirect back to this page', async () => {
    mockNative(false);
    const { startOAuth } = await load();
    await startOAuth('google');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: here() } });
    expect(browser.open).not.toHaveBeenCalled();
  });

  it('app: opens the provider URL in the system browser, returning to the app', async () => {
    mockNative(true);
    const { startOAuth } = await load();
    await startOAuth('google');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'toothops://auth-callback', skipBrowserRedirect: true },
    });
    expect(browser.open).toHaveBeenCalledWith({ url: 'https://auth.example/authorize' });
  });

  it('throws when Supabase refuses to start', async () => {
    mockNative(true);
    auth.signInWithOAuth.mockResolvedValueOnce({ data: { url: '' }, error: new Error('provider is not enabled') });
    const { startOAuth } = await load();
    await expect(startOAuth('google')).rejects.toThrow('provider is not enabled');
    expect(browser.open).not.toHaveBeenCalled();
  });
});

describe('handleAuthUrl failures are shown', () => {
  const failed = "Sign-in didn't complete. Please try again.";

  it('?error= from the provider: tells the user and exchanges nothing', async () => {
    mockNative(true);
    const { handleAuthUrl } = await load();
    await handleAuthUrl('toothops://auth-callback?error=access_denied&error_description=User%20cancelled');
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(dialogs.toastWhenReady).toHaveBeenCalledWith(failed, { kind: 'error' });
  });

  it('error_description alone also counts as a failure', async () => {
    mockNative(true);
    const { handleAuthUrl } = await load();
    await handleAuthUrl('toothops://auth-callback?error_description=Email%20link%20is%20invalid');
    expect(dialogs.toastWhenReady).toHaveBeenCalledWith(failed, { kind: 'error' });
  });

  it('errors in the hash (implicit-style returns) are shown too', async () => {
    mockNative(true);
    const { handleAuthUrl } = await load();
    await handleAuthUrl('toothops://auth-callback#error=server_error&error_description=x');
    expect(dialogs.toastWhenReady).toHaveBeenCalledWith(failed, { kind: 'error' });
  });

  it('a failed code exchange: tells the user', async () => {
    mockNative(true);
    auth.exchangeCodeForSession.mockResolvedValueOnce({ data: {}, error: new Error('PKCE code verifier not found') } as never);
    const { handleAuthUrl } = await load();
    await handleAuthUrl('toothops://auth-callback?code=bad');
    expect(dialogs.toastWhenReady).toHaveBeenCalledWith(failed, { kind: 'error' });
  });

  it('a successful exchange: no message', async () => {
    mockNative(true);
    const { handleAuthUrl } = await load();
    await handleAuthUrl('toothops://auth-callback?code=good');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('good');
    expect(dialogs.toastWhenReady).not.toHaveBeenCalled();
  });
});

describe('handleAuthUrl', () => {
  it('exchanges a PKCE code from the app callback', async () => {
    mockNative(true);
    const { handleAuthUrl } = await load();
    await expect(handleAuthUrl('toothops://auth-callback?code=abc')).resolves.toBe(true);
    expect(browser.close).toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('never signs in from hash tokens (an unsolicited link must not swap the account)', async () => {
    mockNative(true);
    const { handleAuthUrl } = await load();
    await expect(handleAuthUrl('toothops://auth-callback#access_token=at&refresh_token=rt&type=magiclink')).resolves.toBe(true);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('still returns true when the browser was not open', async () => {
    mockNative(true);
    browser.close.mockRejectedValueOnce(new Error('no browser'));
    const { handleAuthUrl } = await load();
    await expect(handleAuthUrl('toothops://auth-callback?code=xyz')).resolves.toBe(true);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('xyz');
  });

  it('exchanges a code only once when the launch URL and appUrlOpen both report it', async () => {
    mockNative(true);
    const { handleAuthUrl } = await load();
    await handleAuthUrl('toothops://auth-callback?code=once');
    await handleAuthUrl('toothops://auth-callback?code=once');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('ignores other URLs', async () => {
    mockNative(true);
    const { handleAuthUrl } = await load();
    await expect(handleAuthUrl('https://other')).resolves.toBe(false);
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
  });
});

describe('initAuthReturn', () => {
  it('cold start: signs in from the launch URL', async () => {
    mockNative(true);
    app.getLaunchUrl.mockResolvedValueOnce({ url: 'toothops://auth-callback?code=cold' });
    const { initAuthReturn } = await load();
    initAuthReturn();
    await vi.waitFor(() => expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('cold'));
  });

  it('warm start: signs in from appUrlOpen', async () => {
    mockNative(true);
    const { initAuthReturn } = await load();
    initAuthReturn();
    expect(app.addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));
    const listener = (app.addListener.mock.calls[0] as unknown as [string, (e: { url: string }) => void])[1];
    listener({ url: 'toothops://auth-callback?code=warm' });
    await vi.waitFor(() => expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('warm'));
  });

  it('does nothing on the web', async () => {
    mockNative(false);
    const { initAuthReturn } = await load();
    initAuthReturn();
    expect(app.addListener).not.toHaveBeenCalled();
    expect(app.getLaunchUrl).not.toHaveBeenCalled();
  });
});
