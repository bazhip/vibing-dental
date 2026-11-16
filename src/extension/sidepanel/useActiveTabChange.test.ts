import { vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { TAB_CHANGE_DEBOUNCE_MS, useActiveTabChange } from './useActiveTabChange';

type Updated = (id: number, info: { status?: string }, tab?: { url?: string }) => void;

const listeners = { activated: [] as (() => void)[], updated: [] as Updated[] };
const fakeTabs = {
  onActivated: { addListener: (f: () => void) => listeners.activated.push(f), removeListener: vi.fn() },
  onUpdated: { addListener: (f: Updated) => listeners.updated.push(f), removeListener: vi.fn() },
};

beforeEach(() => {
  vi.useFakeTimers();
  listeners.activated = [];
  listeners.updated = [];
  vi.stubGlobal('chrome', { tabs: fakeTabs });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const updated: Updated = (...a) => listeners.updated.forEach((f) => f(...a));

describe('useActiveTabChange', () => {
  it('debounces a burst of focus, visibility and tab events into one call', () => {
    const cb = vi.fn();
    renderHook(() => useActiveTabChange(cb));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    listeners.activated.forEach((f) => f());
    vi.advanceTimersByTime(TAB_CHANGE_DEBOUNCE_MS - 1);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a finished load counts only for the inspected ezyVet tab (or an ezyVet URL) once its id is known', () => {
    const cb = vi.fn();
    renderHook(() => useActiveTabChange(cb, 7));
    updated(3, { status: 'complete' });
    updated(3, { status: 'complete' }, { url: 'https://news.example/' });
    updated(7, { status: 'loading' });
    vi.advanceTimersByTime(TAB_CHANGE_DEBOUNCE_MS);
    expect(cb).not.toHaveBeenCalled();
    updated(7, { status: 'complete' });
    vi.advanceTimersByTime(TAB_CHANGE_DEBOUNCE_MS);
    expect(cb).toHaveBeenCalledTimes(1);
    updated(9, { status: 'complete' }, { url: 'https://clinic.ezyvet.com/?recordclass=Consult' });
    vi.advanceTimersByTime(TAB_CHANGE_DEBOUNCE_MS);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('with no inspected tab, a load with a non-ezyVet URL is ignored', () => {
    const cb = vi.fn();
    renderHook(() => useActiveTabChange(cb, null));
    updated(3, { status: 'complete' }, { url: 'https://news.example/' });
    vi.advanceTimersByTime(TAB_CHANGE_DEBOUNCE_MS);
    expect(cb).not.toHaveBeenCalled();
    updated(3, { status: 'complete' });
    vi.advanceTimersByTime(TAB_CHANGE_DEBOUNCE_MS);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a pending call is dropped on unmount', () => {
    const cb = vi.fn();
    const { unmount } = renderHook(() => useActiveTabChange(cb));
    window.dispatchEvent(new Event('focus'));
    unmount();
    vi.advanceTimersByTime(TAB_CHANGE_DEBOUNCE_MS);
    expect(cb).not.toHaveBeenCalled();
  });
});
