import { useCallback, useEffect, useRef, useState } from 'react';
import type { Appointment } from '../ezyvet/appointments';
import { internalTransport } from './internalTransport';
import { chartsForPatients, type CloudChartMeta } from '../../utils/chartQueries';
import { appointmentAction, type AppointmentAction } from '../../utils/pims/appointmentCharts';
import { localDateISO } from '../../utils/localDate';

export type TodayRow = { appt: Appointment; action: AppointmentAction };

export type TodayState =
  | { kind: 'loading' }
  | { kind: 'noTab' }
  | { kind: 'notOnCalendar' }
  | { kind: 'error'; code: string }
  | { kind: 'ready'; date: string; rows: TodayRow[]; failed: number };

/**
 * Today's appointments from the ezyVet calendar tab, each with what the panel offers for it.
 *
 * Loads on mount with `navigate: false` (never moves the ezyVet tab). `refresh(true)` lets the
 * background switch the tab to the calendar; once the vet has asked for that (`navigated`), the
 * caller passes `true` on Refresh too. Kept in memory only; a focus on a new day reloads. Only the
 * newest request may write state.
 */
export function useTodaysAppointments(userId: string): { state: TodayState; refresh(navigate: boolean): void; navigated: boolean } {
  const [state, setState] = useState<TodayState>({ kind: 'loading' });
  const [navigated, setNavigated] = useState(false);
  const latest = useRef(0);
  const loadedFor = useRef<string | null>(null);

  const refresh = useCallback((navigate: boolean) => {
    const id = ++latest.current;
    const date = localDateISO();
    loadedFor.current = date;
    if (navigate) setNavigated(true);
    setState({ kind: 'loading' });
    const current = () => id === latest.current;
    void (async () => {
      let next: TodayState;
      try {
        const res = await internalTransport.appointments(date, navigate);
        const result = res.result;
        if (!res.tab) next = { kind: 'noTab' };
        else if (!result) next = { kind: 'error', code: 'unknown' };
        else if (!result.ok) next = result.code === 'not_on_calendar' ? { kind: 'notOnCalendar' } : { kind: 'error', code: result.code };
        else {
          const appts = [...result.appointments].sort((a, b) => a.start.localeCompare(b.start));
          let charts: CloudChartMeta[] = [];
          // Without the lookup every patient still shows, with Start chart.
          try { charts = await chartsForPatients(appts); } catch { charts = []; }
          next = { kind: 'ready', date, rows: appts.map((appt) => ({ appt, action: appointmentAction(appt, charts, date) })), failed: result.failures.length };
        }
      } catch {
        next = { kind: 'error', code: 'unknown' };
      }
      if (current()) setState(next);
    })();
  }, []);

  useEffect(() => {
    refresh(false);
  }, [userId, refresh]);

  useEffect(() => {
    const onFocus = () => {
      if (loadedFor.current !== localDateISO()) refresh(false);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { state, refresh, navigated };
}
