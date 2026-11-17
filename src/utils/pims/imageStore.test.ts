import { describe, expect, it, vi } from 'vitest';
import { createImageStore } from './imageStore';

const image = { id: 'image', chart_id: 'chart', path: 'owner/chart/image.png', caption: '', kind: 'photo', original_path: null };
function fixture(data: unknown = [image], error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(async () => ({ data, error })), maybeSingle: vi.fn(async () => ({ data, error })) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
  const download = vi.fn(async () => ({ data: new Blob(['bytes'], { type: 'image/png' }), error: null }));
  const client = { from: vi.fn(() => query), storage: { from: vi.fn(() => ({ download })) }, rpc: vi.fn() };
  const store = createImageStore(client as unknown as Parameters<typeof createImageStore>[0]);
  return { client, query, store, download };
}
describe('private saved-image storage boundary', () => {
  it('bounds the inventory and scopes metadata reads to the requested chart', async () => {
    const { client, query, store } = fixture();
    expect(await store.list('chart')).toEqual([image]);
    expect(client.from).toHaveBeenCalledWith('attachments');
    expect(query.eq).toHaveBeenCalledWith('chart_id', 'chart');
    expect(query.order).toHaveBeenCalledWith('id');
    expect(query.limit).toHaveBeenCalledWith(31);
  });
  it('scopes fresh attachment reads by both chart and attachment identity', async () => {
    const { query, store } = fixture(image);
    expect(await store.read('chart', 'image')).toEqual(image);
    expect(query.eq.mock.calls).toEqual([['chart_id', 'chart'], ['id', 'image']]);
  });
  it('rejects partial or mismatched inventories and never creates signed URLs', async () => {
    for (const data of [Array.from({ length: 31 }, () => image), [{ ...image, chart_id: 'other' }]]) {
      await expect(fixture(data).store.list('chart')).rejects.toMatchObject({ code: 'unknown' });
    }
    const { client, store, download } = fixture();
    expect((await store.download(image.path)).type).toBe('image/png');
    expect(client.storage.from).toHaveBeenCalledExactlyOnceWith('attachments');
    expect(download).toHaveBeenCalledExactlyOnceWith(image.path);
  });
  it('returns only source binding metadata, not clinical data or saved draft bodies', async () => {
    const { client, store } = fixture();
    client.rpc.mockResolvedValue({ data: { source: { chart_id: 'chart', practice_id: 'practice', patient_name: 'Milo', patient_number: 'P1',
      chart_date: '2026-11-16', updated_at: '2026-11-16T12:00:00Z', hash: 'a'.repeat(64), data: { secret: 'clinical data' } }, drafts: [] }, error: null });
    expect(await store.context('chart')).toEqual({ chart_id: 'chart', patient_name: 'Milo', patient_number: 'P1', hash: 'a'.repeat(64) });
  });
});
