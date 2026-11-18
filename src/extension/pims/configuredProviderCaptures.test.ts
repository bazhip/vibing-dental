import { beforeEach, expect, it, vi } from 'vitest';
import { captureDaySmartAppointments, daysmart } from './daysmart';
import { captureShepherdAppointments, shepherd } from './shepherd';
import type { AdapterContext } from './types';

const json = (value: unknown) => ({ ok: true, json: async () => value }) as Response;
function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); }, clear: () => values.clear(), key: index => [...values.keys()][index] ?? null };
}
function context(provider: 'daysmart' | 'shepherd', fetcher = vi.fn()): AdapterContext {
  const local = storage(), session = storage();
  local.setItem('Vetter-Token', 'local-secret'); session.setItem('baasic-auth-token-pav2', '{"token":"session-secret"}');
  return { doc: document, url: new URL(provider === 'daysmart' ? 'https://clinic.vettersoftware.com/schedule' : 'https://app.shepherd.vet/schedule'),
    fetch: fetcher, localStorage: local, sessionStorage: session, wait: async () => undefined };
}
const day = '2026-11-16', start = '2026-11-16T14:00:00Z';
const dsRow = { id: 19, start, patient: { id: 7 }, provider: { id: 3 } };
const dsEnvelope = (value: unknown) => json({ response: { resources: value } });
const soap = { id: 'same', dateCheckedIn: start, patientId: 'soap-patient', supervisingDoctorId: 'doctor-1' };
const appointment = { id: 'same', startDate: start, appointmentPatients: [{ patient: { id: 'appt-patient' } }], provider: { id: 'doctor-2' } };
function shepherdFetch(soaps: unknown[] = [soap], appointments: unknown[] = [appointment]) {
  return vi.fn().mockResolvedValueOnce(json({ item: soaps })).mockResolvedValueOnce(json({ item: [{ id: 'doctor-2' }] })).mockResolvedValueOnce(json({ item: appointments }));
}
beforeEach(() => { document.body.innerHTML = ''; });

