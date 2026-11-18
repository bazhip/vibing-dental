import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createShepherdPhysicalExam, shepherd } from './shepherd';
import type { AdapterContext } from './types';
import { appointmentAction } from '../../utils/pims/appointmentCharts';

function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); }, key: (index) => [...values.keys()][index] ?? null };
}
const localStorage = storage();
const sessionStorage = storage();
const recordId = '12345678-1234-1234-1234-123456789abc';
const json = (value: unknown) => ({ ok: true, json: async () => value }) as Response;
function context(fetcher = vi.fn()): AdapterContext {
  return { doc: document, url: new URL(`https://app.shepherd.vet/soap/${recordId}`), fetch: fetcher,
    localStorage, sessionStorage, wait: async () => undefined };
}
function fixedEditor() {
  document.body.innerHTML = '<div data-test-id="soap-medication-history-field"><div class="ProseMirror" contenteditable="true"><p>Existing</p></div></div><button data-test-id="soap-subjective-save-btn">Save</button><div id="root"></div>';
  return document.querySelector<HTMLElement>('.ProseMirror')!;
}
function clipboard() {
  class Transfer {
    values = new Map<string, string>();
    setData(type: string, value: string) { this.values.set(type, value); }
    getData(type: string) { return this.values.get(type) ?? ''; }
  }
  class Paste extends Event {
    clipboardData: Transfer;
    constructor(type: string, init: EventInit & { clipboardData: Transfer }) { super(type, init); this.clipboardData = init.clipboardData; }
  }
  vi.stubGlobal('DataTransfer', Transfer);
  vi.stubGlobal('ClipboardEvent', Paste);
}

