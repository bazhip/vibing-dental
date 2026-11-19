import { describe, expect, it, vi } from 'vitest';
import { createSyncBridge } from './syncBridge';
import type { SyncIdentity, SyncSource } from '../../utils/pims/sync';

const identity: SyncIdentity = { provider: 'rhapsody', origin: 'https://app.rhapsody.vet', tenant_id: 'business', connection_revision: 1 };
describe('provider sync page sessions', () => {
  it('retains the original source and rejects expired or replaced sessions', async () => {
    let now = 100;
    const source = { readIdentity: vi.fn(async () => identity), capture: vi.fn() } satisfies SyncSource;
    const bridge = createSyncBridge(() => source, () => now);
    const opened = await bridge({ operation: 'open', identity });
    expect(opened.ok && opened.operation === 'open' && opened.identity).toEqual(identity);
    if (!opened.ok || opened.operation !== 'open') throw new TypeError();
    expect(await bridge({ operation: 'identity', session: opened.session })).toEqual({ ok: true, operation: 'identity', identity });
    now += 600001;
    expect(await bridge({ operation: 'identity', session: opened.session })).toEqual({ ok: false, code: 'unavailable' });
  });
  it('does not leak provider errors or credentials', async () => {
    const bridge = createSyncBridge(() => ({ readIdentity: async () => { throw { secret: 'token' }; }, capture: vi.fn() }));
    expect(await bridge({ operation: 'open', identity })).toEqual({ ok: false, code: 'unavailable' });
    expect(await bridge({ operation: 'identity', session: 'unknown' })).toEqual({ ok: false, code: 'unavailable' });
  });
});

it('passes explicit configured-practice confirmation to the selected source factory', async () => {
  const factory = vi.fn(() => ({readIdentity: async () => identity,capture:vi.fn()}));
  const bridge = createSyncBridge(factory);
  await bridge({operation:'open',identity,userConfirmed:true});
  expect(factory).toHaveBeenCalledWith(identity,{userConfirmed:true});
});

it('disposes the replaced configured source before opening a fresh page session', async () => {
  const source={readIdentity:async()=>identity,capture:vi.fn(),dispose:vi.fn()};
  const bridge=createSyncBridge(()=>source);
  await bridge({operation:'open',identity});await bridge({operation:'open',identity});
  expect(source.dispose).toHaveBeenCalledOnce();
});
