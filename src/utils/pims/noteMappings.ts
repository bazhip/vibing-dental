import { identifyNoteProvider, type NoteProvider } from '../../extension/pims/noteAutofill';
import type { RpcClient } from './sync';

/** Owned preferences contain section identifiers and field labels only. Never pass source notes here. */
export type NoteMapping = Record<string, string | null>;
export type NoteMappingKey = { provider: NoteProvider; origin: string; template_id: string };
export type SavedNoteMapping = NoteMappingKey & { version: number; mapping: NoteMapping };
export type NoteMappingBackend = {
  load(key: NoteMappingKey): Promise<SavedNoteMapping>;
  save(input: NoteMappingKey & { expected_version: number; mapping: NoteMapping }): Promise<SavedNoteMapping>;
};
export type NoteSource = { id: string; label: string; text: string };
export type NoteGroup = { field: string; text: string; sources: string[] };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-zA-Z0-9_-]{0,79}$/.test(value);
const label = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value);
const version = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < 2147483647;
export function validNoteMapping(value: unknown): value is NoteMapping {
  return object(value) && Object.keys(value).length <= 64 && Object.entries(value).every(([key, field]) => identifier(key) && (field === null || label(field)));
}
function validKey(key: NoteMappingKey): boolean {
  try { return identifier(key.template_id) && new URL(key.origin).origin === key.origin && identifyNoteProvider(key.origin) === key.provider; } catch { return false; }
}
export function groupNoteSources(sources: NoteSource[], mapping: NoteMapping): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  for (const source of sources) {
    const field = mapping[source.id];
    if (!field || !source.text.trim()) continue;
    const group = groups.get(field);
    if (group) { group.text += `\n\n${source.text}`; group.sources.push(source.label); }
    else groups.set(field, { field, text: source.text, sources: [source.label] });
  }
  return [...groups.values()];
}
export function createNoteMappingBackend(client: RpcClient): NoteMappingBackend {
  async function invoke(name: string, input: NoteMappingKey & { expected_version?: number; mapping?: NoteMapping }): Promise<SavedNoteMapping> {
    if (!validKey(input) || input.mapping !== undefined && (!validNoteMapping(input.mapping) || !version(input.expected_version))) throw { code: 'invalid' };
    let response;
    try { response = await client.rpc(name, { payload: input }); } catch { throw { code: 'unknown' }; }
    if (response.error) throw { code: response.error.message === 'pims_conflict' ? 'conflict' : 'unknown' };
    const data = response.data;
    if (!object(data) || data.provider !== input.provider || data.origin !== input.origin || data.template_id !== input.template_id
      || !version(data.version) || !validNoteMapping(data.mapping) || Object.keys(data).some(key => !['provider','origin','template_id','version','mapping'].includes(key))
      || input.expected_version !== undefined && data.version !== input.expected_version + 1) throw { code: 'unknown' };
    return data as SavedNoteMapping;
  }
  return { load: key => invoke('pims_note_mapping_get', key), save: input => invoke('pims_note_mapping_save', input) };
}