it('captures DaySmart raw identifiers without requiring display metadata or exposing session material', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(dsEnvelope([dsRow])).mockResolvedValueOnce(dsEnvelope(dsRow));
  const result = await captureDaySmartAppointments(day, context('daysmart', fetcher));
  expect(result).toEqual({ items: [{ appointment_id: '19', patient_id: '7', clinician_id: '3', encounter_id: null,
    starts_at: new Date(start).toISOString(), ends_at: null, status: 'active' }], failures: [] });
  expect(JSON.stringify(result)).not.toMatch(/secret|Vetter/);
  expect(fetcher.mock.calls[1][0]).toBe('/barramundi/schedule/appointment/19');
});
it('captures explicit DaySmart cancellation, rejects mismatched detail identity and preserves per-row failures', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(dsEnvelope([dsRow, { ...dsRow, id: 20 }]))
    .mockResolvedValueOnce(dsEnvelope({ ...dsRow, status: { value: 'Cancelled' } }))
    .mockResolvedValueOnce(dsEnvelope({ ...dsRow, id: 21 }));
  expect(await captureDaySmartAppointments(day, context('daysmart', fetcher))).toMatchObject({
    items: [{ appointment_id: '19', status: 'cancelled' }], failures: [{ appointment_id: '20', code: 'identity_missing' }],
  });
});
it('only uses newest history cancellation after a successful absent DaySmart detail', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(dsEnvelope([dsRow])).mockResolvedValueOnce(dsEnvelope(null))
    .mockResolvedValueOnce(dsEnvelope([{ title: 'Cancelled' }]));
  expect(await captureDaySmartAppointments(day, context('daysmart', fetcher))).toMatchObject({ items: [{ status: 'cancelled' }], failures: [] });
});
it('does not turn failed DaySmart detail reads into cancellation or absence', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(dsEnvelope([dsRow])).mockResolvedValueOnce({ ok: false });
  expect(await captureDaySmartAppointments(day, context('daysmart', fetcher))).toEqual({ items: [], failures: [{ appointment_id: '19', code: 'read_failed' }] });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('rejects DaySmart session switches during response parsing', async () => {
  const ctx = context('daysmart');
  ctx.fetch = vi.fn(async () => ({ ok: true, json: async () => { ctx.localStorage.setItem('Vetter-Token', 'other'); return { response: { resources: [] } }; } }) as Response);
  await expect(captureDaySmartAppointments(day, ctx)).rejects.toMatchObject({ code: 'identity_changed' });
});
it('captures distinct Shepherd SOAP/appointment namespaces and actual patient/clinician identifiers', async () => {
  const result = await captureShepherdAppointments(day, context('shepherd', shepherdFetch()));
  expect(result).toEqual({ items: [
    { appointment_id: 'soap:same', patient_id: 'soap-patient', clinician_id: 'doctor-1', encounter_id: 'same', starts_at: new Date(start).toISOString(), ends_at: null, status: 'active' },
    { appointment_id: 'appointment:same', patient_id: 'appt-patient', clinician_id: 'doctor-2', encounter_id: null, starts_at: new Date(start).toISOString(), ends_at: null, status: 'active' },
  ], failures: [] });
  expect(JSON.stringify(result)).not.toMatch(/secret|baasic/);
});
it('records malformed Shepherd identities separately and keeps explicit cancellations without inferring absent rows', async () => {
  const fetcher = shepherdFetch([{ ...soap, supervisingDoctorId: undefined }], [{ ...appointment, appointmentStatus: { abrv: 'canceled' } }]);
  expect(await captureShepherdAppointments(day, context('shepherd', fetcher))).toMatchObject({
    items: [{ appointment_id: 'appointment:same', status: 'cancelled' }], failures: [{ appointment_id: 'soap:same', code: 'identity_missing' }],
  });
});
it('refuses ambiguous multiple-patient Shepherd appointments rather than guessing a patient link', async () => {
  const fetcher = shepherdFetch([], [{ ...appointment, appointmentPatients: [{ patient: { id: 'one' } }, { patient: { id: 'two' } }] }]);
  expect(await captureShepherdAppointments(day, context('shepherd', fetcher))).toEqual({ items: [], failures: [{ appointment_id: 'appointment:same', code: 'identity_missing' }] });
});
it('rejects Shepherd user switches during a provider body read', async () => {
  const ctx = context('shepherd');ctx.sessionStorage.setItem('baasic-user-info-pav2', '{"id":"one"}');
  ctx.fetch = vi.fn().mockResolvedValueOnce(json({ item: [] })).mockResolvedValueOnce({ ok: true, json: async () => { ctx.sessionStorage.setItem('baasic-user-info-pav2','{"id":"two"}'); return { item: [] }; } });
  await expect(captureShepherdAppointments(day, ctx)).rejects.toMatchObject({ code: 'identity_changed' });
});
it.each(['daysmart','shepherd'] as const)('rejects invalid capture dates and wrong origins for %s', async provider => {
  const capture = provider === 'daysmart' ? captureDaySmartAppointments : captureShepherdAppointments;
  const ctx=context(provider);
  await expect(capture('invalid',ctx)).rejects.toMatchObject({code:'invalid_capture'});
  ctx.url=new URL('https://evil.example/');
  await expect(capture(day,ctx)).rejects.toMatchObject({code:'invalid_capture'});
  expect(ctx.fetch).not.toHaveBeenCalled();
});
it('prefers a fresh DaySmart scheduled status over a stale canceled feed row', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(dsEnvelope([{ ...dsRow, status: { value: 'Cancelled' } }]))
    .mockResolvedValueOnce(dsEnvelope({ ...dsRow, status: { value: 'Scheduled' } }));
  expect(await captureDaySmartAppointments(day, context('daysmart', fetcher))).toMatchObject({ items: [{ status: 'active' }], failures: [] });
});
it.each(['daysmart','shepherd'] as const)('rejects duplicate raw appointment IDs in %s capture', async provider => {
  const fetcher = provider === 'daysmart'
    ? vi.fn().mockResolvedValueOnce(dsEnvelope([dsRow, dsRow])).mockResolvedValueOnce(dsEnvelope(dsRow))
    : shepherdFetch([soap, soap], []);
  await expect((provider === 'daysmart' ? captureDaySmartAppointments : captureShepherdAppointments)(day, context(provider, fetcher)))
    .rejects.toMatchObject({ code: 'invalid_capture' });
});
it('does not mistake Shepherd missing/deleted rows for an active feed item', async () => {
  const fetcher = shepherdFetch([], [{ ...appointment, isDeleted: true }]);
  expect(await captureShepherdAppointments(day, context('shepherd', fetcher))).toMatchObject({ items: [{ status: 'deleted' }], failures: [] });
});

it.each(['daysmart','shepherd'] as const)('connects %s capture to the explicit configured-practice sync contract', async provider => {
  const fetcher = provider === 'daysmart' ? vi.fn().mockResolvedValueOnce(dsEnvelope([dsRow])).mockResolvedValueOnce(dsEnvelope(dsRow)) : shepherdFetch();
  const ctx = context(provider,fetcher), adapter = provider === 'daysmart' ? daysmart : shepherd;
  const binding = { provider, origin: ctx.url.origin, tenant_id: 'owner-configured-clinic', connection_revision: 2 };
  expect(adapter.syncSource).toBeTypeOf('function');
  const unconfirmed = adapter.syncSource!(ctx,binding);
  await expect(unconfirmed.readIdentity()).rejects.toMatchObject({code:'identity_changed'});
  expect(fetcher).not.toHaveBeenCalled();
  const source=adapter.syncSource!(ctx,binding,{userConfirmed:true});
  expect(await source.readIdentity()).toEqual(binding);
  const { dayBounds } = await import('./shared'); const bounds=dayBounds(day)!;
  const result=await source.capture({ id:'run', connection_id:'connection',connection_revision:2,generation:1,state:'capturing',
    started_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),
    scope:{ requested_date:day,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,window_start:bounds.start,window_end:bounds.end} });
  expect(result.identity).toEqual(binding); expect(result.items.length).toBe(provider==='daysmart'?1:2);
  expect(result.completeness).toBe('unknown');
});
