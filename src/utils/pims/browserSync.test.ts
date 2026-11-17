import { expect, it, vi } from 'vitest';
import { openBrowserSync, runBrowserSync } from './browserSync';
import type { PimsTransport } from './extensionBridge';
const connection = { id: 'connection', provider: 'rhapsody' as const, origin: 'https://app.rhapsody.vet', tenant_id: 'business', state: 'unverified' as const, revision: 1 };
const identity = { provider: connection.provider, origin: connection.origin, tenant_id: connection.tenant_id, connection_revision: 1 };
function transport() {
  return { inspect: vi.fn(async () => ({ tab: { id: 7 }, status: { provider: 'rhapsody' } })),
    providerSync: vi.fn(async (_tab: number, request: { operation: string }) => request.operation === 'open'
      ? { ok: true, operation: 'open', session: 'session', identity }
      : { ok: true, operation: 'identity', identity }),
  } as unknown as PimsTransport;
}
it('verifies only the selected tab and observed identity', async () => {
  const bridge = transport();
  const rpc = vi.fn(async () => ({ data: { ...connection, state: 'active', revision: 2 }, error: null }));
  await runBrowserSync({ connection, client: { rpc }, transport: bridge, alive: () => true });
  expect(rpc).toHaveBeenCalledWith('pims_verify_connection', { payload: expect.objectContaining({ expected_revision: 1, tenant_id: 'business' }) });
  expect(bridge.providerSync).toHaveBeenLastCalledWith(7, { operation: 'identity', session: 'session' });
});
it('never submits after an auth change or accepts a different tenant', async () => {
  const bridge = transport(), rpc = vi.fn();
  await expect(runBrowserSync({ connection, client: { rpc }, transport: bridge, alive: () => false })).rejects.toEqual({ code: 'invalid' });
  expect(rpc).not.toHaveBeenCalled();
  vi.mocked(bridge.providerSync!).mockResolvedValue({ ok: true, operation: 'open', session: 'session', identity: { ...identity, tenant_id: 'other' } });
  await expect(openBrowserSync(bridge, identity, () => true)).rejects.toEqual({ code: 'invalid' });
});
it('pins later reads instead of reselecting the most recent tab', async () => {
  const bridge = transport(); let alive = true;
  const source = await openBrowserSync(bridge, identity, () => alive);
  await source.readIdentity();
  expect(bridge.inspect).toHaveBeenCalledTimes(1);
  alive = false;
  await expect(source.readIdentity()).rejects.toEqual({ code: 'conflict' });
  expect(bridge.providerSync).toHaveBeenCalledTimes(2);
});
it.each([{ provider: 'vetspire' }, { origin: 'https://other.rhapsody.vet' }, { tenant_id: 'other' }])('rejects a verification receipt for a different provider context', async (change) => {
  const rpc = vi.fn(async () => ({ data: { ...connection, state: 'active', revision: 2, ...change }, error: null }));
  await expect(runBrowserSync({ connection, client: { rpc }, transport: transport(), alive: () => true })).rejects.toEqual({ code: 'conflict' });
});
