import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({
  insert: vi.fn(async (_row: unknown): Promise<{ error: { code: string; message: string } | null }> => ({ error: null })),
  upload: vi.fn(async () => ({ error: null })),
  update: vi.fn((_patch: unknown) => ({ eq: vi.fn(async () => ({ error: null })) })),
}));
vi.mock('../utils/supabaseClient', () => ({
  cloudEnabled: true,
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    storage: { from: () => ({ upload: backend.upload }) },
    from: (table: string) => table === 'charts'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { practice_id: 'p1' } }) }) }) }
      : {
          insert: backend.insert,
          update: backend.update,
          select: () => ({ in: () => ({ order: async () => ({ data: [], error: null }) }) }),
        },
  },
}));
vi.mock('../utils/dicom', () => ({ renderDicomPreview: async () => new Blob([new Uint8Array(4)], { type: 'image/png' }) }));

import { useAttachments } from './useAttachments';

beforeEach(() => {
  vi.clearAllMocks();
  // Small images remain valid uploads even when a browser cannot decode a
  // thumbnail. Exercise that real path without jsdom canvas emulation.
  vi.stubGlobal('Image', class {
    onerror: (() => void) | null = null;
    set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:upload-test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('attachment upload classification', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', 'photo'],
    ['sensor.DCM', 'application/octet-stream', 'xray'],
    ['sensor', 'application/dicom', 'xray'],
  ])('stores %s with its inferred kind', async (name, type, expectedKind) => {
    const { result } = renderHook(() => useAttachments('c1', 'p1', 10, true));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const file = new File([new Uint8Array(4)], name, { type });
    await act(async () => { await result.current.upload(file, 'photo', 'Caption'); });
    expect(backend.insert).toHaveBeenCalledWith(expect.objectContaining({
      chart_id: 'c1', kind: expectedKind, caption: 'Caption', practice_id: 'p1', file_name: name,
    }));
    if (expectedKind === 'xray') expect(backend.insert.mock.calls[0][0]).toHaveProperty('original_path');
  });

  it('can still upload before the filename column is deployed', async () => {
    backend.insert.mockResolvedValueOnce({ error: { code: 'PGRST204', message: 'Missing file_name column' } });
    const { result } = renderHook(() => useAttachments('c1', 'p1', 10, true));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => result.current.upload(new File(['image'], 'photo.jpg', { type: 'image/jpeg' }), 'photo', ''));
    expect(backend.insert).toHaveBeenCalledTimes(2);
    expect(backend.insert.mock.calls[1][0]).not.toHaveProperty('file_name');
    expect(backend.upload).toHaveBeenCalledTimes(1);
  });

  it('recognizes an extensionless sensor export from its DICOM signature', async () => {
    const { result } = renderHook(() => useAttachments('c1', 'p1', 10, true));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const bytes = new Uint8Array(200);
    bytes.set([0x44, 0x49, 0x43, 0x4d], 128);
    await act(async () => { await result.current.upload(new File([bytes], 'IM000001'), 'photo', ''); });
    expect(backend.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'xray', original_path: expect.stringMatching(/\.dcm$/) }));
  });

  it('persists a regular image reclassification', async () => {
    const { result } = renderHook(() => useAttachments('c1', 'p1', 10, true));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.updateKind('jpeg-image', 'xray'); });
    expect(backend.update).toHaveBeenCalledWith({ kind: 'xray' });
    expect(backend.update.mock.results[0].value.eq).toHaveBeenCalledWith('id', 'jpeg-image');
  });
});
