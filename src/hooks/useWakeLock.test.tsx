import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

function fakeWakeLock() {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const s = { released: false, release: vi.fn(async () => { s.released = true; }), addEventListener: vi.fn() };
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { request, sentinels };
}

const setVisibility = (v: 'visible' | 'hidden') =>
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });

afterEach(() => {
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  setVisibility('visible');
});

describe('useWakeLock', () => {
  it('holds the screen on while active and lets go after', async () => {
    const { request, sentinels } = fakeWakeLock();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await act(async () => {});
    expect(request).toHaveBeenCalledWith('screen');
    rerender({ on: false });
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it('asks again when the page comes back (the browser drops it when hidden)', async () => {
    const { request, sentinels } = fakeWakeLock();
    renderHook(() => useWakeLock(true));
    await act(async () => {});
    sentinels[0].released = true; // what the browser does on hide
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    setVisibility('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does nothing when inactive or unsupported', async () => {
    const { request } = fakeWakeLock();
    renderHook(() => useWakeLock(false));
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
