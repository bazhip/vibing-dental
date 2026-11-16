import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

const update = vi.hoisted(() => vi.fn());
const stored = vi.hoisted(() => ({ value: null as unknown, hang: false }));
vi.mock('../utils/supabaseClient', () => {
  const eq = (result: () => unknown) => ({
    eq: () => ({ maybeSingle: () => (stored.hang ? new Promise(() => {}) : Promise.resolve(result())) }),
  });
  return {
    cloudEnabled: true,
    supabase: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
      from: () => ({
        select: () => eq(() => ({ data: { pims_field_map: stored.value }, error: null })),
        update: (patch: unknown) => ({ eq: async () => { update(patch); return { error: null }; } }),
      }),
    },
  };
});

import { LOAD_WAIT_MS, usePimsFieldMap } from './usePimsFieldMap';

beforeEach(() => { update.mockReset(); stored.value = null; stored.hang = false; });
afterEach(() => { vi.useRealTimers(); });

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

  it('a save made before the stored map loads merges into it', async () => {
    stored.value = { chart: 'Notes' };
    const { result } = renderHook(() => usePimsFieldMap());
    // Called immediately, while the session and profile reads are still pending.
    await act(async () => { await result.current.save({ treatment: 'Assessment' }); });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: { chart: 'Notes', treatment: 'Assessment' } });
    expect(result.current.map).toMatchObject({ chart: 'Notes', treatment: 'Assessment' });
  });

  it('keeps the edited-note destination and drops unknown keys', async () => {
    stored.value = { editedNote: 'Assessment', bogus: 'x', chart: 3 };
    const { result } = renderHook(() => usePimsFieldMap());
    await waitFor(() => expect(result.current.map.editedNote).toBe('Assessment'));
    expect(result.current.map.chart).toBe('Discharge Summary');
    await act(async () => { await result.current.save({ editedNote: null }); });
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: { editedNote: null } });
  });

  it('a hung load does not block a save for more than the wait limit', async () => {
    vi.useFakeTimers();
    stored.hang = true;
    const { result } = renderHook(() => usePimsFieldMap());
    let done = false;
    let saving!: Promise<void>;
    act(() => { saving = result.current.save({ chart: null }).then(() => { done = true; }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(LOAD_WAIT_MS - 1); });
    expect(done).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); await saving; });
    expect(done).toBe(true);
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: { chart: null } });
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
