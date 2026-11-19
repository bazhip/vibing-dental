import { describe, expect, it, vi } from 'vitest';
import { createSyncBackend, syncAppointments } from './sync';
import type { SyncBackend, SyncCapture, SyncSource, SyncTicket } from './sync';

const scope = { requested_date: '2026-11-01', timezone: 'America/New_York', window_start: '2026-11-01T04:00:00Z', window_end: '2026-11-02T05:00:00Z' };
const identity = { provider: 'ezyvet' as const, origin: 'https://clinic.ezyvet.com', tenant_id: 'clinic-1', connection_revision: 2 };
const ticket: SyncTicket = { id: 'run-1', connection_id: 'connection-1', generation: 1, connection_revision: 2, started_at: '2026-11-16T12:00:00Z', expires_at: '2026-11-16T12:05:00Z', state: 'capturing', scope };
const appointment = { appointment_id: 'appointment-1', patient_id: 'patient-1', clinician_id: 'vet-1', encounter_id: null, starts_at: '2026-11-01T15:00:00Z', ends_at: '2026-11-01T15:30:00Z', status: 'active' as const };
function setup(overrides: Partial<SyncCapture> = {}) {
  const order: string[] = [];
  const capture: SyncCapture = { protocol: 1, generation: 1, captured_at: '2026-11-16T12:00:01Z', identity, scope, completeness: 'partial', items: [appointment], failures: [], ...overrides };
  const source: SyncSource = {
    readIdentity: async () => { order.push('identity'); return identity; },
    capture: async () => { order.push('capture'); return capture; },
  };
  const backend: SyncBackend = {
    start: async () => { order.push('start'); return structuredClone(ticket); },
    baseline: async () => { order.push('baseline'); return { patient_links: [{ patient_id: 'patient-1', version: 2 }], clinician_links: [{ clinician_id: 'vet-1', version: 3 }], visits: [{ appointment_id: 'appointment-1', version: 4 }] }; },
    submit: async (payload) => { order.push('submit'); return { run_id: ticket.id, request_id: payload.request_id, outcomes: payload.items.map((entry) => ({ appointment_id: entry.appointment_id, outcome: 'applied' as const, version: 5 })) }; },
    seal: async (payload) => ({ ...ticket, completeness: payload.completeness }),
    candidates: async () => ({ rows: [], next_cursor: null }),
    reconcile: async (payload) => ({ appointment_id: payload.appointment_id, outcome: 'applied', version: 6 }),
    finish: async (payload) => { order.push(payload.state); return { ...ticket, state: payload.state, completeness: payload.completeness }; },
  };
  let counter = 0;
  const run = () => syncAppointments({ connection_id: ticket.connection_id, request_id: 'request-1', identity, scope, source, backend, now: () => Date.parse('2026-11-16T12:00:02Z'), newRequestId: () => `chunk-${++counter}` });
  return { backend, source, order, run, capture };
}

