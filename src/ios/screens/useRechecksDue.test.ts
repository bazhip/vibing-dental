import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { fakeLibrary, meta } from './testHarness';
import { useRechecksDue } from './useRechecksDue';
import type { AppLibrary } from '../appData';

const TODAY = '2026-11-13';
const ROWS = [
  meta({ id: 'a1', patient_name: 'Bella', patient_number: '11', recall_date: '2026-11-01' }), // overdue
  meta({ id: 'b1', patient_name: 'Max', patient_number: '22', recall_date: TODAY }), // due today
  // One patient, two visits with rechecks: counts once.
  meta({ id: 'c1', patient_name: 'Coco', patient_number: '33', recall_date: TODAY }),
  meta({ id: 'c2', patient_name: 'Coco', patient_number: '33', recall_date: '2026-11-05' }),
  meta({ id: 'd1', patient_name: 'Dot', patient_number: '44', recall_date: '2026-11-14' }), // later: not counted
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 13, 9, 0, 0));
});
afterEach(() => vi.useRealTimers());

describe('useRechecksDue (Rechecks tab badge)', () => {
  it('counts patients Overdue + Due today', async () => {
    const { result } = renderHook(() => useRechecksDue(fakeLibrary(ROWS, TODAY)));
    await waitFor(() => expect(result.current).toBe(3));
  });

  it('is 0 with nothing due, and without saved charts', async () => {
    const lib = fakeLibrary([ROWS[4]], TODAY);
    const { result } = renderHook(() => useRechecksDue(lib));
    await waitFor(() => expect(lib.listCharts).toHaveBeenCalled());
    expect(result.current).toBe(0);
    expect(renderHook(() => useRechecksDue(null)).result.current).toBe(0);
  });

  it('refreshes when libraryVersion changes', async () => {
    const rows = [...ROWS];
    const lib = fakeLibrary(rows, TODAY);
    const { result, rerender } = renderHook(({ l }: { l: AppLibrary }) => useRechecksDue(l), { initialProps: { l: lib } });
    await waitFor(() => expect(result.current).toBe(3));
    rows.splice(0, 2); // Bella and Max cleared
    rerender({ l: { ...lib, libraryVersion: 1 } });
    await waitFor(() => expect(result.current).toBe(1));
  });
});
