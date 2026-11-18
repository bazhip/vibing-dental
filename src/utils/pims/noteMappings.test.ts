import { createNoteMappingBackend, groupNoteSources, validNoteMapping } from './noteMappings';
import type { RpcClient } from './sync';
const key = { provider: 'pulse' as const, origin: 'https://clinic.evetpractice.com', template_id: 'record-note-v1' };
it('groups destinations once in first-source order and preserves section order', () => {
  expect(groupNoteSources([{ id: 'a', label: 'A', text: 'first' }, { id: 'b', label: 'B', text: 'second' }, { id: 'c', label: 'C', text: 'third' }], { a: 'Plan', b: 'Notes', c: 'Plan' }))
    .toEqual([{ field: 'Plan', text: 'first\n\nthird', sources: ['A', 'C'] }, { field: 'Notes', text: 'second', sources: ['B'] }]);
});
it('validates only bounded section IDs and destination labels', () => {
  expect(validNoteMapping({ treatment: 'Plan', exam: null })).toBe(true);
  for (const value of [{ 'patient name': 'Plan' }, { treatment: { text: 'note' } }, { treatment: '' }, { treatment: 'x'.repeat(501) }, { treatment: 'bad\u0000label' }]) expect(validNoteMapping(value)).toBe(false);
});
it('loads by provider, exact origin and template and saves with an optimistic version', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { ...key, version: 2, mapping: { treatment: 'Plan' } }, error: null });
  const backend = createNoteMappingBackend({ rpc } as unknown as RpcClient);
  expect(await backend.load(key)).toMatchObject({ version: 2 });
  expect(rpc).toHaveBeenLastCalledWith('pims_note_mapping_get', { payload: key });
  await backend.save({ ...key, expected_version: 1, mapping: { treatment: 'Plan' } });
  expect(rpc).toHaveBeenLastCalledWith('pims_note_mapping_save', { payload: { ...key, expected_version: 1, mapping: { treatment: 'Plan' } } });
});
it('rejects origin/provider mismatch and mismatched server identity', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { ...key, template_id: 'other', version: 0, mapping: {} }, error: null });
  const backend = createNoteMappingBackend({ rpc } as unknown as RpcClient);
  await expect(backend.load({ ...key, origin: 'https://evil.example' })).rejects.toEqual({ code: 'invalid' });
  expect(rpc).not.toHaveBeenCalled();
  await expect(backend.load(key)).rejects.toEqual({ code: 'unknown' });
});
it('surfaces conflicts without retrying or overwriting', async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'pims_conflict' } });
  await expect(createNoteMappingBackend({ rpc } as unknown as RpcClient).save({ ...key, expected_version: 0, mapping: {} })).rejects.toEqual({ code: 'conflict' });
  expect(rpc).toHaveBeenCalledTimes(1);
});
