import { renderHook, waitFor, act } from '@testing-library/react';
import { vi, beforeEach } from 'vitest';
import { defaultConfig } from '../utils/ownerReportConfig';

// Supabase double: each select(cols) on a table resolves via `respond`.
let respond: (table: string, cols: string) => { data: unknown; error: { message: string } | null };
const teamCall = vi.fn();
vi.mock('../utils/supabaseClient', () => {
  const query = (table: string) => ({
    select: (cols: string) => {
      const chain = {
        eq: () => chain,
        maybeSingle: async () => respond(table, cols),
      };
      return chain;
    },
  });
  return {
    cloudEnabled: true,
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: query,
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }) }) },
    },
  };
});
vi.mock('./useTeam', () => ({ call: (...a: unknown[]) => teamCall(...a) }));
import { useProfile } from './useProfile';

const saved = { templates: [{ id: 't1', name: 'Mine', sections: [] }], defaultTemplateId: 't1' };
const base = (table: string, cols: string) => {
  if (table === 'profiles') return { data: { practice_name: 'P', doctor_name: 'D', logo_path: '', practice_id: 'p1' }, error: null };
  if (cols.includes('owner_report_config')) return { data: { owner_report_config: saved, owner_report_config_rev: 4 }, error: null };
  return { data: {}, error: null };
};
beforeEach(() => { teamCall.mockReset(); respond = base; });

test('a failed templates load blocks saving (the default shown must never replace the real templates)', async () => {
  respond = (table, cols) => (cols.includes('owner_report_config') ? { data: null, error: { message: 'timeout' } } : base(table, cols));
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.ownerReportConfigLoadFailed).toBe(true);
  await expect(result.current.saveOwnerReportConfig(defaultConfig())).rejects.toThrow(/didn’t load/);
  expect(teamCall).not.toHaveBeenCalled();
});

test('saves send the version they loaded and pick up the new one', async () => {
  teamCall.mockResolvedValueOnce({ ok: true, rev: 5 }).mockResolvedValueOnce({ ok: true, rev: 6 });
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.ownerReportConfigLoadFailed).toBe(false);
  await act(() => result.current.saveOwnerReportConfig(defaultConfig()));
  expect(teamCall.mock.calls[0][0]).toMatchObject({ action: 'set_owner_report_config', expectedRev: 4 });
  await act(() => result.current.saveOwnerReportConfig(defaultConfig()));
  expect(teamCall.mock.calls[1][0]).toMatchObject({ expectedRev: 5 });
});

test('a stale save (templates changed elsewhere) is refused, not swallowed', async () => {
  teamCall.mockRejectedValueOnce(new Error('These templates were changed on another device or tab since you opened them.'));
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  await expect(result.current.saveOwnerReportConfig(defaultConfig())).rejects.toThrow(/changed on another device/);
});

test('before the version column exists, it still loads and saves (no version sent)', async () => {
  respond = (table, cols) => {
    if (cols.includes('owner_report_config_rev')) return { data: null, error: { message: 'column practices.owner_report_config_rev does not exist' } };
    if (cols.includes('owner_report_config')) return { data: { owner_report_config: saved }, error: null };
    return base(table, cols);
  };
  teamCall.mockResolvedValueOnce({ ok: true });
  const { result } = renderHook(() => useProfile());
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.ownerReportConfigLoadFailed).toBe(false);
  await act(() => result.current.saveOwnerReportConfig(defaultConfig()));
  expect(teamCall.mock.calls[0][0]).not.toHaveProperty('expectedRev');
});
