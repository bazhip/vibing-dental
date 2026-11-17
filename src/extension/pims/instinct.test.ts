import { beforeEach, describe, expect, it, vi } from 'vitest';
import { instinct } from './instinct';
import { dayBounds } from './shared';
import type { AdapterContext } from './types';

const date = '2026-11-16';
const start = new Date(2026, 10, 16, 12).toISOString();
const patient = { id: 'patient-1', nameFirst: 'Bella', nameLast: 'Smith', pimsId: 'P123' };
const provider = { id: 'doctor-1', nameFirst: 'Ada', nameLast: 'Hill' };
const appointment = { __typename: 'CalendarAppointment', id: 'appointment-1', startsAt: start, status: 'ACTIVE', patient, calendar: { provider } };
const visit = { id: 'visit-1', checkInAt: start, checkOutAt: null, scheduledAt: null, patient, assignedTo: provider, user: null };
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

function context(fetcher = vi.fn()): AdapterContext {
  return { doc: document, url: new URL('https://clinic.instinctvet.cloud/#/patient/patient-1/charts?visitId=visit-1'),
    fetch: fetcher, localStorage, sessionStorage, wait: async () => undefined };
}

function requests(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    listActiveUsers: { users: [provider] },
    GetCalendarAppointments: { calendars: [{ date, schedule: [appointment] }] },
    GetVisitPatientBoardList: { activeVisits: [visit], listRecentlyCheckedOutVisits: [] },
    ...overrides,
  };
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => json(data[JSON.parse(String(init?.body)).operationName]));
}