describe('Shepherd explicit physical exam preparation', () => {
  const examId = 'aaaaaaaa-1234-1234-1234-123456789abc';
  let current: URL;
  let clicks = vi.fn<() => void>();
  function fixture(doctor = 'Dr Rivera'): AdapterContext {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"secret"}');
    document.body.innerHTML = `<div data-test-id="soap-physicalExam-doctor-control"><span class="react-select__single-value">${doctor}</span></div>
      <button data-test-groupid="soap-phyiscalExam"><span data-test-id="soap-physicalExam-name">Dental</span></button>`;
    current = context().url;
    clicks = vi.fn(() => {
      current = new URL(`${context().url.href}/objective/physical-exam-entry/edit/${examId}`);
      document.body.insertAdjacentHTML('beforeend', '<div data-test-id="dynamic-form-element"><label class="form__group__label">Mouth</label><textarea></textarea></div>');
    });
    document.querySelector('button')!.addEventListener('click', clicks);
    return { ...context(), currentUrl: () => current };
  }
  beforeEach(() => { document.body.innerHTML = ''; sessionStorage.clear(); });

  it('opens the exact enabled template with the existing selected doctor, without claiming persistence', async () => {
    const ctx = fixture();
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: true, state: 'opened', recordId, examId });
    expect(clicks).toHaveBeenCalledOnce();
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  it.each(['', '   '])('never selects an arbitrary doctor when the selection is %j', async doctor => {
    const ctx = fixture(doctor);
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'supervising_doctor_not_set' });
    expect(clicks).not.toHaveBeenCalled();
  });

  it('rejects duplicate, missing and disabled templates', async () => {
    const ctx = fixture();
    document.querySelector('button')!.classList.add('is-disabled');
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'physical_exam_template_not_found' });
    document.querySelector('button')!.classList.remove('is-disabled');
    document.body.append(document.querySelector('button')!.cloneNode(true));
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'physical_exam_template_not_found' });
    expect(await createShepherdPhysicalExam('Other', ctx)).toEqual({ ok: false, code: 'physical_exam_template_not_found' });
    expect(clicks).not.toHaveBeenCalled();
  });

  it('does not mistake old dynamic fields or an unchanged route for a created exam', async () => {
    const ctx = fixture();
    document.querySelector('button')!.removeEventListener('click', clicks);
    document.body.insertAdjacentHTML('beforeend', '<div data-test-id="dynamic-form-element"><textarea></textarea></div>');
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
  });

  it('rejects stale contexts and changed sessions before clicking', async () => {
    const ctx = fixture();
    current = new URL('https://app.shepherd.vet/soap/bbbbbbbb-1234-1234-1234-123456789abc');
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'patient_changed' });
    expect(clicks).not.toHaveBeenCalled();
    current = ctx.url;
    sessionStorage.clear();
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'not_writable' });
    expect(clicks).not.toHaveBeenCalled();
  });

  it('checks SOAP identity and session again after template activation', async () => {
    const ctx = fixture();
    document.querySelector('button')!.addEventListener('click', () => { sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"other"}'); });
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(clicks).toHaveBeenCalledOnce();
  });

  it('opens the evidenced picker but never retries template activation after an unknown outcome', async () => {
    const ctx = fixture();
    const picker = document.body.innerHTML;
    document.body.innerHTML = '<button data-test-id="soap-objective-addPhysicalExam-btn">Add</button>';
    const add = vi.fn(() => { document.body.innerHTML = picker; });
    document.querySelector('button')!.addEventListener('click', add);
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(add).toHaveBeenCalledOnce();
  });

  it('requires a live route observer before initiating creation', async () => {
    const ctx = fixture();
    delete ctx.currentUrl;
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'not_writable' });
    expect(clicks).not.toHaveBeenCalled();
  });

  it('does not reuse pre-existing fields as readback even if the edit route changes', async () => {
    const ctx = fixture();
    document.querySelector('button')!.removeEventListener('click', clicks);
    document.body.insertAdjacentHTML('beforeend', '<div data-test-id="dynamic-form-element"><label class="form__group__label">Mouth</label><textarea></textarea></div>');
    document.querySelector('button')!.addEventListener('click', () => {
      current = new URL(`${ctx.url.href}/objective/physical-exam-entry/edit/${examId}`);
    });
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
  });

  it('blocks duplicate creation from concurrent callers waiting for one picker', async () => {
    const ctx = fixture();
    const picker = document.body.innerHTML;
    document.body.innerHTML = '<button data-test-id="soap-objective-addPhysicalExam-btn">Add</button>';
    let release!: () => void;
    ctx.wait = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const first = createShepherdPhysicalExam('Dental', ctx);
    const second = createShepherdPhysicalExam('Dental', ctx);
    document.body.innerHTML = picker;
    document.querySelector('button')!.addEventListener('click', clicks);
    release();
    expect(await second).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(await first).toMatchObject({ ok: true, state: 'opened' });
    expect(clicks).toHaveBeenCalledOnce();
  });

  it('never clicks twice on repeated calls after ambiguous activation', async () => {
    const ctx = fixture();
    document.querySelector('button')!.removeEventListener('click', clicks);
    document.querySelector('button')!.addEventListener('click', () => undefined);
    const activate = vi.spyOn(document.querySelector('button')!, 'click');
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(await createShepherdPhysicalExam('Dental', ctx)).toEqual({ ok: false, code: 'physical_exam_outcome_unknown' });
    expect(activate).toHaveBeenCalledOnce();
  });
});

