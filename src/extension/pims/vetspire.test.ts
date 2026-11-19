import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vetspire } from './vetspire';
import { dayBounds } from './shared';
import type { AdapterContext } from './types';

const date = '2026-11-16';
const start = new Date(2026, 10, 16, 12).toISOString();
const appointment = { id: 'appointment-1', start, patient: { id: 'patient-1', name: 'Bella' }, provider: { id: 'doctor-1', name: 'Ada Hill' } };
const json = (data: unknown) => ({ ok: true, json: async () => ({ data }) }) as Response;
function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
}
const localStorage = storage();
const sessionStorage = storage();
function context(fetcher = vi.fn(), host = 'app.vetspire.com'): AdapterContext {
  return { doc: document, url: new URL(`https://${host}/patients/patient-1/encounters/encounter-1`), fetch: fetcher,
    localStorage, sessionStorage, wait: async () => undefined };
}

describe('Vetspire source-derived adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="sectionContainer"><div id="Plan"><div class="ql-editor" contenteditable="true">Existing</div></div><div id="History"><div>Add Note</div></div><div id="Empty"></div></div>';
    localStorage.clear();
    localStorage.setItem('authToken', 'secret');
    localStorage.setItem('__pref-location', 'clinic-1');
  });

  it.each(['unchanged', 'tenant', 'patient', 'encounter', 'navigation', 'auth'])(
    'keeps appointment and Quill metadata insufficient for export authority (%s)', async (change) => {
      const fetcher = vi.fn().mockResolvedValue(json({ appointments: [appointment], location: { providers: [appointment.provider] } }));
      const ctx = context(fetcher);
      expect(await vetspire.listAppointments(date, ctx)).toMatchObject({
        ok: true, appointments: [{ appointmentId: 'appointment-1', patientNumber: 'patient-1' }],
      });
      document.querySelector('#sectionContainer')?.setAttribute('data-patient-id', 'patient-1');
      document.querySelector('#Plan')?.setAttribute('data-encounter-id', 'appointment-1');
      const current = new URL(ctx.url.href);
      if (change === 'tenant') localStorage.setItem('__pref-location', 'other-clinic');
      if (change === 'patient') current.pathname = '/patients/other/encounters/encounter-1';
      if (change === 'encounter') current.pathname = '/patients/patient-1/encounters/other';
      if (change === 'navigation') current.pathname = '/login';
      if (change === 'auth') localStorage.removeItem('authToken');
      ctx.currentUrl = () => current;
      const before = document.body.innerHTML;
      const addNote = vi.spyOn(document.querySelector('#History > div')! as HTMLElement, 'click');
      const dispatch = vi.spyOn(document.querySelector('.ql-editor')!, 'dispatchEvent');
      const requestCount = fetcher.mock.calls.length;
      fetcher.mockResolvedValue(json({ success: true }));
      expect(vetspire.status(ctx)).toMatchObject({ state: 'notConsult', consult: null });
      for (const fieldTitle of ['Plan', 'History']) {
        expect(await vetspire.write({ fieldTitle, text: 'New note' }, ctx)).toEqual({ ok: false, code: 'not_writable' });
      }
      expect(document.body.innerHTML).toBe(before);
      expect(fetcher).toHaveBeenCalledTimes(requestCount);
      expect(addNote).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it('discovers Quill and Add Note fields but never guesses encounter identity', async () => {
    expect(vetspire.listFields(context())).toEqual([{ title: 'Plan', kind: 'note', acceptsImage: false }, { title: 'History', kind: 'note', acceptsImage: false }]);
    expect(vetspire.status(context())).toMatchObject({ state: 'notConsult', consult: null });
    const before = document.body.innerHTML;
    expect(await vetspire.write({ fieldTitle: 'Plan', html: '<p>New</p>' }, context())).toEqual({ ok: false, code: 'not_writable' });
    expect(document.body.innerHTML).toBe(before);
    expect(await vetspire.patientNumber('encounter-1', context())).toBeNull();
  });

  it.each([
    ['app.vetspire.com', 'https://api2.vetspire.com/graphql'],
    ['sandbox.vetspire.com', 'https://api.sandbox.vetspire.com/graphql'],
    ['clinic-sandbox.vetspire.com', 'https://api.sandbox.vetspire.com/graphql'],
    ['staging.vetspire.com', 'https://api.staging.vetspire.com/graphql'],
  ])('uses the exact source endpoint for %s and local day bounds', async (host, endpoint) => {
    const fetcher = vi.fn().mockResolvedValue(json({ appointments: [appointment], location: { providers: [appointment.provider] } }));
    expect(await vetspire.listAppointments(date, context(fetcher, host))).toEqual({ ok: true, failures: [], appointments: [
      { appointmentId: 'appointment-1', start, patientName: 'Bella', patientNumber: 'patient-1', ownerName: '', vet: 'Ada Hill' },
    ] });
    expect(fetcher.mock.calls[0][0]).toBe(endpoint);
    const init = fetcher.mock.calls[0][1];
    expect(init).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer secret' } });
    expect(JSON.parse(init.body)).toMatchObject({ operationName: 'getAppointments', variables: { locationId: 'clinic-1', ...dayBounds(date) } });
    expect(JSON.parse(init.body).query).toContain('providers(onlyActive: true, isVeterinarian: true)');
  });

  it.each([
    { appointments: {}, location: { providers: [] } },
    { appointments: [], location: { providers: {} } },
    { appointments: [] },
    { appointments: [null], location: { providers: [] } },
  ])('does not report malformed responses as an empty success: %j', async (data) => {
    const fetcher = vi.fn().mockResolvedValue(json(data));
    expect(await vetspire.listAppointments(date, context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
  });

  it('accepts verified empty collections and filters outside the selected local date', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ appointments: [{ ...appointment, start: dayBounds(date)!.end }], location: { providers: [] } }));
    expect(await vetspire.listAppointments(date, context(fetcher))).toEqual({ ok: true, appointments: [], failures: [] });
  });

  it('refuses invalid dates, missing auth/location and foreign page hosts without requests', async () => {
    const fetcher = vi.fn();
    expect(await vetspire.listAppointments('2026-02-30', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(await vetspire.listAppointments(date, context(fetcher, 'evil.test'))).toEqual({ ok: false, code: 'read_failed' });
    localStorage.removeItem('__pref-location');
    expect(await vetspire.listAppointments(date, context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    localStorage.clear();
    expect(await vetspire.listAppointments(date, context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { ok: false },
    { ok: true, json: async () => ({ errors: [{ message: 'denied' }], data: { appointments: [], location: { providers: [] } } }) },
    { ok: true, json: async () => ({ data: null }) },
  ])('rejects HTTP and GraphQL failures', async (response) => {
    expect(await vetspire.listAppointments(date, context(vi.fn().mockResolvedValue(response)))).toEqual({ ok: false, code: 'read_failed' });
  });

  it('catches rejected requests', async () => {
    expect(await vetspire.listAppointments(date, context(vi.fn().mockRejectedValue(new TypeError())))).toEqual({ ok: false, code: 'read_failed' });
  });
});
