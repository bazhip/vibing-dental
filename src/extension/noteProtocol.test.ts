import { expect, it } from 'vitest';
import { isNoteRequest, isNoteResponse } from './noteProtocol';

it('validates exact note operation shapes and bounded tab identities', () => {
  for (const request of [{ operation: 'list' }, { operation: 'inspect', tabId: 0 },
    { operation: 'prepare', tabId: 3, field: 'Plan' }, { operation: 'fill', tabId: 3, ticket: 'one', text: 'Reviewed notes' }]) {
    expect(isNoteRequest(request)).toBe(true);
  }
  for (const request of [null, {}, { operation: 'list', tabId: 2 }, { operation: 'inspect', tabId: 1, extra: true },
    { operation: 'inspect', tabId: -1 }, { operation: 'inspect', tabId: 0.1 }, { operation: 'prepare', tabId: 3 },
    { operation: 'prepare', tabId: 3, field: '' }, { operation: 'fill', tabId: 1, ticket: '', text: 'abc' }]) {
    expect(isNoteRequest(request)).toBe(false);
  }
});

it('rejects spoofed hosts, provider mismatches, duplicate identities and extraneous target metadata', () => {
  const target = { tabId: 2, title: 'Consultation', origin: 'https://clinic.rhapsody.vet', provider: 'rhapsody' };
  expect(isNoteResponse({ state: 'targets', targets: [target] })).toBe(true);
  expect(isNoteResponse({ state: 'targets', targets: [] })).toBe(true);
  for (const invalid of [{ ...target, origin: 'https://rhapsody.vet.evil.example' }, { ...target, provider: 'pulse' },
    { ...target, origin: 'https://clinic.rhapsody.vet:123' }, { ...target, tabId: NaN }, { ...target, origin: 'https://unrelated.example', provider: null }, { ...target, secret: 'token' }]) {
    expect(isNoteResponse({ state: 'targets', targets: [invalid] })).toBe(false);
  }
  expect(isNoteResponse({ state: 'targets', targets: [target, target] })).toBe(false);
  expect(isNoteResponse({ state: 'targets', targets: [], extra: true })).toBe(false);
  expect(isNoteResponse({ state: 'saved' })).toBe(false);
});


it('refuses extraneous inner response data at the transport boundary', () => {
  expect(isNoteResponse({ state: 'filled', secret: 'token' })).toBe(false);
  expect(isNoteResponse({ state: 'blocked', detail: 'private' })).toBe(false);
  expect(isNoteResponse({ state: 'fields', provider: 'vetspire', origin: 'https://clinic.vetspire.com', title: 'Note', fields: ['Assessment'], session: 'private' })).toBe(false);
});
