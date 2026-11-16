import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { consultPatientNumber, listAppointments, parseTooltip, type PageDeps } from './appointments';

const TIP = (patient: string, time = '09:30AM', owner = 'Mr Smith, Jane') =>
  `<div><label>Patient</label><span class="value">${patient}</span></div><div><label>Time</label><span class="value">${time}</span></div><div><label>Owner</label><span class="value">${owner}</span></div>`;

const DATE = '2026-11-16';

type Block = Record<string, string | undefined>;
function block(attrs: Block): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  return `<div id="appt${attrs['data-record-id'] ?? 'x'}"${a}></div>`;
}
function dashboard(opts: { blocks?: string[]; cols?: string[]; date?: string; dayActive?: boolean } = {}) {
  document.body.innerHTML = `
    <div id="rightpane"><div class="dashboard active">
      ${opts.cols ? opts.cols.map((c) => `<div class="sep"><span>${c}</span></div>`).join('') : ''}
      ${(opts.blocks ?? []).join('')}
    </div></div>
    <div id="calendarSideList"><input name="currentdate" value="${opts.date ?? '2000-01-01'}"></div>
    <div id="timespanSelector"><div class="${opts.dayActive ? 'active' : ''}"><span data-text="Day"></span></div></div>`;
}
const good = (over: Block = {}): string =>
  block({ 'data-record-id': '55', 'data-appointment': '900', 'data-animal': '3', 'data-start': '34200', 'data-col': '2', ...over });

let fetchTooltip: Mock<(c: 'Appointment' | 'Consult', id: string) => Promise<string>>;
let deps: PageDeps;
beforeEach(() => {
  fetchTooltip = vi.fn(async (_c: 'Appointment' | 'Consult', _id: string) => TIP('Bella (12345)'));
  deps = { doc: document, fetchTooltip, wait: async () => {} };
  (window as unknown as { calendarRefresh?: () => void }).calendarRefresh = vi.fn();
});
afterEach(() => {
  document.body.innerHTML = '';
  delete (window as unknown as { calendarRefresh?: () => void }).calendarRefresh;
});
const refresh = () => (window as unknown as { calendarRefresh: ReturnType<typeof vi.fn> }).calendarRefresh;

describe('parseTooltip', () => {
  it('parses name, number, owner and time', () => {
    expect(parseTooltip(TIP('Bella (12345)'))).toEqual({
      patientName: 'Bella',
      patientNumber: '12345',
      ownerName: 'Mr Smith, Jane',
      time: '09:30AM',
    });
  });
  it('takes the last bracketed group as the number', () => {
    const r = parseTooltip(TIP('Bella (Bee) (123)'));
    expect(r?.patientName).toBe('Bella (Bee)');
    expect(r?.patientNumber).toBe('123');
  });
  it('returns null without brackets or when empty', () => {
    expect(parseTooltip(TIP('Bella'))).toBeNull();
    expect(parseTooltip('')).toBeNull();
  });
  it('decodes HTML entities', () => {
    expect(parseTooltip(TIP('Ch&eacute;ri (7)'))?.patientName).toBe('Chéri');
  });
});

