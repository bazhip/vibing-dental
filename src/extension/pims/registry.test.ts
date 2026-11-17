import { describe, expect, it } from 'vitest';
import { adapterFor, PIMS_ADAPTERS } from './registry';
import { providerSyncSource } from './providerSync';

const displayOnlyProviders = [
  ['ezyvet', 'ezyvet.com'],
  ['daysmart', 'vettersoftware.com'],
  ['instinct', 'instinctvet.cloud'],
  ['instinct', 'instinctvet.com'],
  ['pulse', 'evetpractice.com'],
  ['shepherd', 'shepherd.vet'],
] as const;

describe('PIMS durable sync capability registry', () => {
  it('exposes a sync source only for Rhapsody and Vetspire', () => {
    const supportedProviders = Object.entries(PIMS_ADAPTERS)
      .filter(([, adapter]) => adapter.syncSource !== undefined)
      .map(([provider]) => provider)
      .sort();

    expect(supportedProviders).toEqual(['rhapsody', 'vetspire']);
  });

  it.each([
    ['rhapsody', 'rhapsody.vet'],
    ['vetspire', 'vetspire.com'],
  ] as const)('resolves %s to the explicit durable sync implementation', (provider, domain) => {
    const adapter = adapterFor(`https://clinic.${domain}/schedule`);

    expect(adapter).toBe(PIMS_ADAPTERS[provider]);
    expect(adapter?.syncSource).toBe(providerSyncSource);
  });

  it.each(displayOnlyProviders)('keeps %s on %s display-only despite hostname recognition', (provider, domain) => {
    const adapter = adapterFor(`https://clinic.${domain}/schedule`);

    expect(adapter).toBe(PIMS_ADAPTERS[provider]);
    expect(adapter?.id).toBe(provider);
    expect(adapter?.listAppointments).toBeTypeOf('function');
    expect(adapter?.syncSource).toBeUndefined();
  });

  it.each(displayOnlyProviders)('does not promote %s on %s using provider-looking names', (provider, domain) => {
    const adapter = adapterFor(`https://rhapsody.vetspire.${domain}/rhapsody/vetspire/sync?provider=vetspire&syncSource=rhapsody#vetspire`);

    expect(adapter).toBe(PIMS_ADAPTERS[provider]);
    expect(adapter?.syncSource).toBeUndefined();
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
