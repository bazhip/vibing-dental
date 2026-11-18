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
  it('does not reuse ezyVet defaults or saved choices for another provider', async () => {
    stored.value = { exam: 'Physical Exam', providers: { daysmart: { treatment: 'SOAP > Plan' } } };
    const { result, rerender } = renderHook(({ provider }) => usePimsFieldMap(provider), {
      initialProps: { provider: 'daysmart' as import('../extension/pims/types').PimsId },
    });
    await waitFor(() => expect(result.current.map.treatment).toBe('SOAP > Plan'));
    expect(result.current.map.exam).toBeNull();
    expect(result.current.map.chart).toBeNull();
    rerender({ provider: 'ezyvet' });
    expect(result.current.map.exam).toBe('Physical Exam');
    rerender({ provider: 'shepherd' });
    expect(Object.values(result.current.map).every((value) => value === null)).toBe(true);
  });

  it('saves and resets only the selected provider while preserving other maps', async () => {
    stored.value = { chart: 'Notes', providers: { daysmart: { exam: 'Objective' }, instinct: { treatment: 'Plan' } } };
    const { result, rerender } = renderHook(({ provider }) => usePimsFieldMap(provider), {
      initialProps: { provider: 'daysmart' as import('../extension/pims/types').PimsId },
    });
    await act(async () => { await result.current.save({ findings: 'Assessment' }); });
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: {
      chart: 'Notes', providers: { daysmart: { exam: 'Objective', findings: 'Assessment' }, instinct: { treatment: 'Plan' } },
    } });
    await act(async () => { await result.current.reset(); });
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: { chart: 'Notes', providers: { instinct: { treatment: 'Plan' } } } });
    rerender({ provider: 'ezyvet' });
    await act(async () => { await result.current.reset(); });
    expect(update).toHaveBeenLastCalledWith({ pims_field_map: { providers: { instinct: { treatment: 'Plan' } } } });
  });

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

it('updates detected clinical defaults on a field change while retaining saved skips and custom targets', async () => {
  stored.value = { gpVitals: null, ctReport: 'Specialist CT', providers: { rhapsody: { dischargeInstructions: null } } };
  const available = (titles: string[]) => titles.map(title => ({ title, kind: 'note' as const, acceptsImage: false }));
  const { result, rerender } = renderHook(({ provider, titles }) => usePimsFieldMap(provider, available(titles)), {
    initialProps: { provider: 'ezyvet' as import('../extension/pims/types').PimsId, titles: ['Physical Exam', 'History', 'Plan'] },
  });
  await waitFor(() => expect(result.current.map.ctReport).toBe('Specialist CT'));
  expect(result.current.map.gpVitals).toBeNull();
  expect(result.current.map.gpPhysicalExam).toBe('Physical Exam');
  rerender({ provider: 'rhapsody', titles: ['Medical notes', 'Discharge notes'] });
  expect(result.current.map.gpVitals).toBe('Medical notes');
  expect(result.current.map.dischargeInstructions).toBeNull();
  expect(result.current.map.dischargeMedications).toBe('Discharge notes');
  rerender({ provider: 'rhapsody', titles: ['Unrelated'] });
  expect(result.current.map.gpVitals).toBeNull();
  expect(result.current.map.ctReport).toBeNull();
});
