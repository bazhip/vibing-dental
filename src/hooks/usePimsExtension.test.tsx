import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePimsExtension } from './usePimsExtension';

const bridge = vi.hoisted(() => ({ ping: vi.fn(), extensionAvailable: vi.fn() }));
vi.mock('../utils/pims/extensionBridge', () => bridge);
const handshake = { version: '1', protocol: 1, capabilities: ['inspect', 'send', 'diagnose'] };

beforeEach(() => {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', 'true');
  bridge.ping.mockReset().mockResolvedValue(handshake);
  bridge.extensionAvailable.mockReset().mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('does not ping for disabled practices or unavailable native/Chrome bridges', () => {
  const disabled = renderHook(() => usePimsExtension(false));
  expect(disabled.result.current).toBe(false);
  disabled.unmount();
  bridge.extensionAvailable.mockReturnValue(false);
  const native = renderHook(() => usePimsExtension(true));
  expect(native.result.current).toBe(false);
  expect(bridge.ping).not.toHaveBeenCalled();
});

it('does not ping before rollout even with an installed extension', () => {
  vi.stubEnv('VITE_PIMS_ROLLOUT_ENABLED', undefined);
  const { result } = renderHook(() => usePimsExtension(true));
  expect(result.current).toBe(false);
  expect(bridge.ping).not.toHaveBeenCalled();
});

it('refreshes on focus for installation and removal, hiding rejected probes', async () => {
  bridge.ping.mockResolvedValueOnce(null);
  const { result } = renderHook(() => usePimsExtension(true));
  await act(async () => {});
  expect(result.current).toBe(false);
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current).toBe(true));
  bridge.ping.mockRejectedValueOnce(new TypeError('Disconnected'));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current).toBe(false));
});

it('refreshes when visible, not when hidden', async () => {
  const { result } = renderHook(() => usePimsExtension(true));
  await waitFor(() => expect(result.current).toBe(true));
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(bridge.ping).toHaveBeenCalledTimes(1);
  visibility.mockReturnValue('visible');
  bridge.ping.mockResolvedValueOnce(null);
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitFor(() => expect(result.current).toBe(false));
});

it('discards late successful replies after a newer failed probe', async () => {
  let resolve!: (value: unknown) => void;
  bridge.ping.mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce(null);
  const { result } = renderHook(() => usePimsExtension(true));
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => resolve(handshake));
  expect(result.current).toBe(false);
});

it('discards prior eligibility replies and requires a fresh handshake when reenabled', async () => {
  let resolveOld!: (value: unknown) => void;
  let resolveNew!: (value: unknown) => void;
  bridge.ping.mockReturnValueOnce(new Promise((done) => { resolveOld = done; }))
    .mockReturnValueOnce(new Promise((done) => { resolveNew = done; }));
  const { result, rerender } = renderHook(({ enabled }) => usePimsExtension(enabled), { initialProps: { enabled: true } });
  rerender({ enabled: false });
  rerender({ enabled: true });
  await act(async () => resolveOld(handshake));
  expect(result.current).toBe(false);
  await act(async () => resolveNew(handshake));
  expect(result.current).toBe(true);
});

it('removes listeners on unmount and ignores pending responses', async () => {
  let resolve!: (value: unknown) => void;
  bridge.ping.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { unmount } = renderHook(() => usePimsExtension(true));
  unmount();
  await act(async () => resolve(handshake));
  act(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(bridge.ping).toHaveBeenCalledTimes(1);
});
