import type { SyncCapture, SyncIdentity, SyncSource, SyncTicket } from '../../utils/pims/sync';

export type ProviderSyncRequest =
  | { operation: 'open'; identity: SyncIdentity }
  | { operation: 'identity'; session: string }
  | { operation: 'capture'; session: string; ticket: SyncTicket }
  | { operation: 'status'; session: string; ticket: SyncTicket; appointment_ids: string[] };
export type ProviderSyncResponse =
  | { ok: false; code: 'unavailable' }
  | { ok: true; operation: 'open'; session: string; identity: SyncIdentity }
  | { ok: true; operation: 'identity'; identity: SyncIdentity }
  | { ok: true; operation: 'capture'; capture: SyncCapture }
  | { ok: true; operation: 'status'; status: Awaited<ReturnType<NonNullable<SyncSource['lookupStatus']>>> };

export function createSyncBridge(sourceFor: (identity: SyncIdentity) => SyncSource | undefined, now = Date.now) {
  let active: { id: string; source: SyncSource; expires: number } | undefined;
  return async (request: ProviderSyncRequest): Promise<ProviderSyncResponse> => {
    try {
      if (request.operation === 'open') {
        active = undefined;
        const source = sourceFor(request.identity);
        if (!source) return { ok: false, code: 'unavailable' };
        const session = { id: crypto.randomUUID(), source, expires: now() + 600000 };
        active = session;
        const identity = await source.readIdentity();
        if (active !== session || now() >= session.expires) return { ok: false, code: 'unavailable' };
        return { ok: true, operation: 'open', session: session.id, identity };
      }
      const session = active;
      if (!session || session.id !== request.session || now() >= session.expires) return { ok: false, code: 'unavailable' };
      let response: ProviderSyncResponse;
      if (request.operation === 'identity') response = { ok: true, operation: 'identity', identity: await session.source.readIdentity() };
      else if (request.operation === 'capture') response = { ok: true, operation: 'capture', capture: await session.source.capture(request.ticket) };
      else if (request.operation === 'status' && session.source.lookupStatus) response = { ok: true, operation: 'status', status: await session.source.lookupStatus(request) };
      else return { ok: false, code: 'unavailable' };
      return active === session && now() < session.expires ? response : { ok: false, code: 'unavailable' };
    } catch { return { ok: false, code: 'unavailable' }; }
  };
}