describe('listAppointments', () => {
  it('does not navigate when navigate is false and not on the calendar', async () => {
    document.body.innerHTML = '<button id="dashboardSectionButton"></button>';
    const click = vi.fn();
    document.querySelector('#dashboardSectionButton')!.addEventListener('click', click);
    expect(await listAppointments(DATE, { navigate: false }, deps)).toEqual({ ok: false, code: 'not_on_calendar' });
    expect(click).not.toHaveBeenCalled();
  });
  it('reports no_dashboard when navigating without a button', async () => {
    document.body.innerHTML = '';
    expect(await listAppointments(DATE, { navigate: true }, deps)).toEqual({ ok: false, code: 'no_dashboard' });
  });
  it('clicks the dashboard button and proceeds', async () => {
    document.body.innerHTML = '<button id="dashboardSectionButton"></button>';
    document.querySelector('#dashboardSectionButton')!.addEventListener('click', () => dashboard({ blocks: [good()], cols: ['Dr Ng', 'Dr Lee'] }));
    const r = await listAppointments(DATE, { navigate: true }, deps);
    expect(r.ok).toBe(true);
  });
  it('sets the date and calls calendarRefresh once', async () => {
    dashboard();
    await listAppointments(DATE, { navigate: false }, deps);
    expect((document.querySelector('[name="currentdate"]') as HTMLInputElement).value).toBe(DATE);
    expect(refresh()).toHaveBeenCalledTimes(1);
  });
  it('does not refresh when the date is already set', async () => {
    dashboard({ date: DATE });
    await listAppointments(DATE, { navigate: false }, deps);
    expect(refresh()).not.toHaveBeenCalled();
  });
  it('reports no_calendar_refresh and no_date_input', async () => {
    dashboard();
    delete (window as unknown as { calendarRefresh?: () => void }).calendarRefresh;
    expect(await listAppointments(DATE, { navigate: false }, deps)).toEqual({ ok: false, code: 'no_calendar_refresh' });
    document.querySelector('[name="currentdate"]')!.remove();
    expect(await listAppointments(DATE, { navigate: false }, deps)).toEqual({ ok: false, code: 'no_date_input' });
  });
  it('clicks Day only when it is not active', async () => {
    dashboard({ dayActive: false });
    const click = vi.fn();
    document.querySelector('[data-text="Day"]')!.addEventListener('click', click);
    await listAppointments(DATE, { navigate: false }, deps);
    expect(click).toHaveBeenCalledTimes(1);
    dashboard({ dayActive: true });
    const click2 = vi.fn();
    document.querySelector('[data-text="Day"]')!.addEventListener('click', click2);
    await listAppointments(DATE, { navigate: false }, deps);
    expect(click2).not.toHaveBeenCalled();
  });
  it('skips blocks without an animal', async () => {
    dashboard({ date: DATE, blocks: [good({ 'data-animal': '0' }), good({ 'data-animal': undefined })] });
    const r = await listAppointments(DATE, { navigate: false }, deps);
    expect(r).toEqual({ ok: true, appointments: [], failures: [] });
    expect(fetchTooltip).not.toHaveBeenCalled();
  });
  it('maps a block to an appointment', async () => {
    dashboard({ date: DATE, blocks: [good()], cols: ['Dr Ng', 'Dr Lee'] });
    const r = await listAppointments(DATE, { navigate: false }, deps);
    expect(r).toEqual({
      ok: true,
      failures: [],
      appointments: [
        {
          appointmentId: '900',
          patientName: 'Bella',
          patientNumber: '12345',
          ownerName: 'Mr Smith, Jane',
          vet: 'Dr Lee',
          start: new Date(2026, 10, 16, 9, 30).toISOString(),
        },
      ],
    });
    expect(fetchTooltip).toHaveBeenCalledWith('Appointment', '55');
  });
  it('falls back to the tooltip time without data-start', async () => {
    dashboard({ date: DATE, blocks: [good({ 'data-start': undefined })], cols: ['Dr Ng', 'Dr Lee'] });
    const r = await listAppointments(DATE, { navigate: false }, deps);
    expect(r.ok && r.appointments[0].start).toBe(new Date(2026, 10, 16, 9, 30).toISOString());
  });
  it('records failures with codes and times only', async () => {
    dashboard({
      date: DATE,
      blocks: [
        good({ 'data-record-id': '1', 'data-appointment': undefined }),
        good({ 'data-record-id': '2' }),
        good({ 'data-record-id': '3' }),
        good({ 'data-record-id': '4', 'data-start': undefined }),
      ],
    });
    fetchTooltip.mockImplementation(async (_c, id) => {
      if (id === '2') return '';
      if (id === '3') return TIP('Bella');
      throw new Error('boom Bella');
    });
    const r = await listAppointments(DATE, { navigate: false }, deps);
    expect(r.ok && r.failures).toEqual([
      { code: 'no_appointment_id', startsAt: new Date(2026, 10, 16, 9, 30).toISOString() },
      { code: 'tooltip_empty', startsAt: new Date(2026, 10, 16, 9, 30).toISOString() },
      { code: 'tooltip_not_parsed', startsAt: new Date(2026, 10, 16, 9, 30).toISOString() },
      { code: 'tooltip_fetch_failed', startsAt: null },
    ]);
    expect(JSON.stringify(r)).not.toContain('Bella');
  });
  it('keeps an appointment with vet null when data-col is missing', async () => {
    dashboard({ date: DATE, blocks: [good({ 'data-col': undefined })], cols: ['Dr Ng'] });
    const r = await listAppointments(DATE, { navigate: false }, deps);
    expect(r.ok && r.appointments.map((x) => x.vet)).toEqual([null]);
    expect(r.ok && r.failures).toEqual([]);
  });
  it('fails a block without a record id and does not fetch', async () => {
    dashboard({ date: DATE, blocks: [good({ 'data-record-id': undefined })] });
    const r = await listAppointments(DATE, { navigate: false }, deps);
    expect(r.ok && r.failures.map((f) => f.code)).toEqual(['no_appointment_id']);
    expect(fetchTooltip).not.toHaveBeenCalled();
  });
  it('runs at most 4 tooltip fetches at once', async () => {
    dashboard({ date: DATE, blocks: Array.from({ length: 10 }, (_, i) => good({ 'data-record-id': String(i), 'data-appointment': String(i) })) });
    let live = 0;
    let max = 0;
    fetchTooltip.mockImplementation(async () => {
      live++;
      max = Math.max(max, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return TIP('Bella (1)');
    });
    const r = await listAppointments(DATE, { navigate: false }, deps);
    expect(r.ok && r.appointments).toHaveLength(10);
    expect(max).toBe(4);
  });
  it('never puts tooltip HTML into the page', async () => {
    dashboard({ date: DATE, blocks: [good()] });
    const before = document.body.innerHTML;
    await listAppointments(DATE, { navigate: false }, deps);
    expect(document.body.innerHTML).toBe(before);
  });
});

describe('consultPatientNumber', () => {
  it('returns the number', async () => {
    expect(await consultPatientNumber('4521', deps)).toBe('12345');
    expect(fetchTooltip).toHaveBeenCalledWith('Consult', '4521');
  });
  it('returns null when unparsable or the fetch throws', async () => {
    fetchTooltip.mockResolvedValueOnce(TIP('Bella'));
    expect(await consultPatientNumber('1', deps)).toBeNull();
    fetchTooltip.mockRejectedValueOnce(new Error('x'));
    expect(await consultPatientNumber('1', deps)).toBeNull();
  });
});
