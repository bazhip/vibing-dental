import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const update = vi.hoisted(() => vi.fn());
const stored = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('../utils/supabaseClient', () => {
  const eq = (result: unknown) => ({ eq: () => ({ maybeSingle: async () => result }) });
  return {
    cloudEnabled: true,
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: () => ({
        select: () => eq({ data: { pims_field_map: stored.value }, error: null }),
        update: (patch: unknown) => ({ eq: async () => { update(patch); return { error: null }; } }),
      }),
    },
  };
});

import { usePimsFieldMap } from './usePimsFieldMap';

beforeEach(() => { update.mockReset(); stored.value = null; });

describe('usePimsFieldMap', () => {
  it('defaults then saves the merged saved map, not the effective one', async () => {
    const { result } = renderHook(() => usePimsFieldMap());
    expect(result.current.map.chart).toBe('Discharge Summary');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); // session read
    await act(async () => { await result.current.save({ chart: null }); });
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: { chart: null } });
    expect(result.current.map.chart).toBeNull();
    await act(async () => { await result.current.save({ treatment: 'Plan' }); });
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: { chart: null, treatment: 'Plan' } });
  });

  it('loads a saved map over the defaults', async () => {
    stored.value = { chart: 'Notes' };
    const { result } = renderHook(() => usePimsFieldMap());
    await waitFor(() => expect(result.current.map.chart).toBe('Notes'));
  });

  it('reset clears saved map', async () => {
    stored.value = { chart: 'Notes' };
    const { result } = renderHook(() => usePimsFieldMap());
    await waitFor(() => expect(result.current.map.chart).toBe('Notes'));
    await act(async () => { await result.current.reset(); });
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: null });
    expect(result.current.map.chart).toBe('Discharge Summary');
  });
});
