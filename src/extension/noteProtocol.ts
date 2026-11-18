import { identifyNoteProvider, isNoteAutofillRequest, isNoteAutofillResult } from './pims/noteAutofill';
import type { NoteAutofillRequest, NoteAutofillResult, NoteProvider } from './pims/noteAutofill';

export type NoteTarget = { tabId: number; provider: NoteProvider; origin: string; title: string };
export type NoteRequest = { operation: 'list' } | (NoteAutofillRequest & { tabId: number });
export type NoteResponse = NoteAutofillResult | { state: 'targets'; targets: NoteTarget[] };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const tabId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export function isNoteRequest(value: unknown): value is NoteRequest {
  if (!record(value)) return false;
  if (value.operation === 'list') return exact(value, ['operation']);
  if (!tabId(value.tabId)) return false;
  const { tabId: _tabId, ...request } = value;
  const keys = value.operation === 'inspect' ? ['operation', 'tabId']
    : value.operation === 'prepare' ? ['operation', 'tabId', 'field'] : ['operation', 'tabId', 'ticket', 'text'];
  return exact(value, keys) && isNoteAutofillRequest(request);
}
export function isNoteResponse(value: unknown): value is NoteResponse {
  if (!record(value)) return false;
  if (value.state !== 'targets') {
    const keys = value.state === 'fields' ? ['state', 'provider', 'origin', 'title', 'fields']
      : value.state === 'prepared' ? ['state', 'provider', 'origin', 'title', 'field', 'ticket', 'existing_characters', 'expires_at'] : ['state'];
    return exact(value, keys) && isNoteAutofillResult(value);
  }
  if (!exact(value, ['state', 'targets']) || !Array.isArray(value.targets) || value.targets.length > 100) return false;
  const ids = new Set<number>();
  return value.targets.every((target: unknown) => {
    if (!record(target) || !exact(target, ['tabId', 'provider', 'origin', 'title']) || !tabId(target.tabId) || ids.has(target.tabId)
      || typeof target.title !== 'string' || target.title.length > 500 || typeof target.origin !== 'string') return false;
    try {
      const url = new URL(target.origin);
      const provider = identifyNoteProvider(target.origin);
      if (url.origin !== target.origin || url.port || !provider || provider !== target.provider) return false;
    } catch { return false; }
    ids.add(target.tabId);
    return true;
  });
}
