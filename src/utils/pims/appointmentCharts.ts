import type { CloudChartMeta } from '../chartQueries';
import type { Appointment } from '../../extension/ezyvet/appointments';
import { normaliseName, ownerSurname, samePatientNumber } from './patientMatch';

export type AppointmentAction =
  | { kind: 'open'; chart: CloudChartMeta }
  | { kind: 'newVisit'; latest: CloudChartMeta }
  | { kind: 'start' };

const sameWords = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');

function belongsTo(chart: CloudChartMeta, appt: Pick<Appointment, 'patientName' | 'patientNumber' | 'ownerName' | 'provider'>): boolean {
  const byNumber = samePatientNumber(chart.patient_number, appt.patientNumber);
  if (byNumber === false) return false;
  if (normaliseName(chart.patient_name) !== normaliseName(appt.patientName)) return false;
  const chartSurname = ownerSurname(chart.owner_name);
  return chartSurname.length > 0 && sameWords(chartSurname, ownerSurname(appt.ownerName));
}

/** What the side panel offers for an appointment, from the practice's existing charts. */
export function appointmentAction(
  appt: Pick<Appointment, 'patientName' | 'patientNumber' | 'ownerName' | 'provider'>,
  charts: CloudChartMeta[],
  today: string,
): AppointmentAction {
  const mine = charts.filter((c) => belongsTo(c, appt));
  const newest = (a: CloudChartMeta, b: CloudChartMeta) => ((b.updated_at || '') > (a.updated_at || '') ? b : a);
  const todays = mine.filter((c) => c.chart_date === today);
  if (todays.length) return { kind: 'open', chart: todays.reduce(newest) };
  if (!mine.length) return { kind: 'start' };
  const latest = mine.reduce((a, b) => {
    const da = a.chart_date || '';
    const db = b.chart_date || '';
    return db > da ? b : db < da ? a : newest(a, b);
  });
  return { kind: 'newVisit', latest };
}
