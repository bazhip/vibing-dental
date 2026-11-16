import { vi } from 'vitest';

const platform = vi.hoisted(() => ({ isNativeApp: vi.fn(() => false), isExtensionPage: vi.fn(() => false) }));
vi.mock('../native/platform', () => ({ isNativeApp: platform.isNativeApp }));
vi.mock('./extensionPage', () => ({ isExtensionPage: platform.isExtensionPage }));
const createClient = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

async function load() {
  vi.resetModules();
  return import('./supabaseClient');
}

beforeEach(() => {
  createClient.mockClear();
  platform.isNativeApp.mockReturnValue(false);
  platform.isExtensionPage.mockReturnValue(false);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon');
});
afterEach(() => vi.unstubAllEnvs());

describe('supabaseClient', () => {
  it('the web client keeps the default options', async () => {
    await load();
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'anon');
  });

  it('extension pages use PKCE without reading the URL', async () => {
    platform.isExtensionPage.mockReturnValue(true);
    await load();
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'anon', {
      auth: { flowType: 'pkce', detectSessionInUrl: false },
    });
  });

  it('the app uses PKCE too', async () => {
    platform.isNativeApp.mockReturnValue(true);
    await load();
    expect(createClient).toHaveBeenCalledWith('https://project.supabase.co', 'anon', {
      auth: { flowType: 'pkce', detectSessionInUrl: false },
    });
  });

  it('no client without the env', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const m = await load();
    expect(m.supabase).toBeNull();
    expect(m.cloudEnabled).toBe(false);
  });
});
