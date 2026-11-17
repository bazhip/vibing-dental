import { describe, expect, it } from 'vitest';
import { duePatients, groupByPatient } from './chartLibraryData';
import type { CloudChartMeta } from '../utils/chartQueries';

const chart = (id: string, chart_date: string, recall_date: string): CloudChartMeta => ({
  id, patient_name: 'Rex', patient_number: '7', owner_name: '', owner_phone: '', owner_email: '',
  species: 'canine', dentition: 'permanent', chart_date, recall_date, updated_at: `${chart_date}T10:00:00Z`, created_by: 'u1',
});

describe('a patient’s recheck date', () => {
  it('is the latest visit’s: the recheck visit supersedes the earlier visit’s date', () => {
    const [g] = groupByPatient([chart('recheck', '2026-11-01', ''), chart('surgery', '2026-10-01', '2026-10-15')]);
    expect(g.recall).toBe('');
    expect(duePatients([chart('recheck', '2026-11-01', ''), chart('surgery', '2026-10-01', '2026-10-15')], '2026-11-15')).toEqual([]);
  });

  it('a new recheck set at the latest visit is the one shown', () => {
    const [g] = groupByPatient([chart('surgery', '2026-10-01', '2026-10-15'), chart('recheck', '2026-11-01', '2027-05-01')]);
    expect(g.recall).toBe('2027-05-01');
  });
});

it('separates same-name patients and preserves history after an editable number changes', () => {
  const a = { ...chart('a', '2026-11-01', ''), patient_id: 'patient-a', patient_number: 'P-A' };
  const a2 = { ...chart('a2', '2026-11-02', ''), patient_id: 'patient-a', patient_number: '666' };
  const b = { ...chart('b', '2026-11-01', ''), patient_id: 'patient-b', patient_number: 'P-B' };
  const groups = groupByPatient([a2, a, b]);
  expect(groups).toHaveLength(2);
  expect(groups[0].number).toBe('666');
  expect(groups[0].visits.map(v => v.id)).toEqual(['a2', 'a']);
});
