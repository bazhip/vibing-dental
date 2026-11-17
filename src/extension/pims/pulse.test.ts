import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pulse } from './pulse';
import type { AdapterContext } from './types';

function context(fetcher = vi.fn()): AdapterContext {
  return { doc: document, url: new URL('https://clinic.evetpractice.com/Practice/MedicalRecord/1'), fetch: fetcher,
    localStorage, sessionStorage, wait: async () => undefined };
}

const json = (value: unknown) => ({ ok: true, json: async () => value }) as Response;
const text = (value: string) => ({ ok: true, text: async () => value }) as Response;
const tooltipHtml = '<ul><li><label>Patient</label>Bella (#22)</li></ul>';
const appointment = { id: 12, patientId: 22, start: '2026-11-16T14:00:00Z', title: 'Bella' };

describe('Pulse source-derived import', () => {
  beforeEach(() => { document.body.innerHTML = '<input name="__RequestVerificationToken" value="csrf">'; });
  afterEach(() => { vi.useRealTimers(); });

  it.each(['unchanged', 'tenant', 'patient', 'encounter', 'navigation', 'auth'])(
    'keeps imported appointments insufficient for export authority (%s)', async (change) => {
      const fetcher = vi.fn().mockResolvedValueOnce(json([appointment])).mockResolvedValueOnce(text(tooltipHtml));
      const ctx = context(fetcher);
      const imported = await pulse.listAppointments('2026-11-16', ctx);
      expect(imported).toMatchObject({ ok: true, appointments: [{ appointmentId: '12', patientNumber: '22' }] });
      document.body.innerHTML = '<input name="__RequestVerificationToken" value="csrf"><medical-record-question-section data-patient-id="22" data-encounter-id="12"><span class="ds-text-h4">Plan</span><div contenteditable="true">Existing plan</div></medical-record-question-section><input name="Name" value="Original title"><textarea>Untouched note</textarea><button>Save</button>';
      const current = new URL(ctx.url.href);
      if (change === 'tenant') current.hostname = 'other.evetpractice.com';
      if (change === 'patient') current.searchParams.set('patientId', 'other-patient');
      if (change === 'encounter') current.pathname = '/Practice/MedicalRecord/other';
      if (change === 'navigation') current.pathname = '/Account/Login';
      if (change === 'auth') document.querySelector('input[name="__RequestVerificationToken"]')?.remove();
      ctx.currentUrl = () => current;
      const before = document.body.innerHTML;
      const save = vi.spyOn(document.querySelector('button')!, 'click');
      const dispatch = vi.spyOn(document.querySelector('[contenteditable]')!, 'dispatchEvent');
      const requestCount = fetcher.mock.calls.length;
      fetcher.mockResolvedValue(json({ success: true }));
      expect(pulse.status(ctx)).toMatchObject({ state: 'notConsult', consult: null });
      for (const item of [{ fieldTitle: 'Plan', text: 'New plan' }, { fieldTitle: 'Plan', html: '<p>New plan</p>' }]) {
        expect(await pulse.write(item, ctx)).toEqual({ ok: false, code: 'not_writable' });
      }
      expect(document.body.innerHTML).toBe(before);
      expect(fetcher).toHaveBeenCalledTimes(requestCount);
      expect(save).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it.each([
    '', '<form><input name="password"></form>',
    '<ul><li><label>Client</label>Ada Smith</li></ul>',
    '<ul><li><label>Patient</label>Bella</li></ul>',
    '<ul><li><label>Patient</label>Bella (#   )</li></ul>',
  ])('reports HTTP 200 tooltips without patient identity as failures: %s', async (html) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json([appointment])).mockResolvedValueOnce(text(html));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({
      ok: true, appointments: [], failures: [{ code: 'tooltip_not_parsed', startsAt: '2026-11-16T14:00:00.000Z' }],
    });
  });

  it.each(['id', 'patientId'])('rejects malformed %s values before requesting tooltips', async (field) => {
    const invalidIds = ['', '  ', NaN, Infinity, -Infinity, {}, [], true, null, undefined];
    const fetcher = vi.fn().mockResolvedValueOnce(json(invalidIds.map((value) => ({ ...appointment, [field]: value }))))
      .mockResolvedValue(text(tooltipHtml));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({
      ok: true, appointments: [], failures: invalidIds.map(() => ({ code: 'invalid_appointment', startsAt: null })),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([0, 'patient-22'])('accepts nonempty scalar IDs: %s', async (value) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json([{ ...appointment, id: value, patientId: value }]))
      .mockResolvedValueOnce(text(tooltipHtml));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ appointmentId: String(value), patientNumber: '22' }],
    });
  });

  it('fetches at most four tooltips concurrently and preserves calendar order', async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const rows = Array.from({ length: 8 }, (_, index) => ({ ...appointment, id: index + 1 }));
    const fetcher = vi.fn().mockResolvedValueOnce(json(rows)).mockImplementation(async (_url, init: RequestInit) => {
      active++;
      peak = Math.max(peak, active);
      const id = Number((init.body as FormData).get('id'));
      await new Promise((resolve) => setTimeout(resolve, (9 - id) * 100));
      active--;
      return text(tooltipHtml);
    });
    const pending = pulse.listAppointments('2026-11-16', context(fetcher));
    await vi.advanceTimersByTimeAsync(8_000);
    expect(await pending).toMatchObject({ ok: true, failures: [], appointments: rows.map((row) => ({ appointmentId: String(row.id) })) });
    expect(peak).toBe(4);
  });

  it.each(['calendar fetch', 'calendar body', 'tooltip fetch', 'tooltip body'])('bounds a stalled %s below the transport deadline', async (stage) => {
    vi.useFakeTimers();
    const stalled = () => new Promise<never>(() => undefined);
    const fetcher = vi.fn().mockImplementationOnce(() => stage === 'calendar fetch' ? stalled()
      : stage === 'calendar body' ? { ok: true, json: stalled } : json([appointment]))
      .mockImplementation(() => stage === 'tooltip fetch' ? stalled() : { ok: true, text: stalled });
    let result: unknown;
    const pending = pulse.listAppointments('2026-11-16', context(fetcher)).then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(result).toEqual({ ok: false, code: 'read_failed' });
    for (const call of fetcher.mock.calls) expect(call[1].signal.aborted).toBe(true);
    await pending;
  });

  it('aborts queued tooltip work within one overall budget without returning partial success', async () => {
    vi.useFakeTimers();
    const rows = Array.from({ length: 20 }, (_, index) => ({ ...appointment, id: index + 1 }));
    const fetcher = vi.fn().mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return json(rows);
    }).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return text(tooltipHtml);
    });
    let result: unknown;
    const pending = pulse.listAppointments('2026-11-16', context(fetcher)).then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(result).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).toHaveBeenCalledTimes(9);
    for (const call of fetcher.mock.calls) expect(call[1].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(9);
    await pending;
  });

  it('requests the selected local day and parses patient/owner/provider tooltip details', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json([
      { id: 12, patientId: 22, start: '2026-11-16T14:00:00Z', title: 'Bella Smith<br/>Consult' },
      { id: 13, patientId: 23, start: '2026-11-16T15:00:00Z', title: '<img src="ConfirmStatusIcons/x" alt="Cancelled">Max' },
    ])).mockResolvedValueOnce(text('<ul><li><label>Patient</label>Bella (#22)</li><li><label>Client</label>Ada Smith</li><li><label>Appointment Provider</label>Dr Hill</li></ul>'));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, failures: [], appointments: [
      { appointmentId: '12', patientNumber: '22', patientName: 'Bella Smith', ownerName: 'Ada Smith', vet: 'Dr Hill', start: '2026-11-16T14:00:00.000Z' },
    ] });
    expect(fetcher.mock.calls[0][0]).toBe('/Practice/Calendar/GetPracticeAppointmentsForToggleOn');
    const form = fetcher.mock.calls[0][1].body as FormData;
    expect(form.get('startDate')).toBe('11/16/2026, 12:00:00 AM');
    expect(form.get('endDate')).toBe('11/17/2026, 12:00:00 AM');
    expect(form.get('__RequestVerificationToken')).toBe('csrf');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports malformed records and failed details without inventing patient numbers', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json([
      { id: 1, patientId: 22, start: 'invalid', title: 'Bella' },
      { id: 2, patientId: 22, start: '2026-11-16T15:00:00Z', title: 'Bella' },
    ])).mockResolvedValueOnce({ ok: false });
    const result = await pulse.listAppointments('2026-11-16', context(fetcher));
    expect(result).toMatchObject({ ok: true, appointments: [], failures: [
      { code: 'invalid_appointment' }, { code: 'tooltip_fetch_failed' },
    ] });
  });

  it('refuses missing CSRF, invalid dates, and malformed server envelopes', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ error: 'login_required' }));
    expect(await pulse.listAppointments('bad', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    document.body.innerHTML = '';
    fetcher.mockClear();
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not treat editor presence as verified clinical destination identity', async () => {
    document.body.innerHTML = '<medical-record-question-section><span class="ds-text-h4">Plan</span><div contenteditable="true">Existing</div></medical-record-question-section>';
    expect(pulse.listFields(context())).toEqual([{ title: 'Plan', kind: 'note', acceptsImage: false }]);
    expect(pulse.status(context()).state).toBe('notConsult');
    expect(await pulse.write({ fieldTitle: 'Plan', text: 'New' }, context())).toEqual({ ok: false, code: 'not_writable' });
    expect(document.querySelector('[contenteditable]')?.textContent).toBe('Existing');
  });
});

