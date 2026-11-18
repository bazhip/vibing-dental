import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pulse } from './pulse';
import type { AdapterContext } from './types';

function context(fetcher = vi.fn()): AdapterContext {
  return { doc: document, url: new URL('https://clinic.evetpractice.com/Practice/MedicalRecord/1'), fetch: fetcher,
    localStorage, sessionStorage, wait: async () => undefined };
}

const json = (value: unknown) => ({ ok: true, json: async () => value }) as Response;
function visitForm(date: string, hour: string, minute: string, meridiem: string): string {
  return `<input id="IsActive" value="True"><input id="AppointmentStartDate" value="${date}">
    <select id="AppointmentStartTimeHour"><option selected>${hour}</option></select>
    <select id="AppointmentStartTimeMinute"><option selected>${minute}</option></select>
    <select id="AppointmentStartTimeIsAM"><option selected>${meridiem}</option></select>`;
}
function visitAt(time: Date): string {
  return visitForm(`${String(time.getMonth() + 1).padStart(2, '0')}/${String(time.getDate()).padStart(2, '0')}/${time.getFullYear()}`,
    String(time.getHours() % 12 || 12), String(time.getMinutes()).padStart(2, '0'), time.getHours() < 12 ? 'AM' : 'PM');
}
const activeVisit = visitAt(new Date('2026-11-16T14:00:00Z'));
const text = (value: string) => ({ ok: true, text: async () => value, json: async () => ({ status: true, html: activeVisit }) }) as Response;
const tooltipHtml = '<ul><li><label>Patient</label>Bella (#22)</li></ul>';
const appointment = { id: 12, patientId: 22, start: '2026-11-16T14:00:00Z', title: 'Bella' };

