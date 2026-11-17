import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useHashRoute, useHashRouteGuard } from './useHashRoute';

it('blocks all route subscribers from unmounting a dirty settings page until leave is approved', async () => {
  window.history.replaceState(null, '', '/#/settings');
  let answer!: (allowed: boolean) => void;
  const guard = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve; }));
  const app = renderHook(useHashRoute);
  const page = renderHook(() => useHashRouteGuard(guard, true));
  act(() => { window.history.replaceState(null, '', '/#/home'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(window.location.hash).toBe('#/settings');
  expect(app.result.current.route.view).toBe('settings');
  await act(async () => answer(false));
  expect(app.result.current.route.view).toBe('settings');
  act(() => { window.history.replaceState(null, '', '/#/rechecks'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
  await act(async () => answer(true));
  await waitFor(() => expect(app.result.current.route.view).toBe('rechecks'));
  page.unmount(); app.unmount();
});

it('keeps the previous destination in history when browser Back is canceled', async () => {
  window.history.replaceState({ workspaceIndex: 0 }, '', '/#/chart');
  const app = renderHook(useHashRoute);
  act(() => app.result.current.navigate('#/settings'));
  const guard = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const page = renderHook(() => useHashRouteGuard(guard, true));
  act(() => window.history.back());
  await waitFor(() => expect(guard).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(window.location.hash).toBe('#/settings'));
  expect(app.result.current.route.view).toBe('settings');
  act(() => window.history.back());
  await waitFor(() => expect(guard).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(app.result.current.route.view).toBe('chart'));
  page.unmount(); app.unmount();
});

it('keeps every consumer on settings while an indexed destination awaits approval', async () => {
  window.history.replaceState({ workspaceIndex: 0 }, '', '/#/settings');
  let answer!: (allowed: boolean) => void;
  const guard = () => new Promise<boolean>((resolve) => { answer = resolve; });
  const app = renderHook(useHashRoute);
  const editor = renderHook(useHashRoute);
  const gate = renderHook(() => useHashRouteGuard(guard, true));
  act(() => editor.result.current.navigate('#/home'));
  expect(app.result.current.route.view).toBe('settings');
  expect(editor.result.current.route.view).toBe('settings');
  await act(async () => answer(true));
  await waitFor(() => expect(app.result.current.route.view).toBe('home'));
  expect(editor.result.current.route.view).toBe('home');
  gate.unmount(); editor.unmount(); app.unmount();
});

it('recognizes Rechecks as a workspace destination on arrival and navigation', () => {
  window.history.replaceState(null, '', '/#/rechecks');
  const app = renderHook(useHashRoute);
  expect(app.result.current.route.view).toBe('rechecks');
  act(() => app.result.current.navigate('#/library'));
  expect(app.result.current.route.view).toBe('library');
  act(() => app.result.current.navigate('#/rechecks'));
  expect(app.result.current.route.view).toBe('rechecks');
});
