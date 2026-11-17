import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({ responses: new Map<string, Promise<unknown>>() }));
vi.mock('../utils/supabaseClient', () => ({ cloudEnabled: true, supabase: {
  from: () => ({ select: () => ({ in: (_key: string, ids: string[]) => ({ order: () => backend.responses.get(ids[0]) ?? Promise.resolve({ data: [], error: null }) }) }) }),
  storage: { from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://images.test/${path}` })) }) }) },
} }));
import { useAttachments } from './useAttachments';
const result = (id: string) => ({ data: [{ id: `image-${id}`, chart_id: id, path: `${id}/image.jpg`, caption: '', kind: 'photo', tooth_triadan: null, created_at: '2026-11-17T12:00:00Z' }], error: null });
beforeEach(() => backend.responses.clear());
it('clears image visibility immediately when switching between two chart ids', async () => {
  backend.responses.set('a', Promise.resolve(result('a')));
  let finishB!: (value: unknown) => void;
  backend.responses.set('b', new Promise(resolve => { finishB = resolve; }));
  const h = renderHook(({ id }) => useAttachments(id), { initialProps: { id: 'a' } });
  await waitFor(() => expect(h.result.current.items[0]?.id).toBe('image-a'));
  h.rerender({ id: 'b' });
  expect(h.result.current.items).toEqual([]);
  expect(h.result.current.loaded).toBe(false);
  await act(async () => finishB(result('b')));
  await waitFor(() => expect(h.result.current.items.map(image => image.chartId)).toEqual(['b']));
  h.rerender({ id: 'a' });
  expect(h.result.current.items).toEqual([]);
  await waitFor(() => expect(h.result.current.items.map(image => image.chartId)).toEqual(['a']));
});
it('ignores an old tab response that finishes after the new tab has loaded', async () => {
  let finishA!: (value: unknown) => void;
  backend.responses.set('a', new Promise(resolve => { finishA = resolve; }));
  backend.responses.set('b', Promise.resolve(result('b')));
  const h = renderHook(({ id }) => useAttachments(id), { initialProps: { id: 'a' } });
  h.rerender({ id: 'b' });
  await waitFor(() => expect(h.result.current.items[0]?.id).toBe('image-b'));
  await act(async () => finishA(result('a')));
  expect(h.result.current.items.map(image => image.chartId)).toEqual(['b']);
});
