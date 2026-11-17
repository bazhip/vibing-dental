import { beforeEach, describe, expect, it, vi } from 'vitest';
import { daysmart } from './daysmart';
import type { AdapterContext } from './types';

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }, key: (index) => [...values.keys()][index] ?? null };
}
const localStorage = storage();
const sessionStorage = storage();
const json = (value: unknown) => ({ ok: true, json: async () => value }) as Response;
function context(fetcher = vi.fn()): AdapterContext {
  return { doc: document, url: new URL('https://clinic.vettersoftware.com/view/patient/soap/42'),
    fetch: fetcher, localStorage, sessionStorage, wait: async () => undefined };
}
function editor(saved = false) {
  document.body.innerHTML = `<section class="soap_section"><h4>Plan</h4><div class="form_template_component"><div class="row-fluid"><span class="form_category_label">Dental</span></div><div class="form_template_subcomponent"><form><label>Notes${saved ? ' (changes saved)' : ''}</label><textarea>Existing</textarea></form></div></div></section>`;
  return document.querySelector('textarea')!;
}

describe('DaySmart static-source adapter', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); });

  it('discovers grouped titles, strips saved markers, and requires route confirmation', () => {
    editor(true);
    expect(daysmart.listFields(context())).toEqual([{ title: 'Plan > Dental > Notes', kind: 'note', acceptsImage: false }]);
    expect(daysmart.status(context())).toMatchObject({ state: 'writable', patientName: null, consult: { recordId: '42' } });
    expect(daysmart.status({ ...context(), url: new URL('https://clinic.vettersoftware.com/patients/42') }).state).toBe('notConsult');
  });

  it('appends through the native setter and observes a fresh saved label', async () => {
    const input = editor();
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    const ctx = context();
    ctx.wait = async () => { document.querySelector('label')!.textContent = 'Notes (changes saved)'; };
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, ctx)).toEqual({ ok: true });
    expect(input.value).toBe('Existing\nNew');
    expect(events).toEqual(['input', 'change']);
  });

  it('never equates dispatched events or an old saved marker with persistence', async () => {
    editor(true);
    expect(await daysmart.write({ fieldTitle: 'Plan > Dental > Notes', text: 'New' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
  });
  it('does not accept focus saving the previous content as acknowledgement of the new note', async () => {
    const input = editor();
    input.addEventListener('focus', () => { document.querySelector('label')!.textContent = 'Notes (changes saved)'; });
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
  });

  it('does not confirm a saved label if the application reverted the editor value', async () => {
    const input = editor();
    const ctx = context();
    ctx.wait = async () => {
      input.value = 'Existing';
      document.querySelector('label')!.textContent = 'Notes (changes saved)';
    };
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, ctx)).toEqual({ ok: false, code: 'save_not_confirmed' });
  });

  it('checks the route after focus and editor connectivity after awaits', async () => {
    const input = editor();
    let current = context().url;
    const ctx = { ...context(), currentUrl: () => current };
    input.addEventListener('focus', () => { current = new URL('https://clinic.vettersoftware.com/view/patient/soap/43'); });
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, ctx)).toEqual({ ok: false, code: 'patient_changed' });
    expect(input.value).toBe('Existing');
    const replacement = editor();
    current = ctx.url;
    ctx.wait = async () => { replacement.remove(); };
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, ctx)).toEqual({ ok: false, code: 'not_writable' });
  });

  it('lists ungrouped forms and preserves a single trailing label colon', () => {
    document.body.innerHTML = '<section class="soap_section"><h4>Assessment</h4><form><label>Diagnosis::: (changes saved)</label><textarea></textarea></form></section>';
    expect(daysmart.listFields(context())).toEqual([{ title: 'Assessment > Diagnosis:', kind: 'note', acceptsImage: false }]);
  });

  it.each(['readonly', 'disabled', 'hidden'])('refuses %s editors without mutation', async (attribute) => {
    const input = editor();
    input.setAttribute(attribute, '');
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, context())).toEqual({ ok: false, code: 'not_writable' });
    expect(input.value).toBe('Existing');
  });

  it('rejects images and duplicate ambiguous titles', async () => {
    editor();
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', pngDataUrl: 'data:image/png;base64,a' }, context())).toEqual({ ok: false, code: 'image_not_accepted' });
    document.querySelector('.soap_section')!.append(document.querySelector('form')!.cloneNode(true));
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, context())).toEqual({ ok: false, code: 'field_not_found' });
  });

  it('guards route/provider changes before writing and after each await', async () => {
    const input = editor();
    const ctx = context();
    ctx.currentUrl = () => new URL('https://app.shepherd.vet/view/patient/soap/42');
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, ctx)).toEqual({ ok: false, code: 'patient_changed' });
    expect(input.value).toBe('Existing');
    let current = ctx.url;
    ctx.currentUrl = () => current;
    ctx.wait = async () => { current = new URL('https://clinic.vettersoftware.com/view/patient/soap/43'); };
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, ctx)).toEqual({ ok: false, code: 'patient_changed' });
  });

  it('rechecks after synchronous events and detached editors', async () => {
    const input = editor();
    let changes = 0;
    input.addEventListener('input', () => input.remove());
    input.addEventListener('change', () => changes++);
    expect(await daysmart.write({ fieldTitle: 'Plan > Notes', text: 'New' }, context())).toEqual({ ok: false, code: 'not_writable' });
    expect(changes).toBe(0);
  });

  it('imports array resources, excludes cancellations, and fetches providers by appointment', async () => {
    localStorage.setItem('Vetter-Token', 'secret');
    const row = { id: 1, start: '2026-11-16T14:00:00Z', patient: { id: 2, name: 'Bella', index: 77 }, client: { firstname: 'Ada', lastname: 'Smith' } };
    const fetcher = vi.fn().mockResolvedValueOnce(json({ response: { resources: [row, { ...row, id: 3, status: { value: 'Canceled' } }] } }))
      .mockResolvedValueOnce(json({ response: { resources: { provider: { display_name: ' Dr Hill ' } } } }));
    expect(await daysmart.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, failures: [], appointments: [
      { appointmentId: '1', start: '2026-11-16T14:00:00.000Z', patientName: 'Bella Smith', patientNumber: '77', ownerName: 'Ada Smith', vet: 'Dr Hill' },
    ] });
    const request = new URL(fetcher.mock.calls[0][0], context().url);
    expect(request.pathname).toBe('/barramundi/schedule/appointment');
    for (const key of ['location', 'client', 'patient', 'staff', 'provider']) expect(request.searchParams.get(key)).toBe('true');
    expect(Date.parse(request.searchParams.get('end')!) - Date.parse(request.searchParams.get('start')!)).toBe(86_399_999);
    expect(fetcher.mock.calls[0][1].headers['vetter-token']).toBe('secret');
    expect(fetcher.mock.calls[1][0]).toBe('/barramundi/schedule/appointment/1');
  });

  it('accepts singleton resources and absent optional token without fabricating identity', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ response: { resources: { id: 'one', start: '2026-11-16T14:00:00Z', patient: { name: 'Bella' }, client: {} } } }));
    expect(await daysmart.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true, appointments: [{ patientNumber: '', vet: null }] });
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('vetter-token');
    expect(await daysmart.patientNumber('42', context())).toBeNull();
  });

  it('fails closed on invalid dates, hosts, response shapes and failed requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ response: {} }));
    expect(await daysmart.listAppointments('2026-02-30', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await daysmart.listAppointments('2026-11-16', { ...context(fetcher), url: new URL('https://evil.test/') })).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await daysmart.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
  });

  it('refuses stale contexts before sending optional credentials', async () => {
    localStorage.setItem('Vetter-Token', 'secret');
    const fetcher = vi.fn().mockResolvedValue(json({ response: { resources: [] } }));
    const ctx = { ...context(fetcher), currentUrl: () => new URL('https://evil.test/') };
    expect(await daysmart.listAppointments('2026-11-16', ctx)).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('distinguishes an empty feed from an invalid resource object', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ response: { resources: { message: 'login' } } }))
      .mockResolvedValueOnce(json({ response: { resources: [] } }));
    expect(await daysmart.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(await daysmart.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, appointments: [], failures: [] });
  });

  it('reports malformed array rows rather than a successful empty schedule', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ response: { resources: [null, { message: 'invalid row' }] } }));
    expect(await daysmart.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, appointments: [],
      failures: [{ code: 'invalid_appointment', startsAt: null }, { code: 'invalid_appointment', startsAt: null }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([null, undefined, [], 'invalid', 42])('reports malformed patient or client relations: %j', async (relation) => {
    const row = { id: 'one', start: '2026-11-16T14:00:00Z', patient: { name: 'Bella' }, client: {} };
    const fetcher = vi.fn().mockResolvedValue(json({ response: { resources: [{ ...row, patient: relation }, { ...row, client: relation }] } }));
    expect(await daysmart.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, appointments: [],
      failures: [{ code: 'invalid_appointment', startsAt: null }, { code: 'invalid_appointment', startsAt: null }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('reports malformed appointments and unavailable provider details without invented values', async () => {
    const row = { id: 'one', start: '2026-11-16T14:00:00Z', patient: { name: 'Bella' }, client: {} };
    const fetcher = vi.fn().mockResolvedValueOnce(json({ response: { resources: [row, { ...row, start: 'bad' }] } }))
      .mockResolvedValueOnce({ ok: false });
    expect(await daysmart.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true,
      appointments: [{ patientNumber: '', vet: null }], failures: [{ code: 'tooltip_fetch_failed' }, { code: 'invalid_appointment' }],
    });
  });
});
