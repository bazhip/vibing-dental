import { vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18n from '../../i18n';
import type { Appointment } from '../ezyvet/appointments';
import type { CloudChartMeta } from '../../utils/chartQueries';
import { WEB_APP_ORIGIN } from '../protocol';

const m = vi.hoisted(() => ({
  appointments: vi.fn(),
  startChart: vi.fn(),
  chartsForPatients: vi.fn(),
  today: { value: '2026-11-16' },
}));
vi.mock('./internalTransport', () => ({
  internalTransport: { appointments: m.appointments, startChart: m.startChart },
}));
vi.mock('../../utils/chartQueries', () => ({ chartsForPatients: m.chartsForPatients }));
vi.mock('../../utils/localDate', () => ({ localDateISO: () => m.today.value }));

import { START_LOCK_MS, TodaysPatients } from './TodaysPatients';

const appt = (id: string, start: string, patientName: string, patientNumber: string, ownerName: string, vet: string | null = 'Dr Lee'): Appointment => ({
  appointmentId: id, start, patientName, patientNumber, ownerName, vet,
});
const chart = (id: string, number: string, chartDate: string): CloudChartMeta => ({
  id, patient_name: 'x', patient_number: number, owner_name: '', owner_phone: '', owner_email: '',
  species: 'canine', dentition: '', chart_date: chartDate, recall_date: '', updated_at: chartDate, created_by: 'u1',
});
const tab = { id: 3, title: 'ezyVet' };
const ok = (appointments: Appointment[], failures: { code: string; startsAt: string | null }[] = []) => ({ tab, result: { ok: true, appointments, failures } });
const fail = (code: string) => ({ tab, result: { ok: false, code } });

const timeOf = (iso: string) => new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

const tabsCreate = vi.fn();

beforeEach(() => {
  m.appointments.mockReset();
  m.startChart.mockReset().mockResolvedValue({ ok: true });
  m.chartsForPatients.mockReset().mockResolvedValue([]);
  m.today.value = '2026-11-16';
  tabsCreate.mockReset();
  vi.stubGlobal('chrome', { tabs: { create: tabsCreate } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TodaysPatients', () => {
  it('loads without navigating; not on the calendar offers Load, which navigates, and Refresh then navigates too', async () => {
    m.appointments.mockResolvedValue(fail('not_on_calendar'));
    render(<TodaysPatients userId="u1" />);
    const load = await screen.findByRole('button', { name: "Load today’s patients" });
    expect(m.appointments).toHaveBeenCalledTimes(1);
    expect(m.appointments).toHaveBeenLastCalledWith('2026-11-16', false);
    expect(screen.getByText('This may switch your practice software to the calendar.')).toBeInTheDocument();

    m.appointments.mockResolvedValue(ok([]));
    fireEvent.click(load);
    await screen.findByText("No patients on today’s PIMS schedule.");
    expect(m.appointments).toHaveBeenLastCalledWith('2026-11-16', true);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(m.appointments).toHaveBeenCalledTimes(3));
    expect(m.appointments).toHaveBeenLastCalledWith('2026-11-16', true);
  });

  it('Refresh before Load does not navigate', async () => {
    m.appointments.mockResolvedValue(ok([]));
    render(<TodaysPatients userId="u1" />);
    await screen.findByText("No patients on today’s PIMS schedule.");
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(m.appointments).toHaveBeenCalledTimes(2));
    expect(m.appointments).toHaveBeenLastCalledWith('2026-11-16', false);
  });

  it('no ezyVet tab', async () => {
    m.appointments.mockResolvedValue({ tab: null, result: null });
    render(<TodaysPatients userId="u1" />);
    expect(await screen.findByText('Open PIMS to see today’s patients.')).toBeInTheDocument();
  });

  it('counts appointments that could not be read', async () => {
    m.appointments.mockResolvedValue(ok([appt('1', '2026-11-16T09:00:00', 'Bella', '1', 'Smith, Jane')], [
      { code: 'tooltip_empty', startsAt: null }, { code: 'tooltip_not_parsed', startsAt: '2026-11-16T10:00:00' },
    ]));
    render(<TodaysPatients userId="u1" />);
    expect(await screen.findByText("2 appointments couldn’t be read.")).toBeInTheDocument();
    expect(screen.queryByText("No patients on today’s PIMS schedule.")).toBeNull();
  });

  it.each([
    ['no_dashboard', 'pims:panel.today.errors.no_dashboard'],
    ['no_date_input', 'pims:panel.today.errors.no_date_input'],
    ['no_calendar_refresh', 'pims:panel.today.errors.no_calendar_refresh'],
    ['read_failed', 'pims:panel.today.errors.read_failed'],
    ['something_new', 'pims:panel.today.errors.unknown'],
  ] as const)('error %s', async (code, key) => {
    m.appointments.mockResolvedValue(fail(code));
    render(<TodaysPatients userId="u1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t(key));
  });

  it('a transport failure is the unknown error', async () => {
    m.appointments.mockRejectedValue(new Error('timeout'));
    render(<TodaysPatients userId="u1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('pims:panel.today.errors.unknown'));
  });

  it('rows sorted by start with time, patient, owner and vet', async () => {
    m.appointments.mockResolvedValue(ok([
      appt('2', '2026-11-16T09:30:00', 'Max', '2', 'Jones, Tom', null),
      appt('1', '2026-11-16T09:00:00', 'Bella', '1', 'Smith, Jane'),
    ]));
    render(<TodaysPatients userId="u1" />);
    await screen.findByText('Bella');
    const rows = screen.getAllByTestId('today-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(timeOf('2026-11-16T09:00:00'));
    expect(rows[0]).toHaveTextContent('Bella');
    expect(rows[0]).toHaveTextContent('Smith, Jane · Dr Lee');
    expect(rows[1]).toHaveTextContent(timeOf('2026-11-16T09:30:00'));
    expect(rows[1]).toHaveTextContent('Max');
    expect(rows[1]).toHaveTextContent('Jones, Tom');
    expect(m.chartsForPatients).toHaveBeenCalledWith([
      expect.objectContaining({ patientNumber: '1', patientName: 'Bella' }),
      expect.objectContaining({ patientNumber: '2', patientName: 'Max' }),
    ]);
  });

  it('Start chart, New visit, Open chart and Start new chart', async () => {
    m.appointments.mockResolvedValue(ok([
      appt('1', '2026-11-16T09:00:00', 'Bella', '1', 'Smith, Jane'),
      appt('2', '2026-11-16T09:30:00', 'Max', '2', 'Jones, Tom'),
      appt('3', '2026-11-16T10:00:00', 'Rex', '3', 'Brown, Ann'),
    ]));
    m.chartsForPatients.mockResolvedValue([chart('old2', '2', '2026-10-01'), chart('today3', '3', '2026-11-16')]);
    render(<TodaysPatients userId="u1" />);
    await screen.findByText('Bella');
    const [bella, max, rex] = screen.getAllByTestId('today-row');

    // Each successful hand-over locks the start buttons for START_LOCK_MS.
    const unlock = async () => {
      await act(async () => { vi.advanceTimersByTime(START_LOCK_MS); });
    };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      fireEvent.click(within(bella).getByRole('button', { name: 'Start chart' }));
      await waitFor(() => expect(m.startChart).toHaveBeenLastCalledWith({ userId: 'u1', patientName: 'Bella', patientNumber: '1', ownerName: 'Smith, Jane', latestChartId: null }));
      await unlock();

      fireEvent.click(within(max).getByRole('button', { name: 'New visit' }));
      await waitFor(() => expect(m.startChart).toHaveBeenLastCalledWith({ userId: 'u1', patientName: 'Max', patientNumber: '2', ownerName: 'Jones, Tom', latestChartId: 'old2' }));
      await unlock();

      fireEvent.click(within(rex).getByRole('button', { name: 'Open chart' }));
      expect(tabsCreate).toHaveBeenCalledWith({ url: `${WEB_APP_ORIGIN}/#/chart/today3` });

      fireEvent.click(within(rex).getByRole('button', { name: 'Start new chart' }));
      await waitFor(() => expect(m.startChart).toHaveBeenLastCalledWith({ userId: 'u1', patientName: 'Rex', patientNumber: '3', ownerName: 'Brown, Ann', latestChartId: null }));
      expect(screen.queryByText("Couldn’t open ToothOps. Try again.")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns every start button off while a hand-over is pending and for a moment after it opens ToothOps', async () => {
    m.appointments.mockResolvedValue(ok([
      appt('1', '2026-11-16T09:00:00', 'Bella', '1', 'Smith, Jane'),
      appt('2', '2026-11-16T09:30:00', 'Max', '2', 'Jones, Tom'),
      appt('3', '2026-11-16T10:00:00', 'Rex', '3', 'Brown, Ann'),
    ]));
    m.chartsForPatients.mockResolvedValue([chart('old2', '2', '2026-10-01'), chart('today3', '3', '2026-11-16')]);
    let resolve!: (r: { ok: boolean }) => void;
    m.startChart.mockImplementation(() => new Promise((r) => { resolve = r; }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<TodaysPatients userId="u1" />);
      await screen.findByText('Bella');
      const startButtons = () => [
        screen.getByRole('button', { name: 'Start chart' }),
        screen.getByRole('button', { name: 'New visit' }),
        screen.getByRole('button', { name: 'Start new chart' }),
      ];
      const start = startButtons()[0];
      fireEvent.click(start);
      fireEvent.click(start); // a double click
      expect(m.startChart).toHaveBeenCalledTimes(1);
      for (const b of startButtons()) expect(b).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Open chart' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'New visit' }));
      expect(m.startChart).toHaveBeenCalledTimes(1);

      await act(async () => { resolve({ ok: true }); });
      for (const b of startButtons()) expect(b).toBeDisabled();
      await act(async () => { vi.advanceTimersByTime(START_LOCK_MS - 100); });
      for (const b of startButtons()) expect(b).toBeDisabled();
      await act(async () => { vi.advanceTimersByTime(100); });
      for (const b of startButtons()) expect(b).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a failed hand-over turns the start buttons back on at once; a newer click clears the old failure', async () => {
    m.appointments.mockResolvedValue(ok([appt('1', '2026-11-16T09:00:00', 'Bella', '1', 'Smith, Jane')]));
    m.startChart.mockResolvedValueOnce({ ok: false });
    render(<TodaysPatients userId="u1" />);
    const start = await screen.findByRole('button', { name: 'Start chart' });
    fireEvent.click(start);
    expect(await screen.findByText("Couldn’t open ToothOps. Try again.")).toBeInTheDocument();
    expect(start).toBeEnabled();

    let resolve!: (r: { ok: boolean }) => void;
    m.startChart.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    fireEvent.click(start);
    expect(screen.queryByText("Couldn’t open ToothOps. Try again.")).toBeNull();
    await act(async () => { resolve({ ok: true }); });
    expect(screen.queryByText("Couldn’t open ToothOps. Try again.")).toBeNull();
    expect(m.startChart).toHaveBeenCalledTimes(2);
  });

  it('a failed hand-over says so', async () => {
    m.appointments.mockResolvedValue(ok([appt('1', '2026-11-16T09:00:00', 'Bella', '1', 'Smith, Jane')]));
    m.startChart.mockResolvedValue({ ok: false });
    render(<TodaysPatients userId="u1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Start chart' }));
    expect(await screen.findByText("Couldn’t open ToothOps. Try again.")).toBeInTheDocument();
  });

  it('a chart lookup failure still lists the patients, all with Start chart', async () => {
    m.appointments.mockResolvedValue(ok([
      appt('1', '2026-11-16T09:00:00', 'Bella', '1', 'Smith, Jane'),
      appt('2', '2026-11-16T09:30:00', 'Max', '2', 'Jones, Tom'),
    ]));
    m.chartsForPatients.mockRejectedValue(new Error('db'));
    render(<TodaysPatients userId="u1" />);
    await screen.findByText('Bella');
    expect(screen.getAllByRole('button', { name: 'Start chart' })).toHaveLength(2);
  });

  it('focus on a new day reloads; focus on the same day does not', async () => {
    m.appointments.mockResolvedValue(ok([]));
    render(<TodaysPatients userId="u1" />);
    await screen.findByText("No patients on today’s PIMS schedule.");
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(m.appointments).toHaveBeenCalledTimes(1);

    m.today.value = '2026-11-17';
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(m.appointments).toHaveBeenCalledTimes(2));
    expect(m.appointments).toHaveBeenLastCalledWith('2026-11-17', false);
  });

  it('only the newest answer counts', async () => {
    let first!: (v: unknown) => void;
    m.appointments.mockReturnValueOnce(new Promise((r) => { first = r; }));
    m.appointments.mockResolvedValueOnce(ok([]));
    render(<TodaysPatients userId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText("No patients on today’s PIMS schedule.");
    await act(async () => { first({ tab: null, result: null }); });
    expect(screen.queryByText("Open PIMS to see today’s patients.")).toBeNull();
    expect(screen.getByText("No patients on today’s PIMS schedule.")).toBeInTheDocument();
  });
});
