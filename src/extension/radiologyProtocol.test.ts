import { expect, it } from 'vitest';
import { isRadiologyRequest, isRadiologyResponse } from './radiologyProtocol';

it('validates operation-specific radiology messages and bounded tab identities', () => {
  expect(isRadiologyRequest({ operation: 'list' })).toBe(true);
  expect(isRadiologyRequest({ operation: 'prepare', tabId: 3 })).toBe(true);
  expect(isRadiologyRequest({ operation: 'fill', tabId: 3, ticket: 'one', text: 'Reviewed findings' })).toBe(true);
  for (const request of [null, {}, { operation: 'prepare', tabId: -1 }, { operation: 'prepare', tabId: 0.1 },
    { operation: 'fill', tabId: 1, ticket: '', text: 'abc' }, { operation: 'fill', tabId: 1, ticket: 'one', text: '' }]) {
    expect(isRadiologyRequest(request)).toBe(false);
  }
});

it('validates destination metadata without accepting arbitrary sites or mismatched providers', () => {
  const target = { tabId: 2, title: 'Consultation', origin: 'https://app.radimal.ai', provider: 'radimal' };
  expect(isRadiologyResponse({ state: 'targets', targets: [target] })).toBe(true);
  expect(isRadiologyResponse({ state: 'targets', targets: [] })).toBe(true);
  expect(isRadiologyResponse({ state: 'targets', targets: [{ ...target, origin: 'https://evil.example' }] })).toBe(false);
  expect(isRadiologyResponse({ state: 'targets', targets: [{ ...target, provider: 'vetology' }] })).toBe(false);
  expect(isRadiologyResponse({ state: 'targets', targets: [{ ...target, tabId: NaN }] })).toBe(false);
  expect(isRadiologyResponse({ state: 'targets', targets: [target, target] })).toBe(false);
  expect(isRadiologyResponse({ state: 'saved' })).toBe(false);
});
