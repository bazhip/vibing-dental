import { describe, expect, it } from 'vitest';
import type { CloudChartMeta } from '../chartQueries';
import { appointmentAction } from './appointmentCharts';

const chart = (o: Partial<CloudChartMeta>): CloudChartMeta => ({
  id: 'c', patient_name: 'Bella', patient_number: '', owner_name: '', owner_phone: '', owner_email: '', species: 'canine',
  dentition: '', chart_date: '2026-11-01', recall_date: '', updated_at: '2026-11-01T10:00:00Z', created_by: 'u', ...o,
});
const appt = { patientName: 'Bella', patientNumber: '123', ownerName: 'Smith, Jane' };
const TODAY = '2026-11-16';

describe('appointmentAction', () => {
  it('does not treat patient numbers from a different PIMS as globally unique', () => {
    const other = chart({ patient_name: 'Max', patient_number: '123', chart_date: TODAY });
    expect(appointmentAction({ ...appt, provider: 'daysmart' }, [other], TODAY)).toEqual({ kind: 'start' });
  });
  it('opens today\'s chart matched by number (newest updated)', () => {
    const a = chart({ id: 'a', patient_number: '0123', chart_date: TODAY, updated_at: '2026-11-16T08:00:00Z' });
    const b = chart({ id: 'b', patient_number: '123', chart_date: TODAY, updated_at: '2026-11-16T09:00:00Z' });
    expect(appointmentAction(appt, [a, b], TODAY)).toEqual({ kind: 'open', chart: b });
  });
  it('offers a new visit from the latest older chart', () => {
    const a = chart({ id: 'a', patient_number: '123', chart_date: '2026-09-01' });
    const b = chart({ id: 'b', patient_number: '123', chart_date: '2026-10-01' });
    expect(appointmentAction(appt, [a, b], TODAY)).toEqual({ kind: 'newVisit', latest: b });
  });
  it('matches a chart without a number by name and owner surname', () => {
    const c = chart({ owner_name: 'Jane Smith' });
    expect(appointmentAction(appt, [c], TODAY)).toEqual({ kind: 'newVisit', latest: c });
  });
  it('matches owner "Mr Smith, Jane" against chart owner "Jane Smith"', () => {
    const c = chart({ owner_name: 'Jane Smith' });
    expect(appointmentAction({ ...appt, ownerName: 'Mr Smith, Jane' }, [c], TODAY).kind).toBe('newVisit');
  });
  it('starts when the same name has no owner on the chart', () => {
    expect(appointmentAction(appt, [chart({})], TODAY)).toEqual({ kind: 'start' });
  });
  it('starts when the same name has a different number', () => {
    expect(appointmentAction(appt, [chart({ patient_number: '999', owner_name: 'Jane Smith' })], TODAY)).toEqual({ kind: 'start' });
  });
  it('starts with no charts', () => {
    expect(appointmentAction(appt, [], TODAY)).toEqual({ kind: 'start' });
  });
});
