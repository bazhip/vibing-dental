import { renderHook, waitFor } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import { dicomAllowed } from './useProfile';

let status = 'comped';
let plan = 'pro';
let role: string | undefined;
let practiceId: string | null = 'p1';
vi.mock('../utils/supabaseClient', () => {
  const query = (table: string) => ({
    select: (cols: string) => {
      const chain = {
        eq: () => chain,
        maybeSingle: async () => {
          if (table === 'profiles') {
            return { data: { practice_name: 'P', doctor_name: 'D', logo_path: '', practice_id: practiceId }, error: null };
          }
          if (cols.includes('subscription_status')) return { data: { plan, subscription_status: status, logo_path: '', name: 'P' }, error: null };
          return { data: {}, error: null };
        },
      };
      return chain;
    },
  });
  return {
    cloudEnabled: true,
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', app_metadata: role ? { role } : {} } } } }) },
      from: query,
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    },
  };
});
vi.mock('./useTeam', () => ({ call: vi.fn() }));
import { useProfile } from './useProfile';

beforeEach(() => {
  status = 'comped';
  plan = 'pro';
  role = undefined;
  practiceId = 'p1';
});

test('dicomAllowed: paid plans and admins', () => {
  expect(dicomAllowed({ plan: 'free', admin: false })).toBe(false);
  expect(dicomAllowed({ plan: 'basic', admin: false })).toBe(true);
  expect(dicomAllowed({ plan: 'pro', admin: false })).toBe(true);
  expect(dicomAllowed({ plan: 'free', admin: true })).toBe(true);
});

test('a comped practice gets DICOM', async () => {
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await waitFor(() => expect(result.current.dicomEnabled).toBe(true));
});

test('a lapsed practice does not', async () => {
  status = 'canceled';
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.plan).toBe('free');
  expect(result.current.dicomEnabled).toBe(false);
});

test('an app admin gets DICOM even with no practice', async () => {
  role = 'admin';
  practiceId = null;
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.dicomEnabled).toBe(true));
});
