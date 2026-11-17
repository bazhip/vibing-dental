import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rhapsody } from './rhapsody';
import type { AdapterContext } from './types';

function context(fetcher = vi.fn()): AdapterContext {
  return { doc: document, url: new URL('https://clinic.rhapsody.vet/schedule?businessId=clinic%2Fone'), fetch: fetcher,
    localStorage, sessionStorage, wait: async () => undefined };
}

const json = (value: unknown) => ({ ok: true, json: async () => value }) as Response;
const start = new Date(2026, 10, 16, 9).toISOString();
const person = { id: 'vet-1', firstName: 'Ada', lastName: 'Hill' };
const appointment = {
  id: 12, scheduledStartDatetime: start, patient: { id: 22, name: 'Bella' },
  client: { firstName: 'Grace', lastName: 'Smith' }, personRoles: [{ personId: 'vet-1' }], state: { name: 'Scheduled' },
};
const payload = (appointments: unknown[] = [appointment]) => ({ appointments, persons: [person] });

describe('Rhapsody source-derived import', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('other=ignored; JWT=token.with=padding; businessId=wrong');
  });

  it.each(['unchanged', 'tenant', 'patient', 'encounter', 'navigation', 'auth'])(
    'keeps schedule and CKEditor metadata insufficient for export authority (%s)', async (change) => {
      const fetcher = vi.fn().mockResolvedValue(json(payload()));
      const ctx = context(fetcher);
      expect(await rhapsody.listAppointments('2026-11-16', ctx)).toMatchObject({
        ok: true, appointments: [{ appointmentId: '12', patientNumber: '22' }],
      });
      document.body.innerHTML = '<button role="tab" aria-selected="true">Medical notes</button><button role="tab">Discharge notes</button><div class="ck-editor__editable" contenteditable="true" data-patient-id="22" data-encounter-id="12">Existing medical note</div><textarea>Untouched discharge note</textarea>';
      const insertContent = vi.fn();
      const getData = vi.fn(() => '<p>Existing medical note</p>');
      Object.assign(document.querySelector('.ck-editor__editable')!, {
        ckeditorInstance: { id: 'patient-22-encounter-12', state: 'ready', getData, model: { insertContent } },
      });
      const current = new URL('https://clinic.rhapsody.vet/patients/22/encounters/12?businessId=clinic%2Fone');
      if (change === 'tenant') current.searchParams.set('businessId', 'other-clinic');
      if (change === 'patient') current.pathname = '/patients/other/encounters/12';
      if (change === 'encounter') current.pathname = '/patients/22/encounters/other';
      if (change === 'navigation') current.pathname = '/login';
      if (change === 'auth') vi.spyOn(document, 'cookie', 'get').mockReturnValue('JWT=');
      ctx.currentUrl = () => current;
      const before = document.body.innerHTML;
      const tab = vi.spyOn(document.querySelector('button')!, 'click');
      const requestCount = fetcher.mock.calls.length;
      fetcher.mockResolvedValue(json({ success: true }));
      expect(rhapsody.status(ctx)).toMatchObject({ state: 'notConsult', consult: null });
      for (const fieldTitle of ['Medical notes', 'Discharge notes']) {
        expect(await rhapsody.write({ fieldTitle, text: 'New note' }, ctx)).toEqual({ ok: false, code: 'not_writable' });
      }
      expect(document.body.innerHTML).toBe(before);
      expect(fetcher).toHaveBeenCalledTimes(requestCount);
      expect(tab).not.toHaveBeenCalled();
      expect(insertContent).not.toHaveBeenCalled();
      expect(getData).not.toHaveBeenCalled();
    },
  );

  it('uses the same-origin schedules endpoint, query business and JWT cookie', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(payload()));
    expect(await rhapsody.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, failures: [], appointments: [
      { appointmentId: '12', start, patientName: 'Bella Smith', patientNumber: '22', ownerName: 'Grace Smith', vet: 'Ada Hill' },
    ] });
    const [input, init] = fetcher.mock.calls[0];
    const url = new URL(input);
    expect(url.origin).toBe('https://clinic.rhapsody.vet');
    expect(url.pathname).toBe('/apigw-rhapsody/v2/schedules');
    expect(Object.fromEntries(url.searchParams)).toEqual({ businessId: 'clinic/one', date: '2026-11-16', language: 'en-US', showOtcSaleEvents: 'false' });
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin' });
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token.with=padding');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('filters exact cancelled states and local-day boundaries, preserving full patient names', async () => {
    const rows = [
      { ...appointment, id: 1, state: { name: 'No show' } },
      { ...appointment, id: 2, state: { name: 'Cancelled' } },
      { ...appointment, id: 3, scheduledStartDatetime: new Date(2026, 10, 17).toISOString() },
      { ...appointment, id: 4, scheduledStartDatetime: new Date(2026, 10, 15, 23, 59, 59).toISOString() },
      { ...appointment, id: 5, patient: { id: 22, name: 'Bella Jones' }, state: { name: 'Cancelled pending' }, scheduledStartDatetime: new Date(2026, 10, 16).toISOString() },
    ];
    const result = await rhapsody.listAppointments('2026-11-16', context(vi.fn().mockResolvedValue(json(payload(rows)))));
    expect(result).toMatchObject({ ok: true, failures: [], appointments: [{ appointmentId: '5', patientName: 'Bella Jones' }] });
    if (result.ok) expect(result.appointments).toHaveLength(1);
  });

  it('uses only the first provider role and reports unresolvable rows instead of silently dropping them', async () => {
    const rows = [
      null, {}, { ...appointment, scheduledStartDatetime: 'invalid' }, { ...appointment, patient: { name: 'Bella' } },
      { ...appointment, patient: { id: 22, name: '' } }, { ...appointment, id: '' },
      { ...appointment, personRoles: [] },
      { ...appointment, personRoles: [{ personId: 'missing' }, { personId: 'vet-1' }] },
    ];
    const result = await rhapsody.listAppointments('2026-11-16', context(vi.fn().mockResolvedValue(json(payload(rows)))));
    expect(result).toMatchObject({ ok: true, appointments: [] });
    if (result.ok) {
      expect(result.failures).toHaveLength(rows.length);
      expect(result.failures.every((failure) => failure.code === 'invalid_appointment')).toBe(true);
      expect(result.failures[2].startsAt).toBeNull();
      expect(result.failures[3].startsAt).toBe(start);
    }
  });

  it.each([null, [], {}, { appointments: [] }, { appointments: {}, persons: [] }, { appointments: [], persons: {} },
    { appointments: [], persons: [null] }, { appointments: [], persons: [{ id: 'vet-1', firstName: {} }] },
  ])('rejects malformed envelopes without empty success: %j', async (value) => {
    expect(await rhapsody.listAppointments('2026-11-16', context(vi.fn().mockResolvedValue(json(value))))).toEqual({ ok: false, code: 'read_failed' });
  });

  it('allows a genuinely empty schedule', async () => {
    expect(await rhapsody.listAppointments('2026-11-16', context(vi.fn().mockResolvedValue(json({ appointments: [], persons: [] }))))).toEqual({ ok: true, appointments: [], failures: [] });
  });

  it.each(['2026-02-30T09:00:00Z', '11/16/2026', '12', '2026-11-16T24:00:00Z'])('reports malformed appointment dates instead of silently excluding them: %s', async (scheduledStartDatetime) => {
    const fetcher = vi.fn().mockResolvedValue(json(payload([{ ...appointment, scheduledStartDatetime }])));
    expect(await rhapsody.listAppointments('2026-11-16', context(fetcher))).toEqual({
      ok: true, appointments: [], failures: [{ code: 'invalid_appointment', startsAt: null }],
    });
  });

  it.each(['bad', '2026-02-30', '2026-13-01', '2026-11-16T00:00:00Z'])('rejects invalid dates before fetching: %s', async (date) => {
    const fetcher = vi.fn();
    expect(await rhapsody.listAppointments(date, context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires a nonempty JWT cookie and businessId query, not storage fallbacks', async () => {
    const fetcher = vi.fn();
    const ctx = context(fetcher);
    ctx.url.search = '';
    expect(await rhapsody.listAppointments('2026-11-16', ctx)).toEqual({ ok: false, code: 'read_failed' });
    vi.spyOn(document, 'cookie', 'get').mockReturnValue('notJWT=token; JWT=');
    expect(await rhapsody.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports HTTP, network and JSON failures', async () => {
    for (const fetcher of [vi.fn().mockResolvedValue({ ok: false }), vi.fn().mockRejectedValue(new TypeError()),
      vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError(); } })]) {
      expect(await rhapsody.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    }
  });

  it('discovers only source-backed tabs without treating CKEditor metadata as encounter identity', async () => {
    document.body.innerHTML = '<button role="tab"> Medical notes </button><button role="tab">Discharge notes</button><button role="tab">Other</button><div class="ck-editor__editable" contenteditable="true">Existing</div>';
    Object.assign(document.querySelector('.ck-editor__editable')!, { ckeditorInstance: { id: 'patient-22-encounter-12' } });
    const fetcher = vi.fn();
    const ctx = context(fetcher);
    expect(rhapsody.id).toBe('rhapsody');
    expect(rhapsody.listFields(ctx)).toEqual([
      { title: 'Medical notes', kind: 'note', acceptsImage: false },
      { title: 'Discharge notes', kind: 'note', acceptsImage: false },
    ]);
    expect(rhapsody.status(ctx)).toEqual({ state: 'notConsult', patientName: null, patientNumber: null, consult: null });
    expect(await rhapsody.write({ fieldTitle: 'Medical notes', text: 'New' }, ctx)).toEqual({ ok: false, code: 'not_writable' });
    expect(await rhapsody.patientNumber('12', ctx)).toBeNull();
    expect(document.querySelector('.ck-editor__editable')?.textContent).toBe('Existing');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
