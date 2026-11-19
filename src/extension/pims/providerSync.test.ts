import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { providerSyncSource } from './providerSync';
import type { AdapterContext } from './types';
import type { SyncIdentity, SyncTicket } from '../../utils/pims/sync';

const identity: SyncIdentity = { provider: 'rhapsody', origin: 'https://clinic.rhapsody.vet', tenant_id: 'business-1', connection_revision: 2 };
const scope = { requested_date: '2026-11-16', timezone: 'UTC', window_start: '2026-11-16T00:00:00Z', window_end: '2026-11-17T00:00:00Z' };
const ticket: SyncTicket = { id: 'run', connection_id: 'connection', connection_revision: 2, generation: 1, scope, state: 'capturing', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 300000).toISOString() };
const row = { id: 'appointment', patient: { id: 'patient' }, personRoles: [{ personId: 'vet' }], scheduledStartDatetime: '2026-11-16T09:00:00Z', state: { name: 'Scheduled' } };
const json = (data: unknown) => ({ ok: true, json: async () => data }) as Response;
const values = new Map<string, string>();
const localStorage: Storage = { get length() { return values.size; }, key: index => [...values.keys()][index] ?? null,
  removeItem: key => { values.delete(key); }, getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, value); }, clear: () => values.clear() };
const sessionStorage = localStorage;
function fixture(binding = identity) {
  const fetcher = vi.fn().mockResolvedValue(json({ appointments: [row], persons: [] }));
  const context: AdapterContext = { doc: document, url: new URL(`${binding.origin}/schedule?businessId=${binding.tenant_id}`), fetch: fetcher, localStorage, sessionStorage, wait: async () => {} };
  return { context, fetcher, source: () => providerSyncSource(context, binding) };
}
beforeEach(() => { localStorage.clear(); vi.spyOn(document, 'cookie', 'get').mockReturnValue('JWT=secret'); });
afterEach(() => vi.restoreAllMocks());
it('captures real Rhapsody IDs and unknown end times without copying display names', async () => {
  const { source, fetcher } = fixture();
  const capture = await source().capture(ticket);
  expect(capture).toMatchObject({ identity, generation: 1, completeness: 'unknown', items: [{ appointment_id: 'appointment', patient_id: 'patient', clinician_id: 'vet', encounter_id: null, starts_at: row.scheduledStartDatetime, ends_at: null, status: 'active' }] });
  expect(String(fetcher.mock.calls[0][0])).toContain('/apigw-rhapsody/v2/schedules?');
  expect(JSON.stringify(capture)).not.toContain('secret');
});
it('rejects the wrong business before issuing a request', async () => {
  const { source, context, fetcher } = fixture();
  context.url.searchParams.set('businessId', 'wrong');
  await expect(source().readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('accepts missing optional person metadata and isolates invalid IDs as partial failures', async () => {
  const { source, fetcher } = fixture();
  fetcher.mockResolvedValueOnce(json({ appointments: [row, { ...row, id: 'malformed', patient: { id: ' patient ' } }] }));
  expect(await source().capture(ticket)).toMatchObject({ completeness: 'partial', items: [{ appointment_id: 'appointment' }], failures: [{ appointment_id: 'malformed', code: 'identity_missing' }] });
});
it('rejects a token switch between authenticated operations', async () => {
  const { source, fetcher } = fixture();
  const adapter = source();
  await adapter.readIdentity();
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('JWT=other');
  await expect(adapter.capture(ticket)).rejects.toMatchObject({ code: 'identity_changed' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects session changes during a response and duplicate appointment IDs', async () => {
  const { source, fetcher } = fixture();
  fetcher.mockImplementationOnce(async () => { vi.spyOn(document, 'cookie', 'get').mockReturnValue('JWT=other'); return json({ appointments: [row], persons: [] }); });
  await expect(source().capture(ticket)).rejects.toMatchObject({ code: 'identity_changed' });
  fetcher.mockResolvedValue(json({ appointments: [row, row], persons: [] }));
  await expect(source().capture(ticket)).rejects.toMatchObject({ code: 'invalid_capture' });
});
it('records malformed rows as partial and uses an independent status endpoint', async () => {
  const { source, fetcher } = fixture();
  fetcher.mockResolvedValueOnce(json({ appointments: [row, { ...row, id: 'bad', patient: null }], persons: [] }));
  const adapter = source();
  expect(await adapter.capture(ticket)).toMatchObject({ completeness: 'partial', failures: [{ appointment_id: 'bad', code: 'identity_missing' }] });
  fetcher.mockResolvedValueOnce(json({ ...row, state: { name: ' Cancelled ' } }));
  expect(await adapter.lookupStatus!({ ticket, appointment_ids: ['appointment'] })).toMatchObject({ items: [{ appointment_id: 'appointment', status: 'cancelled' }] });
  expect(String(fetcher.mock.calls[1][0])).toContain('/apigw-rhapsody/appointments/appointment?businessId=business-1');
  fetcher.mockResolvedValueOnce({ ok: false, status: 404 });
  expect(await adapter.lookupStatus!({ ticket, appointment_ids: ['absent'] })).toMatchObject({ items: [{ appointment_id: 'absent', status: 'unknown' }] });
});
it('binds Vetspire to the returned location and never guesses duration units', async () => {
  const binding = { ...identity, provider: 'vetspire' as const, origin: 'https://app.vetspire.com', tenant_id: 'location-1' };
  localStorage.setItem('authToken', 'secret'); localStorage.setItem('__pref-location', 'location-1');
  const { source, fetcher } = fixture(binding);
  fetcher.mockResolvedValue(json({ data: { location: { id: 'location-1' }, appointments: [{ id: 'appointment', start: row.scheduledStartDatetime, duration: 30, patient: { id: 'patient' }, provider: { id: 'vet' } }] } }));
  expect(await source().capture(ticket)).toMatchObject({ items: [{ ends_at: null, clinician_id: 'vet', patient_id: 'patient' }] });
  expect(JSON.parse(fetcher.mock.calls[0][1].body).variables).toEqual({ locationId: 'location-1', start: scope.window_start, end: scope.window_end });
  fetcher.mockResolvedValue(json({ data: { location: { id: 'wrong' }, appointments: [] } }));
  await expect(source().readIdentity()).rejects.toMatchObject({ code: 'identity_changed' });
});