describe('Shepherd static-source adapter', () => {
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); sessionStorage.clear(); vi.unstubAllGlobals(); });

  it('uses exact fixed selectors and dynamic objective labels on UUID SOAP routes', () => {
    fixedEditor();
    document.body.insertAdjacentHTML('beforeend', '<div data-test-id="dynamic-form-element"><label class="form__group__label">Dental</label><textarea></textarea></div>');
    expect(shepherd.listFields(context())).toEqual([
      { title: 'Subjective > History', kind: 'note', acceptsImage: false },
      { title: 'Objective > Dental', kind: 'note', acceptsImage: false },
    ]);
    expect(shepherd.status(context())).toMatchObject({ state: 'writable', patientName: null, consult: { recordId } });
    expect(shepherd.status({ ...context(), url: new URL('https://app.shepherd.vet/soap/not-a-uuid') }).state).toBe('notConsult');
  });

  it('pastes escaped HTML and observes completed autosave plus changed save control', async () => {
    clipboard();
    const input = fixedEditor();
    let pasted = '';
    input.addEventListener('paste', (event) => {
      pasted = (event as ClipboardEvent).clipboardData!.getData('text/html');
      input.insertAdjacentHTML('beforeend', pasted);
    });
    const save = document.querySelector('button')!;
    save.addEventListener('click', () => {
      save.disabled = true;
      document.body.insertAdjacentHTML('beforeend', '<span class="autosave__indicator"></span>');
    });
    const ctx = context();
    ctx.wait = async () => { document.querySelector('.autosave__indicator')?.remove(); };
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: '<New>\nNext' }, ctx)).toEqual({ ok: true });
    expect(pasted).toBe('<p>&lt;New&gt;</p><p>Next</p>');
    expect(input.textContent).toBe('Existing<New>Next');
  });

  it('does not interpret a disabled save button or ignored paste as persistence', async () => {
    clipboard();
    const input = fixedEditor();
    input.addEventListener('paste', () => { input.textContent += 'New'; });
    const save = document.querySelector('button')!;
    save.addEventListener('click', () => { save.disabled = true; });
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
    fixedEditor();
    document.querySelector('button')!.addEventListener('click', () => {
      document.querySelector('button')!.disabled = true;
      document.body.insertAdjacentHTML('beforeend', '<span class="autosave__indicator"></span>');
    });
    const ctx = context();
    ctx.wait = async () => { document.querySelector('.autosave__indicator')?.remove(); };
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, ctx)).toEqual({ ok: false, code: 'save_not_confirmed' });
  });

  it.each([
    ['Subjective > Initial Complaint', 'soap-initial-complaint-field', 'soap-subjective-save-btn'],
    ['Subjective > Current Medications & Supplements', 'soap-current-medication-field', 'soap-subjective-save-btn'],
    ['Assessment > Assessment', 'soap-assesment-form-description', 'soap-assesment-save-btn'],
    ['Assessment > Laboratory', 'lab-note-txtbox', 'laboratory-note-add-btn'],
    ['Assessment > Imaging', 'imaging-note-txtbox', 'imaging-note-add-btn'],
    ['Assessment > Document', 'document-note-txtbox', 'document-note-add-btn'],
    ['Plan/Schedule > Recommendation', 'soap-plan-recommendation-txtBox', 'soap-plan-recommendation-save-btn'],
    ['Plan/Schedule > Notes', 'soap-plan-note-txtbox', 'undefined-note-add-btn'],
  ])('routes %s to its exact observed save control', async (title, testId, saveId) => {
    clipboard();
    document.body.innerHTML = `<div data-test-id="${testId}"><div contenteditable="true"></div></div><button data-test-id="${saveId}">Save</button>`;
    const clicked = vi.fn();
    document.querySelector('button')!.addEventListener('click', clicked);
    expect(await shepherd.write({ fieldTitle: title, text: 'New' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('rejects ambiguous editors, disabled controls, and stale contexts before mutation', async () => {
    clipboard();
    const input = fixedEditor();
    const paste = vi.fn();
    input.addEventListener('paste', paste);
    document.querySelector('button')!.disabled = true;
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, context())).toEqual({ ok: false, code: 'not_writable' });
    document.querySelector('button')!.disabled = false;
    document.body.append(document.querySelector('[data-test-id="soap-medication-history-field"]')!.cloneNode(true));
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, context())).toEqual({ ok: false, code: 'field_not_found' });
    expect(paste).not.toHaveBeenCalled();
  });

  it('revalidates editor connectivity immediately after awaited save checks', async () => {
    clipboard();
    const input = fixedEditor();
    const ctx = context();
    ctx.wait = async () => { input.remove(); };
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, ctx)).toEqual({ ok: false, code: 'not_writable' });
  });

  it('does not mutate without an enabled save control and never fabricates success', async () => {
    clipboard();
    const input = fixedEditor();
    const paste = vi.fn();
    input.addEventListener('paste', paste);
    document.querySelector('button')!.remove();
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, context())).toEqual({ ok: false, code: 'save_button_not_found' });
    expect(paste).not.toHaveBeenCalled();
    fixedEditor();
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
  });

  it('appends objective textarea text without claiming unobserved autosave', async () => {
    document.body.innerHTML = '<div data-test-id="dynamic-form-element"><label class="form__group__label">Dental</label><textarea>Existing</textarea></div>';
    expect(await shepherd.write({ fieldTitle: 'Objective > Dental', text: 'New' }, context())).toEqual({ ok: false, code: 'save_not_confirmed' });
    expect(document.querySelector('textarea')!.value).toBe('Existing\nNew');
  });

  it('guards provider switches during focus and navigation during save awaits', async () => {
    clipboard();
    const input = fixedEditor();
    let current = context().url;
    const ctx = { ...context(), currentUrl: () => current };
    const paste = vi.fn();
    input.addEventListener('paste', paste);
    input.addEventListener('focus', () => { current = new URL(`https://evil.test/soap/${recordId}`); });
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, ctx)).toEqual({ ok: false, code: 'patient_changed' });
    expect(paste).not.toHaveBeenCalled();
    fixedEditor();
    current = ctx.url;
    ctx.wait = async () => { current = new URL('https://app.shepherd.vet/soap/aaaaaaaa-1234-1234-1234-123456789abc'); };
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, ctx)).toEqual({ ok: false, code: 'patient_changed' });
  });

  it('stops before save if paste detaches or locks the editor', async () => {
    clipboard();
    const input = fixedEditor();
    input.addEventListener('paste', () => input.setAttribute('contenteditable', 'false'));
    const save = vi.fn();
    document.querySelector('button')!.addEventListener('click', save);
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, context())).toEqual({ ok: false, code: 'not_writable' });
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects images and refuses unavailable clipboard support', async () => {
    fixedEditor();
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', pngDataUrl: 'x' }, context())).toEqual({ ok: false, code: 'image_not_accepted' });
    vi.stubGlobal('DataTransfer', undefined);
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, context())).toEqual({ ok: false, code: 'not_writable' });
  });

  it('rejects embedded images before touching the editor', async () => {
    clipboard();
    const input = fixedEditor();
    const paste = vi.fn();
    input.addEventListener('paste', paste);
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', html: '<p>New</p><img src="image.png">' }, context())).toEqual({ ok: false, code: 'image_not_accepted' });
    expect(paste).not.toHaveBeenCalled();
  });

  it('does not mistake trailing-break removal for a successful HTML paste', async () => {
    clipboard();
    const input = fixedEditor();
    input.insertAdjacentHTML('beforeend', '<br class="ProseMirror-trailingBreak">');
    document.querySelector('button')!.addEventListener('click', () => {
      document.querySelector('button')!.disabled = true;
      document.body.insertAdjacentHTML('beforeend', '<span class="autosave__indicator"></span>');
    });
    const ctx = context();
    ctx.wait = async () => { document.querySelector('.autosave__indicator')?.remove(); };
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', html: '<p>New</p>' }, ctx)).toEqual({ ok: false, code: 'save_not_confirmed' });
  });

  it('revalidates save controls after synchronous paste handlers', async () => {
    clipboard();
    const input = fixedEditor();
    const save = document.querySelector('button')!;
    const clicked = vi.fn();
    save.addEventListener('click', clicked);
    input.addEventListener('paste', () => save.setAttribute('aria-disabled', 'true'));
    expect(await shepherd.write({ fieldTitle: 'Subjective > History', text: 'New' }, context())).toEqual({ ok: false, code: 'not_writable' });
    expect(clicked).not.toHaveBeenCalled();
  });

  it('observes objective autosave and preserves native input/change events', async () => {
    document.body.innerHTML = '<div data-test-id="dynamic-form-element"><label class="form__group__label">Dental</label><textarea>Existing</textarea></div>';
    const input = document.querySelector('textarea')!;
    const events: string[] = [];
    input.addEventListener('input', () => {
      events.push('input');
      document.body.insertAdjacentHTML('beforeend', '<span class="autosave__indicator"></span>');
    });
    input.addEventListener('change', () => events.push('change'));
    const ctx = context();
    ctx.wait = async () => { document.querySelector('.autosave__indicator')?.remove(); };
    expect(await shepherd.write({ fieldTitle: 'Objective > Dental', text: 'New' }, ctx)).toEqual({ ok: true });
    expect(events).toEqual(['input', 'change']);
  });

  it('requires a valid session token and never uses local-storage credentials', async () => {
    const fetcher = vi.fn();
    localStorage.setItem('baasic-auth-token-pav2', JSON.stringify({ token: 'wrong' }));
    for (const value of ['', '{', '{}', '{"token":4}']) {
      sessionStorage.setItem('baasic-auth-token-pav2', value);
      expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['{', 'null', '[]', '{}', '{"id":4}', '{"id":" "}'])('rejects malformed optional user information: %s', async (value) => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"original"}');
    sessionStorage.setItem('baasic-user-info-pav2', value);
    const fetcher = vi.fn().mockResolvedValue(json({ item: [] }));
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['token', 'logout', 'malformed token', 'malformed user', 'user', 'user logout', 'user login', 'unreadable'])(
    'stops later requests after session discontinuity: %s', async (change) => {
      sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"original"}');
      if (change !== 'user login') sessionStorage.setItem('baasic-user-info-pav2', '{"id":"original-user"}');
      const ctx = context();
      const fetcher = vi.fn().mockImplementationOnce(async () => {
        if (change === 'logout') sessionStorage.removeItem('baasic-auth-token-pav2');
        else if (change === 'user logout') sessionStorage.removeItem('baasic-user-info-pav2');
        else if (change === 'unreadable') ctx.sessionStorage = { getItem: () => { throw new TypeError(); } } as unknown as Storage;
        else if (change === 'token' || change === 'malformed token') sessionStorage.setItem('baasic-auth-token-pav2', change === 'token' ? '{"token":"replacement"}' : '{');
        else sessionStorage.setItem('baasic-user-info-pav2', change === 'malformed user' ? '{' : '{"id":"replacement-user"}');
        return json({ item: [] });
      }).mockResolvedValue(json({ item: [] }));
      ctx.fetch = fetcher;
      expect(await shepherd.listAppointments('2026-11-16', ctx)).toEqual({ ok: false, code: 'read_failed' });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );

  it.each(['fetch', 'body', 'error'])('stops provider pagination after a session switch during %s', async (stage) => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"original"}');
    const body = vi.fn(async () => {
      sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"replacement"}');
      return { item: [{ id: 'doctor' }], totalRecords: 2 };
    });
    const fetcher = vi.fn().mockResolvedValueOnce(json({ item: [] })).mockImplementationOnce(async () => {
      if (stage !== 'body') sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"replacement"}');
      if (stage === 'error') throw new TypeError();
      return { ok: true, json: body };
    }).mockResolvedValue(json({ item: [] }));
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    if (stage === 'fetch') expect(body).not.toHaveBeenCalled();
  });

  it('accepts unchanged independent user identity without treating it as clinic identity', async () => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"original"}');
    sessionStorage.setItem('baasic-user-info-pav2', '{"id":"user"}');
    const fetcher = vi.fn().mockResolvedValue(json({ item: [] }));
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, appointments: [], failures: [] });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each(['app.shepherd.vet', 'clinic.shepherd.vet'])('uses source POST bodies and routing for %s', async (host) => {
    sessionStorage.setItem('baasic-auth-token-pav2', JSON.stringify({ token: 'secret' }));
    const fetcher = vi.fn().mockResolvedValueOnce(json({ item: [] })).mockResolvedValueOnce(json({ item: [{ id: 'doctor', name: 'Dr Hill' }] }))
      .mockResolvedValueOnce(json({ item: [{ id: 'visit', startDate: '2026-11-16T14:00:00Z', appointmentPatients: [{ patient: { name: 'Bella' } }], client: { name: 'Ada' }, provider: { name: 'Dr Hill' } }] }));
    const ctx = { ...context(fetcher), url: new URL(`https://${host}/soap/${recordId}`) };
    expect(await shepherd.listAppointments('2026-11-16', ctx)).toMatchObject({ ok: true, appointments: [{ appointmentId: 'visit', patientName: 'Bella', patientNumber: '', vet: 'Dr Hill' }] });
    const base = host.startsWith('app.') ? 'https://api.shepherd.vet/pav2/' : `https://${host}/api/pav2/`;
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([`${base}soaps/dashboard`, `${base}providers/search`, `${base}appointments/search`]);
    const init = fetcher.mock.calls[2][1];
    expect(init.headers.Authorization).toBe('BEARER secret');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ pageNumber: 1, pageSize: 1000,
      embed: 'appointmentPatients,appointmentPatients.patient,appointmentPatients.patient.patientPreferredProviders,appointmentPatients.patient.patientPreferredProviders.provider,appointmentPatients.patient.soapId,client,client.clientInfo,appointmentStatus,appointmentType,provider',
      startDate: expect.any(String), endDate: expect.any(String), providerIds: 'doctor', showCanceled: false, page: 1, rpp: 1000 });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ pageNumber: 1, pageSize: 1000,
      embed: 'supervisingDoctor,pav2User,patient,patient.clients,location,soapAssignedUsers,soapAssignedUsers.coreUser,soapAssignedUsers.pav2User',
      isDeleted: false, rpp: 1000, page: 1 });
  });

  it('fails closed on unknown response shapes and never guesses patient numbers', async () => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"secret"}');
    const fetcher = vi.fn().mockResolvedValue(json({ results: [] }));
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(await shepherd.patientNumber(recordId, context())).toBeNull();
  });
  it('does not stop a short provider page while its explicit total says more remain', async () => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"secret"}');
    const fetcher = vi.fn().mockResolvedValueOnce(json({ item: [] }))
      .mockResolvedValueOnce(json({ item: [{ id: 'doctor-one' }], totalRecords: 2 }))
      .mockResolvedValueOnce(json({ item: [{ id: 'doctor-two' }], totalRecords: 2 }))
      .mockResolvedValueOnce(json({ item: [] }));
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, appointments: [], failures: [] });
    expect(JSON.parse(fetcher.mock.calls[2][1].body).pageNumber).toBe(2);
    expect(JSON.parse(fetcher.mock.calls[3][1].body).providerIds).toBe('doctor-one,doctor-two');
  });

  it('does not send requests from stale contexts or silently accept truncated feeds', async () => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"secret"}');
    const fetcher = vi.fn().mockResolvedValueOnce(json({ item: [], totalRecords: 1001 }));
    expect(await shepherd.listAppointments('2026-11-16', { ...context(fetcher), currentUrl: () => new URL('https://evil.test/') })).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects unverified hosts, invalid dates and unsafe multi-patient identifiers', async () => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"secret"}');
    const fetcher = vi.fn().mockResolvedValueOnce(json({ item: [] })).mockResolvedValueOnce(json({ item: [] }))
      .mockResolvedValueOnce(json({ item: [{ id: 'multi', startDate: '2026-11-16T14:00:00Z', appointmentPatients: [{ patient: { name: 'Bella' } }, { patient: { name: 'Max' } }] }] }));
    expect(await shepherd.listAppointments('invalid', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(await shepherd.listAppointments('2026-11-16', { ...context(fetcher), url: new URL('https://evil.test/') })).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true, appointments: [], failures: [{ code: 'invalid_appointment' }] });
  });

  it('preserves distinct SOAP and appointment identities and their evidenced patient and clinician fields', async () => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"secret"}');
    const fetcher = vi.fn().mockResolvedValueOnce(json({ item: [{
      id: 'shared-id', patientId: 'internal-soap-patient', dateCheckedIn: '2026-11-16T13:00:00Z',
      patient: { name: 'Max', identifier: 'M-42', clients: [{ firstName: 'Ada', lastName: 'Smith' }] },
      supervisingDoctorId: 'doctor-id', supervisingDoctor: { firstName: 'Grace', lastName: 'Hill' },
    }] })).mockResolvedValueOnce(json({ item: [] })).mockResolvedValueOnce(json({ item: [{
      id: 'shared-id', startDate: '2026-11-16T14:00:00Z',
      appointmentPatients: [{ patient: { id: 'internal-appt-patient', name: 'Bella', identifier: 'B-99' } }],
      client: { firstName: 'Alex', lastName: 'Jones' }, provider: { id: 'doctor-id', name: 'Dr Hill' },
    }] }));
    const result = await shepherd.listAppointments('2026-11-16', context(fetcher));
    expect(result).toEqual({ ok: true, failures: [], appointments: [
      { sourceKind: 'soap', appointmentId: 'shared-id', start: '2026-11-16T13:00:00.000Z', patientName: 'Max', patientNumber: 'M-42', ownerName: 'Ada Smith', vet: 'Grace Hill' },
      { sourceKind: 'appointment', appointmentId: 'shared-id', start: '2026-11-16T14:00:00.000Z', patientName: 'Bella', patientNumber: 'B-99', ownerName: 'Alex Jones', vet: 'Dr Hill' },
    ] });
    if (!result.ok) return;
    const chart = { id: 'existing-chart', patient_name: 'Bella', patient_number: 'B-99', owner_name: 'Alex Jones', owner_phone: '',
      owner_email: '', species: 'canine', dentition: 'adult', chart_date: '2026-11-16', recall_date: '', updated_at: '', created_by: 'user' };
    expect(appointmentAction(result.appointments[1], [chart], '2026-11-16')).toEqual({ kind: 'open', chart });
    expect(appointmentAction(result.appointments[1], [chart], '2026-11-17')).toEqual({ kind: 'newVisit', latest: chart });
  });

  it('does not substitute internal patient IDs or invent absent owner and doctor names', async () => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"secret"}');
    const fetcher = vi.fn().mockResolvedValueOnce(json({ item: [{ id: 'soap', patientId: 'internal',
      dateCheckedIn: '2026-11-16T13:00:00Z', patient: { name: 'Max', clients: [] }, supervisingDoctorId: 'internal-doctor' }] }))
      .mockResolvedValueOnce(json({ item: [] })).mockResolvedValueOnce(json({ item: [] }));
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true, failures: [], appointments: [
      { sourceKind: 'soap', appointmentId: 'soap', patientName: 'Max', patientNumber: '', ownerName: '', vet: null },
    ] });
  });

  it('filters cancelled/deleted/out-of-day appointments and includes checked-in dashboard patients', async () => {
    sessionStorage.setItem('baasic-auth-token-pav2', '{"token":"secret"}');
    const row = { id: 'visit', startDate: '2026-11-16T14:00:00Z', appointmentPatients: [{ patient: { name: 'Bella' } }] };
    const fetcher = vi.fn().mockResolvedValueOnce(json({ item: [{ id: 'soap', dateCheckedIn: '2026-11-16T13:00:00Z', patient: { name: 'Max' } }] }))
      .mockResolvedValueOnce(json({ item: [] })).mockResolvedValueOnce(json({ item: [row,
        { ...row, id: 'cancelled', appointmentStatus: { abrv: 'Canceled' } }, { ...row, id: 'deleted', isDeleted: true },
        { ...row, id: 'yesterday', startDate: '2026-11-15T14:00:00Z' }, { ...row, id: 'malformed', startDate: 'bad' },
      ] }));
    expect(await shepherd.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true,
      appointments: [{ appointmentId: 'soap', patientName: 'Max' }, { appointmentId: 'visit', patientName: 'Bella' }],
      failures: [{ code: 'invalid_appointment' }],
    });
  });
});
