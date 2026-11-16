import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { removeChartAttachments } from './chartAttachments';

function fakeClient(rows: unknown[], opts: { noOriginalColumn?: boolean } = {}) {
  const log: Array<[string, ...unknown[]]> = [];
  const client = {
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: async (col: string, v: string) => {
          log.push(['select', table, cols, col, v]);
          if (opts.noOriginalColumn && cols.includes('original_path')) return { data: null, error: { message: 'column original_path does not exist' } };
          return { data: rows, error: null };
        },
      }),
      delete: () => ({ in: async (col: string, ids: string[]) => { log.push(['delete', table, col, ids]); return { error: null }; } }),
    }),
    storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => { log.push(['remove', bucket, paths]); return { error: null }; } }) },
  } as unknown as SupabaseClient;
  return { client, log };
}

describe('removeChartAttachments', () => {
  it('removes each image’s file, thumbnail and DICOM original, then the rows', async () => {
    const { client, log } = fakeClient([
      { id: 'a1', path: 'u1/c1/x.png', original_path: 'u1/c1/x.dcm' },
      { id: 'a2', path: 'u1/c1/y.jpg', original_path: null },
    ]);
    await removeChartAttachments(client, 'c1');
    expect(log.slice(1)).toEqual([
      ['remove', 'attachments', ['u1/c1/x.png', 'u1/c1/x.thumb.jpg', 'u1/c1/x.dcm', 'u1/c1/y.jpg', 'u1/c1/y.thumb.jpg']],
      ['delete', 'attachments', 'id', ['a1', 'a2']],
    ]);
  });

  it('does nothing when the chart had no images', async () => {
    const { client, log } = fakeClient([]);
    await removeChartAttachments(client, 'c1');
    expect(log.filter((l) => l[0] !== 'select')).toEqual([]);
  });

  it('works on a database without the original_path column', async () => {
    const { client, log } = fakeClient([{ id: 'a1', path: 'u1/c1/x.png' }], { noOriginalColumn: true });
    await removeChartAttachments(client, 'c1');
    expect(log.at(-1)).toEqual(['delete', 'attachments', 'id', ['a1']]);
  });
});
