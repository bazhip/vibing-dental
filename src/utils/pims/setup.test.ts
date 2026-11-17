import { describe, expect, it, vi } from 'vitest';
import { createSetupBackend } from './setup';

const connection = { id: 'connection', provider: 'ezyvet', origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic', state: 'unverified', revision: 1 };
const configured = { practice_id: 'practice', provider: 'ezyvet' as const, origin: connection.origin, tenant_id: 'clinic' };
const client = (data: unknown) => ({ rpc: vi.fn(async () => ({ data, error: null })) });

describe('PIMS setup client', () => {
  it('loads only the requested owner practice and validates origin/provider binding', async () => {
    const rpc = client({ connections: [connection], members: [{ user_id: 'member' }] });
    expect(await createSetupBackend(rpc).context('practice')).toEqual({ connections: [connection], members: [{ user_id: 'member' }] });
    expect(rpc.rpc).toHaveBeenCalledWith('pims_setup_context', { payload: { practice_id: 'practice' } });
    rpc.rpc.mockResolvedValue({ data: { connections: [{ ...connection, origin: 'https://evil.invalid' }], members: [] }, error: null });
    await expect(createSetupBackend(rpc).context('practice')).rejects.toEqual({ code: 'unknown' });
  });
  it('refuses invalid configuration before any RPC and never verifies manually entered identity', async () => {
    const rpc = client(connection);
    const backend = createSetupBackend(rpc);
    await expect(backend.configure({ ...configured, origin: `${connection.origin}/patient/123` })).rejects.toEqual({ code: 'invalid' });
    expect(rpc.rpc).not.toHaveBeenCalled();
    expect(await backend.configure(configured)).toEqual(connection);
    expect(rpc.rpc).toHaveBeenCalledOnce();
    expect(rpc.rpc).toHaveBeenCalledWith('pims_configure_connection', { payload: configured });
  });
  it('rejects mismatched or already verified configuration acknowledgements', async () => {
    for (const bad of [{ ...connection, state: 'active' }, { ...connection, tenant_id: 'different' }]) {
      await expect(createSetupBackend(client(bad)).configure(configured)).rejects.toEqual({ code: 'unknown' });
    }
  });
  it('validates paginated chart source identities and duplicate records', async () => {
    const chart = { chart_id: 'chart', patient_name: 'Milo', patient_number: 'P1', chart_date: '2026-11-16', source_hash: 'a'.repeat(64), patient_id: null, version: 0 };
    expect((await createSetupBackend(client({ rows: [chart], next_cursor: null })).page({ connection_id: 'connection', collection: 'charts' })).rows).toEqual([chart]);
    for (const rows of [[chart, chart], [{ ...chart, source_hash: 'bad' }], [{ ...chart, version: -1 }]]) {
      await expect(createSetupBackend(client({ rows, next_cursor: null })).page({ connection_id: 'connection', collection: 'charts' })).rejects.toEqual({ code: 'unknown' });
    }
  });
  it('rejects mismatched chart-link receipts', async () => {
    const input = { connection_id: 'connection', chart_id: 'chart', patient_id: 'patient', expected_version: 0, source_hash: 'a'.repeat(64), request_id: 'request', reason: 'Reviewed' };
    await expect(createSetupBackend(client({ chart_id: 'wrong', patient_id: 'patient', version: 1 })).linkChart(input)).rejects.toEqual({ code: 'unknown' });
    expect(await createSetupBackend(client({ ...input, version: 1 })).linkChart(input)).toMatchObject({ chart_id: 'chart', version: 1 });
  });
  it('does not retry an uncertain write or expose backend details', async () => {
    const rpc = { rpc: vi.fn(async () => ({ data: null, error: { message: 'credentials and private details' } })) };
    await expect(createSetupBackend(rpc).configure(configured)).rejects.toEqual({ code: 'unknown' });
    expect(rpc.rpc).toHaveBeenCalledOnce();
  });
});
