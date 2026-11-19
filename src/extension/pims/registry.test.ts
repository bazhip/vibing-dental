import { describe, expect, it, vi } from 'vitest';
import { adapterFor, PIMS_ADAPTERS } from './registry';
import { providerSyncSource } from './providerSync';

const configuredProviders = [['instinct','instinctvet.cloud'],['instinct','instinctvet.com'],['ezyvet','ezyvet.com'],['daysmart','vettersoftware.com'],['pulse','evetpractice.com'],['shepherd','shepherd.vet']] as const;

describe('PIMS durable sync capability registry', () => {
  it('exposes configured sources plus the existing observed sources', () => {
    const supportedProviders = Object.entries(PIMS_ADAPTERS)
      .filter(([, adapter]) => adapter.syncSource !== undefined)
      .map(([provider]) => provider)
      .sort();

    expect(supportedProviders).toEqual(['daysmart','ezyvet','instinct','pulse','rhapsody','shepherd','vetspire']);
  });

  it.each([
    ['rhapsody', 'rhapsody.vet'],
    ['vetspire', 'vetspire.com'],
  ] as const)('resolves %s to the explicit durable sync implementation', (provider, domain) => {
    const adapter = adapterFor(`https://clinic.${domain}/schedule`);

    expect(adapter).toBe(PIMS_ADAPTERS[provider]);
    expect(adapter?.syncSource).toBe(providerSyncSource);
  });

  it.each([
    'rhapsody',
    'vetspire',
    'ezyvet',
    'daysmart',
    'pulse',
    'https://rhapsody.vet.attacker.test/sync',
    'https://vetspire.com.attacker.test/sync',
    'https://attacker.test/?provider=rhapsody&host=vetspire.com',
    'https://rhapsody.vet@attacker.test/',
    'https://attacker.test@clinic.vetspire.com/',
    'http://clinic.rhapsody.vet/',
    'http://clinic.vetspire.com/',
  ])('does not infer a sync-capable adapter from %s', (url) => {
    expect(adapterFor(url)).toBeNull();
  });
});


it.each(configuredProviders)('requires explicit confirmation before opening configured %s sync', async (provider,domain) => {
  const adapter = adapterFor(`https://clinic.${domain}/schedule`)!;
  expect(adapter.syncSource).toBeTypeOf('function');
  const context = {doc:document,url:new URL(`https://clinic.${domain}/schedule`),localStorage,sessionStorage,fetch:vi.fn(),wait:async()=>{}};
  const binding = {provider,origin:context.url.origin,tenant_id:'Configured clinic',connection_revision:1};
  await expect(adapter.syncSource!(context,binding).readIdentity()).rejects.toMatchObject({code:'identity_changed'});
  expect(context.fetch).not.toHaveBeenCalled();
});