describe('Pulse verified visit parity', () => {
  beforeEach(() => { document.body.innerHTML = '<input name="__RequestVerificationToken" value="csrf">'; });
  afterEach(() => { vi.useRealTimers(); });

  const readVisit = (html: string, rows = [appointment], resources: unknown = []) => {
    const fetcher = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json(rows);
      if (url.endsWith('GetToolTip')) return text(`${tooltipHtml}<li><label>Appointment Provider</label>dr hill</li>`);
      if (url.endsWith('GetVisit')) return json({ status: true, html });
      if (url.endsWith('GetCalendarResources')) return json(resources);
      throw new TypeError();
    });
    return fetcher;
  };

  it.each([
    ['11/16/2026', '11', '45', 'AM', 11, 45],
    ['11/16/2026', '12', '00', 'AM', 0, 0],
    ['11/16/2026', '12', '30', 'PM', 12, 30],
    ['11/16/2026', '4', '05', 'PM', 16, 5],
  ])('imports verified local visit time %s %s:%s %s instead of stale feed time', async (date, hour, minute, meridiem, expectedHour, expectedMinute) => {
    const fetcher = readVisit(visitForm(date, hour, minute, meridiem));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true, failures: [], appointments: [
      { start: new Date(2026, 10, 16, expectedHour, expectedMinute).toISOString() },
    ] });
  });

  it.each(['11/15/2026', '11/17/2026'])('excludes an appointment rescheduled outside the requested day to %s', async (date) => {
    const fetcher = readVisit(visitForm(date, '9', '00', 'AM'));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, appointments: [], failures: [] });
  });

  it('includes a visit rescheduled into the requested day despite stale out-of-day feed time', async () => {
    const fetcher = readVisit(visitForm('11/16/2026', '9', '00', 'AM'), [{ ...appointment, start: '2026-11-15T14:00:00Z' }]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true, failures: [], appointments: [
      { start: new Date(2026, 10, 16, 9).toISOString() },
    ] });
  });

  it.each([
    '<form><input name="password"></form>', '<main>Sign in</main>', '<input id="IsActive" value="True">',
    visitForm('', '9', '00', 'AM'), visitForm('02/29/2026', '9', '00', 'AM'),
    visitForm('04/31/2026', '9', '00', 'AM'), visitForm('13/16/2026', '9', '00', 'AM'),
    visitForm('11/00/2026', '9', '00', 'AM'), visitForm('2026-11-16', '9', '00', 'AM'),
    visitForm('11/16/2026', '', '00', 'AM'), visitForm('11/16/2026', '0', '00', 'AM'),
    visitForm('11/16/2026', '13', '00', 'AM'), visitForm('11/16/2026', '9', '', 'AM'),
    visitForm('11/16/2026', '9', '60', 'AM'), visitForm('11/16/2026', '9', '1.5', 'AM'),
    visitForm('11/16/2026', '9', '00', ''), visitForm('11/16/2026', '9', '00', 'true'),
    visitForm('11/16/2026', '9', '00', 'AM').replaceAll(' selected', ''),
  ])('keeps malformed or unrecognized visit HTML unknown: %s', async (html) => {
    const fetcher = readVisit(html);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, appointments: [], failures: [{ code: 'tooltip_not_parsed' }],
    });
  });

  it('accepts a real leap day', async () => {
    const fetcher = readVisit(visitForm('02/29/2028', '9', '00', 'AM'), [{ ...appointment, start: '2028-02-29T14:00:00Z' }]);
    expect(await pulse.listAppointments('2028-02-29', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ start: new Date(2028, 1, 29, 9).toISOString() }],
    });
  });

  it.runIf(Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York')('rejects a nonexistent spring-forward local time rather than normalizing it', async () => {
    const fetcher = readVisit(visitForm('03/08/2026', '2', '30', 'AM'), [{ ...appointment, start: '2026-03-08T06:30:00Z' }]);
    expect(await pulse.listAppointments('2026-03-08', context(fetcher))).toMatchObject({
      ok: true, appointments: [], failures: [{ code: 'tooltip_not_parsed' }],
    });
  });

  it.each(['0', 0, '0x10', '1e2', '-1', -1, '1.5', 1.5, '9007199254740993', 9007199254740992,
    ' 12', '12 ', '012', '+12', 'Infinity', 'NaN'])('rejects noncanonical visit identity %s before all row requests', async (id) => {
    const fetcher = readVisit(activeVisit, [{ ...appointment, id, resourceId: 7 } as typeof appointment]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({
      ok: true, appointments: [], failures: [{ code: 'invalid_appointment', startsAt: null }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([12, '12', Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)])('uses the same canonical visit identity %s in both endpoints', async (id) => {
    const fetcher = readVisit(activeVisit, [{ ...appointment, id } as typeof appointment]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ appointmentId: String(id) }],
    });
    const tooltip = fetcher.mock.calls.find(([url]) => url.endsWith('GetToolTip'));
    const visit = fetcher.mock.calls.find(([url]) => url.endsWith('GetVisit'));
    expect((tooltip?.[1] as RequestInit).body).toBeInstanceOf(FormData);
    expect(((tooltip?.[1] as RequestInit).body as FormData).get('id')).toBe(String(id));
    expect(JSON.parse((visit?.[1] as RequestInit).body as string).id).toBe(Number(id));
  });

  it('resolves feed resource IDs through the actual endpoint once and gives DOM providers precedence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 17, 10, 20, 30, 123));
    document.body.innerHTML += '<select name="ActiveProvider"><option value="7">Dr Resource</option><option value="8">Dr Hill</option></select>';
    const html = activeVisit;
    const rows = [{ ...appointment, resourceId: 7 }, { ...appointment, id: 13, resourceId: 9 }];
    const fetcher = readVisit(html, rows, [{ id: 7, name: 'Resource alias' }, { id: 9, name: 'Room B' }]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ vet: 'Dr Resource' }, { vet: 'Room B' }],
    });
    const calls = fetcher.mock.calls.filter(([url]) => url.endsWith('GetCalendarResources'));
    expect(calls).toHaveLength(1);
    const init = calls[0][1] as RequestInit;
    expect(init).toMatchObject({ method: 'POST', credentials: 'include', redirect: 'error', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      day: '2026-11-17T10:20:30.123', calendarResourceGroupId: '0', __RequestVerificationToken: 'csrf',
    });
  });

  it('uses EmployeeIdFilter only when ActiveProvider has no nonsentinel rows', async () => {
    document.body.innerHTML += '<select name="ActiveProvider"><option value="0">Show All</option></select><select name="EmployeeIdFilter"><option value="-1">Unassigned</option><option value="7"> Dr   Hill </option></select>';
    const fetcher = readVisit(activeVisit, [{ ...appointment, resourceId: 7 } as typeof appointment], [{ id: 7, name: 'Room alias' }]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ vet: 'Dr Hill' }],
    });
  });

  it('uses the live resource rather than the earlier tooltip employee when the resource is unlinked', async () => {
    document.body.innerHTML += '<select name="ActiveProvider"><option value="8">Dr Hill</option></select>';
    const fetcher = readVisit(`${activeVisit}<select id="ResourceId"><option value="7" selected>Form fallback</option></select>`,
      [{ ...appointment, resourceId: 99 } as typeof appointment]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ vet: 'Form fallback' }],
    });
  });

  it('resolves a changed live resource ID rather than the stale feed resource', async () => {
    document.body.innerHTML += '<select name="ActiveProvider"><option value="7">Dr Old</option><option value="99">Dr New</option></select>';
    const fetcher = readVisit(`${activeVisit}<select id="ResourceId"><option value="99" selected>New resource alias</option></select>`,
      [{ ...appointment, resourceId: 7 } as typeof appointment], [{ id: 7, name: 'Old resource' }, { id: 99, name: 'New resource' }]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true, failures: [], appointments: [{ vet: 'Dr New' }] });
  });

  it.each(['', '0', '-1'])('respects explicit resource removal %s and the live employee', async (removed) => {
    document.body.innerHTML += '<select name="ActiveProvider"><option value="7">Dr Old</option><option value="8">Dr Hill</option></select>';
    const html = `${activeVisit}<select id="ResourceId"><option value="${removed}" selected>- None -</option></select>
      <select id="EmployeeId"><option value="9" selected>Dr New</option></select>`;
    const fetcher = readVisit(html, [{ ...appointment, resourceId: 7 } as typeof appointment], [{ id: 7, name: 'Old resource' }]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true, failures: [], appointments: [{ vet: 'Dr New' }] });
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('GetCalendarResources'))).toBe(false);
  });

  it.each([
    '<select id="ResourceId"><option value="0" selected>- None -</option></select><select id="EmployeeId"><option value="0" selected>- None -</option></select>',
    '<select id="ResourceId"><option value="0" selected>- None -</option></select>',
    '<select id="EmployeeId"><option value="0" selected>- None -</option></select>',
    '<select id="ResourceId"><option value="7">Unselected resource</option></select>',
  ])('does not restore earlier provider assignments when live controls supply none: %s', async (controls) => {
    const fetcher = readVisit(activeVisit + controls, [{ ...appointment, resourceId: 7 } as typeof appointment], [{ id: 7, name: 'Old resource' }]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({ ok: true, failures: [], appointments: [{ vet: null }] });
    expect(fetcher.mock.calls.some(([url]) => url.endsWith('GetCalendarResources'))).toBe(false);
  });

  it.each(['http', 'network', 'body', 'shape'])('falls back to DOM providers on resource %s failures', async (failure) => {
    document.body.innerHTML += '<select name="ActiveProvider"><option value="7">Dr Hill</option></select>';
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json([{ ...appointment, resourceId: 7 }]);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      if (url.endsWith('GetVisit')) return json({ status: true, html: activeVisit });
      if (failure === 'network') throw new TypeError();
      if (failure === 'body') return { ok: true, json: async () => { throw new SyntaxError(); } };
      return failure === 'http' ? { ok: false } : json({ status: false });
    });
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ vet: 'Dr Hill' }],
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it.each([0, '0', -1, '-1', null, undefined])('never resolves sentinel resource %s as a provider', async (resourceId) => {
    document.body.innerHTML += '<select name="ActiveProvider"><option value="0">Not a provider</option><option value="-1">Unassigned</option><option value="8">Dr Hill</option></select>';
    const fetcher = readVisit(activeVisit, [{ ...appointment, resourceId } as typeof appointment]);
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ vet: 'Dr Hill' }],
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each(['token', 'navigation', 'logout'])('aborts all work on a resource-body %s discontinuity', async (change) => {
    const ctx = context();
    const fetcher = vi.fn().mockImplementation(async (url) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json([{ ...appointment, resourceId: 7 }]);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      if (url.endsWith('GetVisit')) return json({ status: true, html: activeVisit });
      return { ok: true, json: async () => {
        if (change === 'token') document.querySelector('input')?.setAttribute('value', 'replacement');
        if (change === 'logout') document.querySelector('input')?.remove();
        if (change === 'navigation') ctx.currentUrl = () => new URL('https://other.evetpractice.com/Practice/Calendar');
        return [{ id: 7, name: 'Dr Hill' }];
      } };
    });
    ctx.fetch = fetcher;
    expect(await pulse.listAppointments('2026-11-16', ctx)).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const call of fetcher.mock.calls) expect(call[1].signal.aborted).toBe(true);
  });

  it('bounds a stalled resource body with the overall deadline', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockImplementation(async (url) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json([{ ...appointment, resourceId: 7 }]);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      if (url.endsWith('GetVisit')) return json({ status: true, html: activeVisit });
      return { ok: true, json: () => new Promise<never>(() => undefined) };
    });
    const pending = pulse.listAppointments('2026-11-16', context(fetcher));
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await pending).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const call of fetcher.mock.calls) expect(call[1].signal.aborted).toBe(true);
  });

  it('isolates an unknown live date without dropping a verified sibling appointment', async () => {
    const fetcher = vi.fn().mockImplementation(async (url, init) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json([appointment, { ...appointment, id: 13 }]);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      return json({ status: true, html: JSON.parse(init.body).id === 12 ? '<main>Sign in</main>' : activeVisit });
    });
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, appointments: [{ appointmentId: '13' }], failures: [{ code: 'tooltip_not_parsed' }],
    });
  });
});

