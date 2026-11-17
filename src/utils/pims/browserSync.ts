import type { PimsTransport } from './extensionBridge';
import type { SetupConnection } from './setup';
import type { RpcClient, SyncIdentity, SyncScope, SyncSource } from './sync';
import { createSyncBackend, syncAppointments } from './sync';

export async function openBrowserSync(transport: PimsTransport, identity: SyncIdentity, alive: () => boolean): Promise<SyncSource> {
  const inspect = await transport.inspect();
  if (!alive() || !transport.providerSync || inspect.tab === null || inspect.status?.provider !== identity.provider) throw { code: 'invalid' };
  const tabId = inspect.tab.id;
  const opened = await transport.providerSync(tabId, { operation: 'open', identity });
  const same = (value: SyncIdentity) => value?.provider === identity.provider && value.origin === identity.origin && value.tenant_id === identity.tenant_id && value.connection_revision === identity.connection_revision;
  if (!alive() || !opened?.ok || opened.operation !== 'open' || !same(opened.identity) || !opened.session) throw { code: 'invalid' };
  const session = opened.session;
  const call = async (request: Parameters<NonNullable<PimsTransport['providerSync']>>[1]) => {
    if (!alive()) throw { code: 'conflict' };
    const response = await transport.providerSync!(tabId, request);
    if (!alive() || !response?.ok) throw { code: 'conflict' };
    return response;
  };
  return {
    readIdentity: async () => {
      const response = await call({ operation: 'identity', session });
      if (response.operation !== 'identity' || !same(response.identity)) throw { code: 'conflict' };
      return response.identity;
    },
    capture: async (ticket) => {
      const response = await call({ operation: 'capture', session, ticket });
      if (response.operation !== 'capture') throw { code: 'invalid' };
      return response.capture;
    },
    ...(identity.provider === 'rhapsody' ? { lookupStatus: async (input: Parameters<NonNullable<SyncSource['lookupStatus']>>[0]) => {
      const response = await call({ operation: 'status', session, ...input });
      if (response.operation !== 'status') throw { code: 'invalid' };
      return response.status;
    } } : {}),
  };
}

export async function runBrowserSync(options: {
  connection: SetupConnection; scope?: SyncScope; client: RpcClient; transport: PimsTransport; alive: () => boolean;
}) {
  const { connection, client, transport, alive } = options;
  const identity: SyncIdentity = { provider: connection.provider, origin: connection.origin, tenant_id: connection.tenant_id, connection_revision: connection.revision };
  const source = await openBrowserSync(transport, identity, alive);
  const guarded: RpcClient = { rpc: async (name, args) => {
    if (!alive()) throw { code: 'conflict' };
    const response = await client.rpc(name, args);
    if (!alive()) throw { code: 'conflict' };
    return response;
  } };
  if (!options.scope) {
    const observed = await source.readIdentity();
    const { data, error } = await guarded.rpc('pims_verify_connection', { payload: { connection_id: connection.id, expected_revision: connection.revision,
      provider: observed.provider, origin: observed.origin, tenant_id: observed.tenant_id, observed_at: new Date().toISOString() } });
    const saved = data as SetupConnection | null;
    if (error || !saved || saved.id !== connection.id || saved.revision !== connection.revision + 1 || saved.state !== 'active'
      || saved.provider !== identity.provider || saved.origin !== identity.origin || saved.tenant_id !== identity.tenant_id) throw { code: 'conflict' };
    return null;
  }
  if (connection.state !== 'active') throw { code: 'invalid' };
  return syncAppointments({ connection_id: connection.id, request_id: crypto.randomUUID(), identity, source, scope: options.scope, backend: createSyncBackend(guarded) });
}