describe('Instinct source-derived adapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="Plan"><div contenteditable="true"><p>Existing</p></div></div>';
    sessionStorage.clear();
    sessionStorage.setItem('instinct:user-state', JSON.stringify({ value: { accessToken: 'secret', practice: { apiUrl: 'https://api.instinctvet.com/graphql' } } }));
  });

  it('derives encounter identity only from the patient charts hash and visitId', () => {
    expect(instinct.status(context())).toMatchObject({ state: 'writable', consult: { recordId: 'visit-1' } });
    for (const hash of ['#/patient/patient-1/charts', '#/patient/patient-1?visitId=visit-1', '#/calendar?visitId=visit-1', '#/patient/patient-1/charts?visitId=visit-1&visitId=visit-2']) {
      const current = context();
      current.url.hash = hash;
      expect(instinct.status(current)).toMatchObject({ state: 'notConsult', consult: null });
    }
  });

  it('discovers visible direct editor wrappers and appends rich HTML without claiming a save', async () => {
    document.body.innerHTML += '<div id="Hidden" hidden><div contenteditable="true"></div></div><div id="Nested"><span><div contenteditable="true"></div></span></div>';
    expect(instinct.listFields(context())).toEqual([{ title: 'Plan', kind: 'note', acceptsImage: false }]);
    expect(await instinct.write({ fieldTitle: 'Plan', html: '<p><strong>New</strong></p>' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
    expect(document.querySelector('#Plan > div')?.innerHTML).toBe('<p>Existing</p><br><p><strong>New</strong></p>');
  });

  it('escapes plain text and removes empty editor placeholders', async () => {
    document.querySelector('#Plan > div')!.innerHTML = '<p class="is-empty is-editor-empty"><br></p>';
    await instinct.write({ fieldTitle: 'Plan', text: '<hello>\nworld' }, context());
    expect(document.querySelector('#Plan > div')?.innerHTML).toBe('&lt;hello&gt;<br>world');
  });

  it('does not report success or emit change when input restores the retained model', async () => {
    const editor = document.querySelector<HTMLElement>('#Plan > div')!;
    const change = vi.fn();
    editor.addEventListener('input', () => { editor.innerHTML = '<p>Existing</p>'; });
    editor.addEventListener('change', change);
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
    expect(editor.innerHTML).toBe('<p>Existing</p>');
    expect(change).not.toHaveBeenCalled();
  });

  it('does not report success when input asynchronously restores the retained model', async () => {
    const editor = document.querySelector<HTMLElement>('#Plan > div')!;
    const change = vi.fn();
    editor.addEventListener('input', () => { queueMicrotask(() => { editor.innerHTML = '<p>Existing</p>'; }); });
    editor.addEventListener('change', change);
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
    expect(editor.innerHTML).toBe('<p>Existing</p>');
    expect(change).not.toHaveBeenCalled();
  });

  it.each(['input', 'change'])('guards navigation during %s before any later event', async (event) => {
    const current = context();
    const editor = document.querySelector<HTMLElement>('#Plan > div')!;
    const change = vi.fn();
    editor.addEventListener(event, () => {
      current.currentUrl = () => new URL('https://clinic.instinctvet.cloud/#/patient/other/charts?visitId=other');
    });
    editor.addEventListener('change', change);
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, current)).toEqual({ ok: false, code: 'patient_changed' });
    expect(change).toHaveBeenCalledTimes(event === 'input' ? 0 : 1);
  });

  it.each(['input', 'change'])('guards editor replacement during %s before any later event', async (event) => {
    const editor = document.querySelector<HTMLElement>('#Plan > div')!;
    const change = vi.fn();
    editor.addEventListener(event, () => {
      editor.outerHTML = '<div contenteditable="true"><p>Replacement</p></div>';
    });
    editor.addEventListener('change', change);
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, context())).toEqual({ ok: false, code: 'editor_not_found' });
    expect(change).toHaveBeenCalledTimes(event === 'input' ? 0 : 1);
    expect(document.querySelector('#Plan > div')?.textContent).toBe('Replacement');
  });

  it('guards navigation queued by an event before returning', async () => {
    const current = context();
    const change = vi.fn();
    document.querySelector('#Plan > div')!.addEventListener('input', () => {
      queueMicrotask(() => { current.currentUrl = () => new URL('https://clinic.instinctvet.cloud/#/patient/other/charts?visitId=other'); });
    });
    document.querySelector('#Plan > div')!.addEventListener('change', change);
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, current)).toEqual({ ok: false, code: 'patient_changed' });
    expect(change).not.toHaveBeenCalled();
  });

  it('rejects images and unknown or ambiguous fields without mutation', async () => {
    expect(await instinct.write({ fieldTitle: 'Plan', pngDataUrl: 'data:image/png;base64,x' }, context())).toEqual({ ok: false, code: 'image_not_accepted' });
    expect(await instinct.write({ fieldTitle: 'Missing', text: 'New' }, context())).toEqual({ ok: false, code: 'field_not_found' });
    document.body.innerHTML += '<div id="Plan"><div contenteditable="true"></div></div>';
    expect((await instinct.write({ fieldTitle: 'Plan', text: 'New' }, context())).ok).toBe(false);
    expect(document.querySelector('#Plan > div')?.textContent).toBe('Existing');
  });

  it('guards navigation before and after awaits', async () => {
    const current = context();
    current.currentUrl = () => new URL('https://clinic.instinctvet.cloud/#/patient/other/charts?visitId=other');
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, current)).toEqual({ ok: false, code: 'patient_changed' });
    current.currentUrl = () => current.url;
    current.wait = async () => { current.currentUrl = () => new URL('https://clinic.instinctvet.cloud/#/patient/other/charts?visitId=other'); };
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, current)).toEqual({ ok: false, code: 'patient_changed' });
    expect(document.querySelector('#Plan > div')?.textContent).toBe('Existing');
  });

  it('guards disconnected editors after awaiting', async () => {
    const current = context();
    const editor = document.querySelector('#Plan > div')!;
    current.wait = async () => { editor.remove(); };
    expect((await instinct.write({ fieldTitle: 'Plan', text: 'New' }, current)).ok).toBe(false);
    expect(editor.textContent).toBe('Existing');
  });

  it('does not write after an editor becomes locked or its wrapper changes', async () => {
    const current = context();
    current.wait = async () => { document.querySelector('#Plan > div')!.setAttribute('contenteditable', 'false'); };
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, current)).toEqual({ ok: false, code: 'editor_not_found' });
    document.querySelector('#Plan > div')!.setAttribute('contenteditable', 'true');
    current.wait = async () => { document.getElementById('Plan')!.id = 'Other'; };
    expect(await instinct.write({ fieldTitle: 'Plan', text: 'New' }, current)).toEqual({ ok: false, code: 'editor_not_found' });
  });

  it('imports ACTIVE appointments and unchecked-out visits only on the selected local day', async () => {
    const fetcher = requests({
      GetCalendarAppointments: { calendars: [{ date, schedule: [appointment, { ...appointment, id: 'cancelled', status: 'CANCELLED' }, { __typename: 'CalendarBlock' }, { ...appointment, id: 'tomorrow', startsAt: dayBounds(date)!.end }] }] },
      GetVisitPatientBoardList: { activeVisits: [visit, { ...visit, id: 'old', checkInAt: '2020-01-01T12:00:00Z' }], listRecentlyCheckedOutVisits: [{ ...visit, id: 'out', checkOutAt: start }] },
    });
    expect(await instinct.listAppointments(date, context(fetcher))).toEqual({ ok: true, failures: [], appointments: [
      { appointmentId: 'appointment-1', start, patientName: 'Bella Smith', patientNumber: 'P123', ownerName: '', vet: 'Ada Hill' },
      { appointmentId: 'visit-1', start, patientName: 'Bella Smith', patientNumber: 'P123', ownerName: '', vet: 'Ada Hill' },
    ] });
    const bodies = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.find((body) => body.operationName === 'GetCalendarAppointments').variables).toEqual({ params: { startDate: date, endDate: date, providerIds: ['doctor-1'] } });
    expect(bodies.find((body) => body.operationName === 'GetVisitPatientBoardList').variables.since).toBe(dayBounds(date)!.start);
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toBe('https://api.instinctvet.com/graphql');
      expect(init).toMatchObject({ redirect: 'error', headers: { authorization: 'Bearer secret' } });
    }
  });

  it.each(['http://api.instinctvet.com/graphql', 'https://evil.test/graphql', 'https://instinctvet.com.evil.test/graphql', 'https://evilinstinctvet.cloud/graphql', 'https://user:pass@api.instinctvet.com/graphql', 'javascript:alert(1)', 'not a URL'])('never sends bearer tokens to an untrusted destination: %s', async (apiUrl) => {
    sessionStorage.setItem('instinct:user-state', JSON.stringify({ value: { accessToken: 'secret', practice: { apiUrl } } }));
    const fetcher = requests();
    expect(await instinct.listAppointments(date, context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { listActiveUsers: { users: {} } },
    { GetCalendarAppointments: { calendars: {} } },
    { GetCalendarAppointments: { calendars: [{ schedule: null }] } },
    { GetCalendarAppointments: { calendars: [{ schedule: [null] }] } },
    { GetVisitPatientBoardList: { activeVisits: {}, listRecentlyCheckedOutVisits: [] } },
    { GetVisitPatientBoardList: { activeVisits: [], listRecentlyCheckedOutVisits: null } },
  ])('fails closed on malformed GraphQL collections: %j', async (overrides) => {
    expect(await instinct.listAppointments(date, context(requests(overrides)))).toEqual({ ok: false, code: 'read_failed' });
  });

  it('reads patient numbers only for the current verified encounter', async () => {
    const fetcher = requests();
    expect(await instinct.patientNumber('visit-1', context(fetcher))).toBe('P123');
    fetcher.mockClear();
    expect(await instinct.patientNumber('other', context(fetcher))).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns real empty results only for verified empty collections', async () => {
    const fetcher = requests({ listActiveUsers: { users: [] }, GetCalendarAppointments: { calendars: [] },
      GetVisitPatientBoardList: { activeVisits: [], listRecentlyCheckedOutVisits: [] } });
    expect(await instinct.listAppointments(date, context(fetcher))).toEqual({ ok: true, appointments: [], failures: [] });
  });

  it.each([
    { ok: false },
    { ok: true, json: async () => ({ errors: [{ message: 'denied' }], data: { users: [] } }) },
    { ok: true, json: async () => ({ data: null }) },
  ])('rejects HTTP and GraphQL failures', async (response) => {
    expect(await instinct.listAppointments(date, context(vi.fn().mockResolvedValue(response)))).toEqual({ ok: false, code: 'read_failed' });
  });

  it('catches rejected requests and malformed session JSON', async () => {
    expect(await instinct.listAppointments(date, context(vi.fn().mockRejectedValue(new TypeError())))).toEqual({ ok: false, code: 'read_failed' });
    sessionStorage.setItem('instinct:user-state', '{');
    const fetcher = requests();
    expect(await instinct.listAppointments(date, context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not return a patient number after navigation during a request', async () => {
    const current = context();
    current.fetch = vi.fn(async () => {
      current.currentUrl = () => new URL('https://clinic.instinctvet.cloud/#/patient/other/charts?visitId=other');
      return json({ activeVisits: [visit], listRecentlyCheckedOutVisits: [] });
    });
    expect(await instinct.patientNumber('visit-1', current)).toBeNull();
  });

  it('rejects invalid dates and missing auth', async () => {
    const fetcher = requests();
    expect(await instinct.listAppointments('2026-02-30', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
    sessionStorage.clear();
    expect(await instinct.listAppointments(date, context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