describe('Pulse read-only field discovery', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('normalizes sidebar whitespace and gives it precedence over other destinations', () => {
    document.body.innerHTML = `
      <aside role="complementary" class="p-sidebar-active">
        <div class="covetrus-sidebar-header-title"> Medical\n   Notes </div>
        <div contenteditable="true">Existing</div>
      </aside>
      <medical-record-question-section><span class="ds-text-h4">Plan</span></medical-record-question-section>
      <fieldset><legend>Note Details</legend><iframe></iframe></fieldset>`;
    const adapterContext = context();
    adapterContext.url = new URL('https://clinic.evetpractice.com/Practice/Notes/AddNote');
    expect(pulse.listFields(adapterContext)).toEqual([{ title: 'Medical Notes', kind: 'note', acceptsImage: false }]);
  });

  it.each([
    ['/Practice/Notes/AddNote', '<fieldset><legend>Note Details</legend><iframe></iframe></fieldset>', 'Medical Notes'],
    ['/Practice/Patients/EditAndGenerateDocument/12', '<form action="/Practice/Patients/EditAndGenerateDocument/12"><iframe id="Text_ifr"></iframe></form>', 'Patient Documents'],
    ['/Practice/MedicalRecord/12', '<fieldset><legend>Summary</legend><ol><li><div class="mce-tinymce"><div class="mce-edit-area"><iframe></iframe></div></div></li></ol></fieldset>', 'Summary'],
    ['/Practice/MedicalRecord/12', '<fieldset><legend>Plan</legend><ol><p><a id="lnkComponentComments">Edit Comments</a></p></ol></fieldset>', 'Plan'],
  ])('discovers %s without enabling writes or causing side effects', async (path, html, title) => {
    document.body.innerHTML = `<a id="lnkExpandCollapseAll">Expand</a>${html}`;
    const originalHtml = document.body.innerHTML;
    const click = vi.spyOn(HTMLElement.prototype, 'click');
    const globalFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json([]));
    const clickEvent = vi.fn();
    document.body.addEventListener('click', clickEvent, { once: true });
    const fetcher = vi.fn();
    const adapterContext = context(fetcher);
    adapterContext.url = new URL(`https://clinic.evetpractice.com${path}`);
    expect(pulse.listFields(adapterContext)).toEqual([{ title, kind: 'note', acceptsImage: false }]);
    expect(pulse.status(adapterContext).state).toBe('notConsult');
    expect(await pulse.patientNumber('12', adapterContext)).toBeNull();
    expect(await pulse.write({ fieldTitle: title, text: 'New' }, adapterContext)).toEqual({ ok: false, code: 'not_writable' });
    expect(document.body.innerHTML).toBe(originalHtml);
    expect(click).not.toHaveBeenCalled();
    expect(clickEvent).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
    document.body.removeEventListener('click', clickEvent);
  });

  it.each([
    ['/Practice/Notes/AddNote', '<fieldset><legend>Unrelated</legend><iframe></iframe></fieldset>'],
    ['/Practice/Notes/AddNote', '<fieldset><legend>Note Details</legend></fieldset>'],
    ['/Practice/Patients/EditAndGenerateDocument/12', '<form action="/unrelated"><iframe id="Text_ifr"></iframe></form>'],
    ['/Practice/Patients/EditAndGenerateDocument/12', '<form action="/Practice/Patients/EditAndGenerateDocument/12"><iframe></iframe></form>'],
    ['/Practice/Calendar?next=/Practice/Notes/AddNote', '<fieldset><legend>Note Details</legend><iframe></iframe></fieldset>'],
    ['/Practice/MedicalRecord/12', '<fieldset><legend>Unrelated</legend><a id="lnkComponentComments">Edit Comments</a><iframe></iframe></fieldset>'],
  ])('excludes unrelated or incomplete legacy destinations on %s', (path, html) => {
    document.body.innerHTML = html;
    const adapterContext = context();
    adapterContext.url = new URL(`https://clinic.evetpractice.com${path}`);
    expect(pulse.listFields(adapterContext)).toEqual([]);
  });

  it.each(['hidden', 'style="display: none"', 'inert', 'disabled', 'readonly', 'aria-disabled="true"', 'aria-readonly="true"'])('excludes destinations under %s containers', (attribute) => {
    document.body.innerHTML = `<div ${attribute}>
      <aside role="complementary" class="p-sidebar-active"><div class="covetrus-sidebar-header-title">Sidebar</div><div contenteditable="true"></div></aside>
      <medical-record-question-section><span class="ds-text-h4">Question</span></medical-record-question-section>
      <fieldset><legend>Plan</legend><ol><p><a id="lnkComponentComments">Edit Comments</a></p></ol></fieldset>
      <fieldset><legend>Note Details</legend><iframe></iframe></fieldset>
      <form action="/Practice/Patients/EditAndGenerateDocument/12"><iframe id="Text_ifr"></iframe></form>
    </div>`;
    const adapterContext = context();
    for (const path of ['/Practice/MedicalRecord/12', '/Practice/Notes/AddNote', '/Practice/Patients/EditAndGenerateDocument/12']) {
      adapterContext.url = new URL(`https://clinic.evetpractice.com${path}`);
      expect(pulse.listFields(adapterContext)).toEqual([]);
    }
  });

  it('rejects hidden or locked legacy controls and deduplicates modern and legacy titles', () => {
    document.body.innerHTML = `
      <medical-record-question-section><span class="ds-text-h4">Plan</span></medical-record-question-section>
      <medical-record-patient-form-section><span class="ds-text-h4"> Plan </span></medical-record-patient-form-section>
      <fieldset><legend>Plan</legend><ol><p><a id="lnkComponentComments">Edit Comments</a></p></ol></fieldset>
      <fieldset><legend>Hidden</legend><ol><p><a id="lnkComponentComments" hidden>Edit Comments</a></p></ol></fieldset>
      <fieldset><legend>Locked</legend><ol><li><div class="mce-tinymce"><div class="mce-edit-area"><iframe aria-readonly="true"></iframe></div></div></li></ol></fieldset>
      <fieldset><legend>Other</legend><ol><li><div><div class="mce-edit-area"><iframe></iframe></div></div></li></ol></fieldset>`;
    expect(pulse.listFields(context())).toEqual([{ title: 'Plan', kind: 'note', acceptsImage: false }]);
  });

  it.each(['hidden', 'inert', 'aria-readonly="true"'])('ignores a sidebar with an %s editor and keeps visible modern fields', (attribute) => {
    document.body.innerHTML = `
      <aside role="complementary" class="p-sidebar-active"><div class="covetrus-sidebar-header-title">Sidebar</div><div contenteditable="true" ${attribute}></div></aside>
      <medical-record-question-section><span class="ds-text-h4">Plan</span></medical-record-question-section>`;
    expect(pulse.listFields(context())).toEqual([{ title: 'Plan', kind: 'note', acceptsImage: false }]);
  });

  it.each(['hidden', 'disabled', 'aria-readonly="true"'])('excludes legacy route editors marked %s', (attribute) => {
    document.body.innerHTML = `
      <fieldset><legend>Note Details</legend><iframe ${attribute}></iframe></fieldset>
      <form action="/Practice/Patients/EditAndGenerateDocument/12"><iframe id="Text_ifr" ${attribute}></iframe></form>`;
    const adapterContext = context();
    for (const path of ['/Practice/Notes/AddNote', '/Practice/Patients/EditAndGenerateDocument/12']) {
      adapterContext.url = new URL(`https://clinic.evetpractice.com${path}`);
      expect(pulse.listFields(adapterContext)).toEqual([]);
    }
  });
});