describe('durable PIMS capture orchestration', () => {
  it('preserves an unknown source end time rather than manufacturing a duration', async () => {
    const fixture = setup();
    Object.assign(fixture.capture.items[0] = { ...appointment }, { ends_at: null });
    const submit = vi.spyOn(fixture.backend, 'submit');
    expect(await fixture.run()).toMatchObject({ state: 'completed' });
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ ends_at: null })] }));
  });
  it('keeps the captured baseline version for explicit cancellations', async () => {
    const { run, backend } = setup({ items: [{ ...appointment, status: 'cancelled' }] });
    backend.candidates = async () => ({ rows: [{ appointment_id: 'appointment-1', version: 6, patient_link_version: 2, clinician_link_version: 3 }], next_cursor: null });
    const reconcile = vi.spyOn(backend, 'reconcile');
    await run();
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({ expected_version: 4 }));
  });
  it('seals capture and checks missing appointments independently before completion', async () => {
    const { run, backend, source } = setup({ completeness: 'complete' });
    const seal = vi.spyOn(backend, 'seal');
    backend.candidates = vi.fn().mockResolvedValue({ rows: [{ appointment_id: 'absent', version: 4, patient_link_version: 2, clinician_link_version: 3 }], next_cursor: null });
    source.lookupStatus = vi.fn().mockImplementation(async () => {
      expect(seal).toHaveBeenCalledWith({ run_id: ticket.id, generation: 1, completeness: 'complete' });
      return { protocol: 1, generation: 1, captured_at: '2026-11-16T12:00:02Z', identity, items: [{ appointment_id: 'absent', status: 'cancelled' }] };
    });
    const reconcile = vi.spyOn(backend, 'reconcile');
    expect(await run()).toMatchObject({ state: 'completed', reconciliation: 'complete', reconciled: [{ appointment_id: 'absent', outcome: 'applied' }] });
    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({ appointment_id: 'absent', status: 'cancelled', expected_version: 4, patient_link_version: 2 }));
  });
  it('records unknown rather than deletion when status support is missing', async () => {
    const { run, backend } = setup({ completeness: 'complete' });
    backend.candidates = async () => ({ rows: [{ appointment_id: 'absent', version: 4, patient_link_version: 2, clinician_link_version: 3 }], next_cursor: null });
    backend.reconcile = vi.fn<SyncBackend['reconcile']>(async (payload) => ({ appointment_id: payload.appointment_id, outcome: 'skipped', version: 4, reason: 'status_unknown' }));
    expect(await run()).toMatchObject({ state: 'completed', reconciliation: 'unsupported', reconciled: [{ outcome: 'skipped' }] });
    expect(backend.reconcile).toHaveBeenCalledWith(expect.objectContaining({ status: 'unknown' }));
  });
  it.each(['wrong_id', 'duplicate', 'old_capture', 'wrong_tenant'])('rejects unsafe status responses: %s', async (fault) => {
    const { run, backend, source } = setup({ completeness: 'complete' });
    backend.candidates = async () => ({ rows: [{ appointment_id: 'absent', version: 4, patient_link_version: 2, clinician_link_version: 3 }], next_cursor: null });
    source.lookupStatus = async () => ({ protocol: 1, generation: 1,
      captured_at: fault === 'old_capture' ? ticket.started_at : '2026-11-16T12:00:02Z',
      identity: fault === 'wrong_tenant' ? { ...identity, tenant_id: 'other' } : identity,
      items: fault === 'duplicate' ? [{ appointment_id: 'absent', status: 'deleted' }, { appointment_id: 'absent', status: 'deleted' }] : [{ appointment_id: fault === 'wrong_id' ? 'different' : 'absent', status: 'deleted' }],
    });
    const reconcile = vi.spyOn(backend, 'reconcile');
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'invalid_status' });
    expect(reconcile).not.toHaveBeenCalled();
  });
  it('checks tenant again after lookup before writing', async () => {
    const { run, backend, source } = setup({ completeness: 'complete' });
    backend.candidates = async () => ({ rows: [{ appointment_id: 'absent', version: 4, patient_link_version: 2, clinician_link_version: 3 }], next_cursor: null });
    source.lookupStatus = async () => {
      source.readIdentity = async () => ({ ...identity, tenant_id: 'other' });
      return { protocol: 1, generation: 1, captured_at: '2026-11-16T12:00:02Z', identity, items: [{ appointment_id: 'absent', status: 'cancelled' }] };
    };
    const reconcile = vi.spyOn(backend, 'reconcile');
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'identity_changed' });
    expect(reconcile).not.toHaveBeenCalled();
  });
  it('preserves confirmed reconciliation results and never retries an uncertain write', async () => {
    const { run, backend, source } = setup({ completeness: 'complete' });
    backend.candidates = async () => ({ rows: ['first', 'second'].map((appointment_id) => ({ appointment_id, version: 4, patient_link_version: 2, clinician_link_version: 3 })), next_cursor: null });
    source.lookupStatus = async () => ({ protocol: 1, generation: 1, captured_at: '2026-11-16T12:00:02Z', identity,
      items: [{ appointment_id: 'first', status: 'deleted' }, { appointment_id: 'second', status: 'deleted' }] });
    backend.reconcile = vi.fn<SyncBackend['reconcile']>().mockResolvedValueOnce({ appointment_id: 'first', outcome: 'applied', version: 5 }).mockRejectedValueOnce({ code: 'timeout' });
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'reconcile_unknown', reconciled: [{ appointment_id: 'first', outcome: 'applied' }] });
    expect(backend.reconcile).toHaveBeenCalledTimes(2);
  });
  it('starts a server lease and snapshots baseline versions before reading appointments', async () => {
    const { run, order, backend } = setup();
    const submit = vi.spyOn(backend, 'submit');
    const result = await run();
    expect(order).toEqual(['start','baseline','identity','capture','identity','identity','submit','completed']);
    expect(submit.mock.calls[0][0].items[0]).toMatchObject({ expected_version: 4, patient_link_version: 2, clinician_link_version: 3 });
    expect(result).toMatchObject({ state: 'completed', completeness: 'partial', outcomes: [{ outcome: 'applied' }] });
  });
  it('never infers completeness from an empty failure-free feed', async () => {
    const { run, backend } = setup({ items: [], completeness: 'unknown' });
    const finish = vi.spyOn(backend, 'finish');
    expect(await run()).toMatchObject({ state: 'completed', completeness: 'unknown', outcomes: [] });
    expect(finish.mock.calls[0][0].completeness).toBe('unknown');
  });
  it('does not upgrade a declared complete capture with individual failures', async () => {
    const { run } = setup({ completeness: 'complete', failures: [{ appointment_id: 'bad', code: 'read_failed' }] });
    expect(await run()).toMatchObject({ state: 'completed', completeness: 'partial', failures: [{ code: 'read_failed' }] });
  });
  it.each([
    { identity: { ...identity, tenant_id: 'other-clinic' } },
    { scope: { ...scope, requested_date: '2026-11-02' } },
    { generation: 0 }, { captured_at: '2026-11-16T11:59:59Z' },
    { captured_at: '2026-11-16T12:04:00Z' }, { protocol: 2 },
    { items: [appointment, appointment] },
    { items: [{ ...appointment, patient_id: '' }] },
  ])('abandons unsafe capture %j before any write', async (overrides) => {
    const { run, order } = setup(overrides as Partial<SyncCapture>);
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'invalid_capture' });
    expect(order).not.toContain('submit');
    expect(order.at(-1)).toBe('abandoned');
  });
  it('rechecks same-origin tenant identity after capture', async () => {
    const { run, source, order } = setup();
    let reads = 0;
    source.readIdentity = async () => ++reads === 1 ? identity : { ...identity, tenant_id: 'switched' };
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'identity_changed' });
    expect(order).not.toContain('submit');
  });
  it('rejects an expired replayed start without reusing a cached capture', async () => {
    const { run, backend, order } = setup();
    backend.start = async () => ({ ...ticket, expires_at: ticket.started_at });
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'stale_run' });
    expect(order).not.toContain('capture');
  });
  it('bounds chunks to 100 and keeps prior confirmed outcomes after a later response is lost', async () => {
    const { run, backend, order } = setup({ items: Array.from({ length: 101 }, (_, index) => ({ ...appointment, appointment_id: `appointment-${index}` })) });
    const submit = backend.submit;
    let submissions = 0;
    backend.submit = async (payload) => {
      if (++submissions === 2) throw new TypeError('network response lost');
      expect(payload.items).toHaveLength(100);
      return submit(payload);
    };
    const result = await run();
    expect(result).toMatchObject({ state: 'interrupted', code: 'submit_unknown' });
    expect(result.outcomes).toHaveLength(100);
    expect(submissions).toBe(2);
    expect(order).not.toContain('completed');
  });
  it('returns unknown completion rather than success when the finish response is lost', async () => {
    const { run, backend } = setup();
    backend.finish = async () => { throw new TypeError('network response lost'); };
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'finish_unknown', outcomes: [{ outcome: 'applied' }] });
  });
  it('reports schema unavailable without invoking the capture source', async () => {
    const { run, backend, order } = setup();
    backend.start = createSyncBackend({ rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'missing function' } }) }).start;
    expect(await run()).toMatchObject({ state: 'blocked', code: 'schema_unavailable' });
    expect(order).toEqual([]);
  });
  it('does not fall back to display-only appointment adapters', async () => {
    const { backend } = setup();
    const result = await syncAppointments({ connection_id: ticket.connection_id, request_id: 'request-1', identity, scope, backend });
    expect(result).toMatchObject({ state: 'blocked', code: 'unsupported' });
  });
  it('passes only the authenticated RPC envelope and does not retain backend error messages', async () => {
    const rpc = vi.fn(async () => ({ data: ticket, error: null }));
    const backend = createSyncBackend({ rpc });
    expect(await backend.start({ connection_id: ticket.connection_id, request_id: 'request-1', scope })).toEqual(ticket);
    expect(rpc).toHaveBeenCalledWith('pims_start_sync', { payload: { connection_id: ticket.connection_id, request_id: 'request-1', scope } });
    const denied = createSyncBackend({ rpc: async () => ({ data: null, error: { message: 'pims_forbidden' } }) });
    await expect(denied.start({ connection_id: ticket.connection_id, request_id: 'request-1', scope })).rejects.toEqual({ code: 'pims_forbidden' });
  });
  it('rechecks target identity before every submitted chunk', async () => {
    const { run, source, backend } = setup({ items: Array.from({ length: 101 }, (_, index) => ({ ...appointment, appointment_id: `a-${index}` })) });
    const submit = backend.submit;
    backend.submit = async (payload) => {
      const result = await submit(payload);
      source.readIdentity = async () => ({ ...identity, tenant_id: 'changed-between-chunks' });
      return result;
    };
    const result = await run();
    expect(result).toMatchObject({ state: 'interrupted', code: 'identity_changed' });
    expect(result.outcomes).toHaveLength(100);
  });
  it.each([null, { ...ticket, started_at: 'invalid' }, { ...ticket, started_at: '2026-11-16T12:04:00Z' }])('does not trust malformed or future server leases', async (value) => {
    const { run, backend, order } = setup();
    backend.start = async () => value as SyncTicket;
    expect(await run()).toMatchObject({ code: 'stale_run' });
    expect(order).not.toContain('capture');
  });
  it('rejects invalid baseline versions before capture instead of guessing defaults', async () => {
    const { run, backend, order } = setup();
    backend.baseline = async () => ({ patient_links: [{ patient_id: 'patient-1', version: -1 }], clinician_links: [], visits: [] });
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'baseline_failed' });
    expect(order).not.toContain('capture');
  });
  it('rejects malformed submit acknowledgements without reporting success', async () => {
    const { run, backend } = setup();
    backend.submit = async (payload) => ({ run_id: ticket.id, request_id: payload.request_id, outcomes: [] });
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'submit_unknown', outcomes: [] });
  });
  it('rejects an appointment that also failed identity capture', async () => {
    const { run, order } = setup({ failures: [{ appointment_id: 'appointment-1', code: 'identity_missing' }] });
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'invalid_capture' });
    expect(order).not.toContain('submit');
  });
  it('splits valid multi-byte identifiers below the RPC byte limit', async () => {
    const long = '猫'.repeat(198);
    const { run, backend } = setup({ items: Array.from({ length: 100 }, (_, index) => ({ ...appointment, appointment_id: `${long}${index}`, patient_id: long, clinician_id: long, encounter_id: long })) });
    const submit = backend.submit;
    let count = 0;
    backend.submit = async (payload) => {
      count++;
      expect(new TextEncoder().encode(JSON.stringify(payload)).length).toBeLessThan(220000);
      return submit(payload);
    };
    expect(await run()).toMatchObject({ state: 'completed' });
    expect(count).toBeGreaterThan(1);
  });
  it.each([
    { outcome: 'applied', version: undefined }, { outcome: 'applied', version: 0 },
    { outcome: 'unchanged', version: 1.5 }, { outcome: 'conflict', version: 1 },
    { outcome: 'skipped', version: 0, reason: 'unbounded raw server details' },
  ])('rejects malformed outcome metadata %j', async (outcome) => {
    const { run, backend } = setup();
    backend.submit = async (payload) => ({ run_id: ticket.id, request_id: payload.request_id, outcomes: [{ appointment_id: 'appointment-1', ...outcome }] } as Awaited<ReturnType<SyncBackend['submit']>>);
    expect(await run()).toMatchObject({ state: 'interrupted', code: 'submit_unknown', outcomes: [] });
  });
  it('pages baseline collections completely before returning versions', async () => {
    const rpc = vi.fn(async (_name: string, args: { payload: unknown }) => {
      const payload = args.payload as { collection: string; cursor?: string };
      if (payload.collection === 'visits' && !payload.cursor) return { data: { rows: [{ external_id: 'old-1', version: 1 }], next_cursor: 'cursor-1' }, error: null };
      if (payload.collection === 'visits') return { data: { rows: [{ external_id: 'old-2', version: 2 }], next_cursor: null }, error: null };
      return { data: { rows: [], next_cursor: null }, error: null };
    });
    expect(await createSyncBackend({ rpc }).baseline({ run_id: ticket.id, generation: 1 })).toEqual({ patient_links: [], clinician_links: [], visits: [{ appointment_id: 'old-1', version: 1 }, { appointment_id: 'old-2', version: 2 }] });
    expect(rpc).toHaveBeenCalledTimes(4);
  });
});