describe('Pulse source-derived import', () => {
  beforeEach(() => { document.body.innerHTML = '<input name="__RequestVerificationToken" value="csrf">'; });
  afterEach(() => { vi.useRealTimers(); });

  it.each([
    ['<input id="IsActive" value="False">', null],
    ['<select id="ConfirmStatusId"><option selected>Canceled</option></select>', null],
    ['<select id="ConfirmStatusId"><option selected>Cancelled</option></select>', null],
    ['<select id="ConfirmStatusId"><option selected>Not canceled</option></select>', '12'],
    ['<select id="ConfirmStatusId"><option>Canceled</option><option selected>Confirmed</option></select>', '12'],
  ])('reads explicit visit status without archiving custom status: %s', async (html, expectedId) => {
    const fetcher = vi.fn().mockImplementation(async (url) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json([appointment]);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      if (url.endsWith('GetVisit')) return json({ status: true, html: html + activeVisit });
      throw new TypeError();
    });
    const result = await pulse.listAppointments('2026-11-16', context(fetcher));
    expect(result).toMatchObject({ ok: true, failures: [], appointments: expectedId ? [{ appointmentId: expectedId }] : [] });
    expect(fetcher).toHaveBeenCalledWith('/Practice/Calendar/GetVisit', expect.objectContaining({
      method: 'POST', credentials: 'include', redirect: 'error',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', __RequestVerificationToken: 'csrf' },
      body: JSON.stringify({ id: 12, viewType: 'agendaDay' }),
    }));
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['7', 'Room A', 'Dr Hill', 'Room A'],
    ['', '- None -', 'Dr Hill', 'Dr Hill'],
    ['7', 'Dr Hill', 'Dr Hill', 'Dr Hill'],
    ['7', 'Room A', '- None -', 'Room A'],
  ])('prioritizes assigned resource %s %s while retaining employee fallback %s', async (resourceId, resource, employee, expected) => {
    const html = `<select id="ResourceId"><option value="${resourceId}" selected>${resource}</option></select>
      <select id="EmployeeId"><option selected>${employee}</option></select>${activeVisit}`;
    const fetcher = vi.fn().mockResolvedValueOnce(json([appointment])).mockResolvedValueOnce(text(tooltipHtml))
      .mockResolvedValueOnce(json({ status: true, html }));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ vet: expected }],
    });
  });

  it.each([null, {}, { status: false, html: activeVisit }, { status: 'true', html: activeVisit },
    { status: true, html: '' }, { status: true, html: {} }])('isolates unavailable visit envelopes: %j', async (payload) => {
    const fetcher = vi.fn().mockImplementation(async (url, init) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json([appointment, { ...appointment, id: 13 }]);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      return json(JSON.parse(init.body).id === 12 ? payload : { status: true, html: activeVisit });
    });
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, appointments: [{ appointmentId: '13' }], failures: [{ code: 'tooltip_fetch_failed' }],
    });
  });

  it.each(['http', 'network', 'json'])('isolates a visit %s failure without fallback endpoints', async (failure) => {
    const fetcher = vi.fn().mockImplementation(async (url, init) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json([appointment, { ...appointment, id: 13 }]);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      if (!url.endsWith('GetVisit')) throw new TypeError();
      if (JSON.parse(init.body).id === 13) return json({ status: true, html: activeVisit });
      if (failure === 'network') throw new TypeError();
      return failure === 'http' ? { ok: false } : { ok: true, json: async () => { throw new SyntaxError(); } };
    });
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, appointments: [{ appointmentId: '13' }], failures: [{ code: 'tooltip_fetch_failed' }],
    });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it.each(['token', 'navigation', 'logout'])('aborts queued work on a visit-body %s discontinuity', async (change) => {
    const ctx = context();
    const fetcher = vi.fn().mockImplementation(async (url) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json(Array.from({ length: 8 }, (_, index) => ({ ...appointment, id: index + 1 })));
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      return { ok: true, json: async () => {
        if (change === 'token') document.querySelector('input')?.setAttribute('value', 'replacement');
        if (change === 'logout') document.querySelector('input')?.remove();
        if (change === 'navigation') ctx.currentUrl = () => new URL('https://other.evetpractice.com/Practice/Calendar');
        return { status: true, html: activeVisit };
      } };
    });
    ctx.fetch = fetcher;
    expect(await pulse.listAppointments('2026-11-16', ctx)).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).toHaveBeenCalledTimes(9);
    for (const call of fetcher.mock.calls) expect(call[1].signal.aborted).toBe(true);
  });

  it.each(['fetch', 'body'])('bounds stalled visit %s within the existing overall deadline', async (stage) => {
    vi.useFakeTimers();
    const stalled = () => new Promise<never>(() => undefined);
    const fetcher = vi.fn().mockImplementation(async (url) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json([appointment]);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      return stage === 'fetch' ? stalled() : { ok: true, json: stalled };
    });
    const pending = pulse.listAppointments('2026-11-16', context(fetcher));
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await pending).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const call of fetcher.mock.calls) expect(call[1].signal.aborted).toBe(true);
  });

  it('uses local midnight boundaries across daylight-saving transitions', async () => {
    const start = new Date(2026, 10, 1);
    const end = new Date(2026, 10, 2);
    const times = [new Date(start.getTime() - 60_000), start, new Date(end.getTime() - 60_000), end];
    const rows = times
      .map((time, index) => ({ ...appointment, id: index + 1, start: time.toISOString() }));
    const fetcher = vi.fn().mockImplementation(async (url, init) => {
      if (url.endsWith('GetPracticeAppointmentsForToggleOn')) return json(rows);
      if (url.endsWith('GetToolTip')) return text(tooltipHtml);
      return json({ status: true, html: visitAt(times[JSON.parse(init.body).id - 1]) });
    });
    expect(await pulse.listAppointments('2026-11-01', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ appointmentId: '2' }, { appointmentId: '3' }],
    });
    const form = fetcher.mock.calls[0][1].body as FormData;
    expect(form.get('startDate')).toBe('11/01/2026, 12:00:00 AM');
    expect(form.get('endDate')).toBe('11/02/2026, 12:00:00 AM');
    expect(form.get('start')).toBe(String(start.getTime() / 1000));
    expect(form.get('end')).toBe(String(end.getTime() / 1000));
    expect(fetcher).toHaveBeenCalledTimes(9);
  });

  it.each(['replacement', 'logout', 'navigation'])('stops after calendar session discontinuity: %s', async (change) => {
    const ctx = context();
    const fetcher = vi.fn().mockImplementationOnce(async () => {
      if (change === 'logout') document.querySelector('input')?.remove();
      else if (change === 'navigation') ctx.currentUrl = () => new URL('https://clinic.evetpractice.com/Account/Login');
      else document.querySelector('input')?.setAttribute('value', 'replacement');
      return json([appointment]);
    }).mockResolvedValue(text(tooltipHtml));
    ctx.fetch = fetcher;
    expect(await pulse.listAppointments('2026-11-16', ctx)).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('refuses stale URLs before the calendar request', async () => {
    const fetcher = vi.fn();
    expect(await pulse.listAppointments('2026-11-16', { ...context(fetcher), currentUrl: () => new URL('https://clinic.evetpractice.com/Account/Login') }))
      .toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['fetch', 'body', 'error'])('aborts queued tooltips on a DOM token switch during tooltip %s', async (stage) => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ ...appointment, id: index + 1 }));
    const body = vi.fn(async () => {
      document.querySelector('input')?.setAttribute('value', 'replacement');
      return tooltipHtml;
    });
    const fetcher = vi.fn().mockResolvedValueOnce(json(rows)).mockImplementationOnce(async () => {
      if (stage !== 'body') document.querySelector('input')?.setAttribute('value', 'replacement');
      if (stage === 'error') throw new TypeError();
      return { ok: true, text: body };
    }).mockResolvedValue(text(tooltipHtml));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: false, code: 'read_failed' });
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(5);
    for (const call of fetcher.mock.calls) expect(call[1].signal.aborted).toBe(true);
    if (stage === 'fetch') expect(body).not.toHaveBeenCalled();
  });

  it.each(['unchanged', 'tenant', 'patient', 'encounter', 'navigation', 'auth'])(
    'keeps imported appointments insufficient for export authority (%s)', async (change) => {
      const fetcher = vi.fn().mockResolvedValueOnce(json([appointment])).mockResolvedValue(text(tooltipHtml));
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

  it.each([1, '22'])('accepts numeric visit IDs and independent scalar patient IDs: %s', async (value) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json([{ ...appointment, id: value, patientId: 'patient-22' }]))
      .mockResolvedValue(text(tooltipHtml));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toMatchObject({
      ok: true, failures: [], appointments: [{ appointmentId: String(value), patientNumber: '22' }],
    });
  });

  it.each(['visit-12', 'Infinity', 'NaN'])('rejects nonnumeric visit IDs before detail requests: %s', async (id) => {
    const fetcher = vi.fn().mockResolvedValueOnce(json([{ ...appointment, id }]));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({
      ok: true, appointments: [], failures: [{ code: 'invalid_appointment', startsAt: null }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('fetches at most four tooltips concurrently and preserves calendar order', async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    const rows = Array.from({ length: 8 }, (_, index) => ({ ...appointment, id: index + 1 }));
    const fetcher = vi.fn().mockResolvedValueOnce(json(rows)).mockImplementation(async (_url, init: RequestInit) => {
      active++;
      peak = Math.max(peak, active);
      const id = typeof init.body === 'string' ? JSON.parse(init.body).id : Number((init.body as FormData).get('id'));
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
    ])).mockResolvedValue(text('<ul><li><label>Patient</label>Bella (#22)</li><li><label>Client</label>Ada Smith</li><li><label>Appointment Provider</label>Dr Hill</li></ul>'));
    expect(await pulse.listAppointments('2026-11-16', context(fetcher))).toEqual({ ok: true, failures: [], appointments: [
      { appointmentId: '12', patientNumber: '22', patientName: 'Bella Smith', ownerName: 'Ada Smith', vet: 'Dr Hill', start: '2026-11-16T14:00:00.000Z' },
    ] });
    expect(fetcher.mock.calls[0][0]).toBe('/Practice/Calendar/GetPracticeAppointmentsForToggleOn');
    const form = fetcher.mock.calls[0][1].body as FormData;
    expect(form.get('startDate')).toBe('11/16/2026, 12:00:00 AM');
    expect(form.get('endDate')).toBe('11/17/2026, 12:00:00 AM');
    expect(form.get('__RequestVerificationToken')).toBe('csrf');
    expect(fetcher).toHaveBeenCalledTimes(3);
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

describe('Pulse configured-practice capture', () => {
  beforeEach(() => { document.body.innerHTML = '<input name="__RequestVerificationToken" value="csrf">'; });
  it('retains raw patient/appointment/live clinician IDs and live time without display details', async () => {
    const { capturePulseAppointments } = await import('./pulse');
    const html = visitForm('11/16/2026','9','00','AM') + '<select id="ResourceId"><option value="resource-live" selected>Dr Current</option></select>';
    const fetcher = vi.fn(async (url:string) => url.endsWith('GetPracticeAppointmentsForToggleOn') ? json([{...appointment,resourceId:'resource-old'}])
      : url.endsWith('GetVisit') ? json({status:true,html}) : url.endsWith('GetCalendarResources') ? json([{id:'resource-live',name:'Dr Current'}]) : text(tooltipHtml));
    expect(await capturePulseAppointments('2026-11-16',context(fetcher))).toEqual({items:[{
      appointment_id:'12',patient_id:'22',clinician_id:'resource-live',encounter_id:null,
      starts_at:new Date(2026,10,16,9).toISOString(),ends_at:null,status:'active',
    }],failures:[]});
  });
  it('retains an explicitly cancelled feed row for safe cancellation reconciliation', async () => {
    const { capturePulseAppointments } = await import('./pulse');
    const fetcher = vi.fn(async () => json([{...appointment,resourceId:42,title:'Bella<br/><img src="ConfirmStatusIcons/cancel.png" alt="Canceled">'}]));
    expect(await capturePulseAppointments('2026-11-16',context(fetcher))).toMatchObject({items:[{appointment_id:'12',patient_id:'22',clinician_id:'42',status:'cancelled'}],failures:[]});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not turn a clinician display name into a raw provider identity', async () => {
    const { capturePulseAppointments } = await import('./pulse');
    const fetcher = vi.fn(async (url:string) => url.endsWith('GetPracticeAppointmentsForToggleOn') ? json([appointment])
      : url.endsWith('GetVisit') ? json({status:true,html:activeVisit}) : text(tooltipHtml));
    expect(await capturePulseAppointments('2026-11-16',context(fetcher))).toEqual({items:[],failures:[{appointment_id:'12',code:'identity_missing'}]});
  });
});

it('keeps ordinary display calls with navigation options separate from sync collection', async () => {
  document.body.innerHTML = '<input name="__RequestVerificationToken" value="csrf">';
  const fetcher = vi.fn(async (url:string) => url.endsWith('GetPracticeAppointmentsForToggleOn') ? json([appointment])
    : url.endsWith('GetVisit') ? json({status:true,html:activeVisit}) : text(tooltipHtml));
  expect(await pulse.listAppointments('2026-11-16',context(fetcher),{navigate:false})).toMatchObject({ok:true,appointments:[{appointmentId:'12'}],failures:[]});
});

it('keeps a removed Pulse visit unknown without fabricating a cancellation', async () => {
  const { capturePulseAppointments } = await import('./pulse');
  document.body.innerHTML = '<input name="__RequestVerificationToken" value="csrf">';
  const fetcher = vi.fn(async (url:string) => url.endsWith('GetPracticeAppointmentsForToggleOn') ? json([{...appointment,resourceId:'42'}])
    : url.endsWith('GetVisit') ? json({status:true,html:'<input id="IsActive" value="False">'}) : text(tooltipHtml));
  expect(await capturePulseAppointments('2026-11-16',context(fetcher))).toEqual({items:[],failures:[{appointment_id:'12',code:'read_failed'}]});
});
it('does not coerce a malformed numeric calendar resource into a clinician ID', async () => {
  const { capturePulseAppointments } = await import('./pulse');
  document.body.innerHTML = '<input name="__RequestVerificationToken" value="csrf">';
  const fetcher = vi.fn(async (url:string) => url.endsWith('GetPracticeAppointmentsForToggleOn') ? json([{...appointment,resourceId:1.5}])
    : url.endsWith('GetVisit') ? json({status:true,html:activeVisit}) : url.endsWith('GetCalendarResources') ? json([]) : text(tooltipHtml));
  expect(await capturePulseAppointments('2026-11-16',context(fetcher))).toEqual({items:[],failures:[{appointment_id:'12',code:'identity_missing'}]});
});
