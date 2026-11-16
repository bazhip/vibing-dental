import { vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const t = vi.hoisted(() => ({ inspect: vi.fn() }));
vi.mock('./internalTransport', () => ({ internalTransport: { inspect: t.inspect } }));

import { useConsultInspect } from './useConsultInspect';

const result = { tab: { id: 1, title: 'C' }, candidates: 1, status: null, fields: [] };

beforeEach(() => { t.inspect.mockReset(); t.inspect.mockResolvedValue(result); });

describe('useConsultInspect', () => {
  it('inspects on mount, on window focus and when the panel becomes visible', async () => {
    renderHook(() => useConsultInspect(true));
    await waitFor(() => expect(t.inspect).toHaveBeenCalledTimes(1));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(t.inspect).toHaveBeenCalledTimes(2));
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(t.inspect).toHaveBeenCalledTimes(3));
  });

  it('does nothing while disabled', async () => {
    renderHook(() => useConsultInspect(false));
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await new Promise((r) => setTimeout(r, 350));
    expect(t.inspect).not.toHaveBeenCalled();
  });
});
