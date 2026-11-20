import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useProfile } from './useProfile';
import { cachePracticeLogo, loadPracticeLogoBytes } from '../utils/practiceLogoCache';

const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const png = () => new Blob([Uint8Array.from(atob(logo.split(',')[1]), byte => byte.charCodeAt(0))], { type: 'image/png' });
const db = vi.hoisted(() => ({
  user: 'vet-one',
  path: 'practice/logo.png',
  profilePath: '',
  profileGate: Promise.resolve(),
  settingsGate: Promise.resolve(),
  download: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../utils/supabaseClient', () => ({
  cloudEnabled: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: db.user } } } }) },
    from: (table: string) => ({
      select: (columns: string) => ({ eq: () => ({
        maybeSingle: async () => {
          if (table === 'profiles') {
            await db.profileGate;
            return { data: { practice_id: 'practice', doctor_name: 'Dr Ng', logo_path: db.profilePath }, error: null };
          }
          if (!columns.startsWith('logo_path')) await db.settingsGate;
          return { data: { logo_path: db.path, name: 'ToothOpsHQ' }, error: null };
        },
      }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    storage: { from: () => ({
      download: db.download,
      remove: db.remove,
      createSignedUrl: async () => ({ data: { signedUrl: 'https://test.invalid/logo' } }),
    }) },
  },
}));

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
  db.user = 'vet-one';
  db.path = 'practice/logo.png';
  db.profilePath = '';
  db.profileGate = Promise.resolve();
  db.settingsGate = Promise.resolve();
  db.download.mockReset().mockImplementation(async () => ({ data: png(), error: null }));
  db.remove.mockReset().mockResolvedValue({ error: null });
});

it('loads a cold logo while unrelated practice settings are still pending', async () => {
  db.settingsGate = new Promise(() => {});
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.logoUrl).toBe(logo));
  expect(result.current.loaded).toBe(false);
});

it('keeps document branding pending until the current logo is resolved', async () => {
  cachePracticeLogo(db.user, 'old-practice/logo.png', logo);
  let finishDownload!: (result: { data: Blob; error: null }) => void;
  db.download.mockImplementation(() => new Promise(resolve => { finishDownload = resolve; }));
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.brandingReady).toBe(false);
  expect(result.current.logoUrl).toBe('');
  await act(async () => finishDownload({ data: png(), error: null }));
  await waitFor(() => expect(result.current).toMatchObject({
    brandingReady: true, practiceName: 'ToothOpsHQ', doctorName: 'Dr Ng', logoUrl: logo,
  }));
});

it('completes document branding when the practice has no logo', async () => {
  db.path = '';
  db.profilePath = 'vet-one/logo.png';
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current).toMatchObject({
    brandingReady: true, practiceName: 'ToothOpsHQ', logoUrl: '',
  }));
  expect(db.download).not.toHaveBeenCalled();
});

it('shows the cached image before fetching the profile again, then clears a removed logo', async () => {
  const first = renderHook(() => useProfile());
  await waitFor(() => expect(first.result.current.logoUrl).toBe(logo));
  first.unmount();

  let release!: () => void;
  db.profileGate = new Promise<void>(resolve => { release = resolve; });
  db.path = '';
  const next = renderHook(() => useProfile());
  await waitFor(() => expect(next.result.current.logoUrl).toBe(logo));
  await act(async () => release());
  await waitFor(() => expect(next.result.current.logoUrl).toBe(''));
});

it('keeps the account cache on a disconnected launch with a valid session', async () => {
  cachePracticeLogo(db.user, 'practice/logo.png', logo);
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  try {
    db.profileGate = new Promise(() => {});
    const { result } = renderHook(() => useProfile());
    await waitFor(() => expect(result.current).toMatchObject({ brandingReady: true, logoUrl: logo }));
    expect(db.download).not.toHaveBeenCalled();
  } finally {
    online.mockRestore();
  }
});

it('never displays another account’s cached logo', async () => {
  const first = renderHook(() => useProfile());
  await waitFor(() => expect(first.result.current.logoUrl).toBe(logo));
  first.unmount();

  db.user = 'vet-two';
  db.path = '';
  const next = renderHook(() => useProfile());
  await waitFor(() => expect(next.result.current.loaded).toBe(true));
  expect(next.result.current.logoUrl).toBe('');
});

it('removing the logo also clears the image displayed on a later launch', async () => {
  const first = renderHook(() => useProfile());
  await waitFor(() => expect(first.result.current.logoUrl).toBe(logo));
  await act(() => first.result.current.removeLogo());
  expect(first.result.current.logoUrl).toBe('');
  first.unmount();

  db.profileGate = new Promise(() => {});
  const second = renderHook(() => useProfile());
  await act(async () => {});
  expect(second.result.current.logoUrl).toBe('');
});

it('can embed the cached logo in a PDF without a network request', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  try {
    expect(new Uint8Array((await loadPracticeLogoBytes(logo))!).slice(0, 4)).toEqual(Uint8Array.of(137, 80, 78, 71));
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});
