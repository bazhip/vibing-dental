import type { SupabaseClient } from '@supabase/supabase-js';
import { thumbPathFor } from '../hooks/useAttachments';

type Row = { id: string; path: string | null; original_path?: string | null };

/**
 * Remove a deleted chart's images: the stored files (image, thumbnail,
 * DICOM original), then the rows. Attachment rows reference their chart by
 * id only (no foreign key), so deleting a chart used to leave its photos
 * and radiographs in storage forever, still signable by the practice.
 *
 * Call AFTER the chart row is deleted: a failure here then leaves orphaned
 * files (as before) rather than a chart without its images. Files go
 * before rows because the storage policy for teammates' files looks the
 * rows up. Files this user isn't allowed to delete are skipped by storage.
 */
export async function removeChartAttachments(client: SupabaseClient, chartId: string): Promise<void> {
  const select = (cols: string) => client.from('attachments').select(cols).eq('chart_id', chartId);
  // original_path ships via migration: degrade to "no DICOM originals".
  let { data, error } = await select('id, path, original_path');
  if (error) ({ data, error } = await select('id, path'));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return;
  const files = rows.flatMap((r) => (r.path ? [r.path, thumbPathFor(r.path)] : []).concat(r.original_path ? [r.original_path] : []));
  for (let i = 0; i < files.length; i += 100) {
    const { error: storageError } = await client.storage.from('attachments').remove(files.slice(i, i + 100));
    if (storageError) throw new Error(storageError.message);
  }
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { error: rowError } = await client.from('attachments').delete().in('id', ids.slice(i, i + 100));
    if (rowError) throw new Error(rowError.message);
  }
}
