import { vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { InspectResult } from '../protocol';
import type { CloudChartMeta } from '../../utils/chartQueries';

const list = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../utils/chartQueries', () => ({ listChartsPage: list.fn }));

import { ChartList, consultMatches } from './ChartList';

const chart = (id: string, name: string, updated: string, owner = 'Jane Owner'): CloudChartMeta => ({
  id, patient_name: name, patient_number: '', owner_name: owner, owner_phone: '', owner_email: '',
  species: 'canine', dentition: '', chart_date: '2026-11-01', recall_date: '', updated_at: updated, created_by: 'u1',
});

const writable = (patientName: string | null, patientNumber: string | null = null): InspectResult => ({
  tab: { id: 1, title: 'Consult' },
  candidates: 1,
  status: { state: 'writable', patientName, patientNumber, consult: { viewId: '1', recordId: '2' } },
  fields: [],
});

const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  vi.useFakeTimers();
  list.fn.mockReset();
  list.fn.mockResolvedValue({ rows: [chart('a', 'Bella', '2026-11-10'), chart('b', 'Max', '2026-11-09')], hasMore: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ChartList', () => {
  it('search debounced, paged', async () => {
    list.fn.mockResolvedValue({ rows: Array.from({ length: 20 }, (_, i) => chart(`c${i}`, `P${i}`, '2026-11-01')), hasMore: true });
    render(<ChartList inspect={null} onPick={vi.fn()} />);
    await flush();
    expect(list.fn).toHaveBeenCalledTimes(1);
    expect(list.fn).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', offset: 0, limit: 20 }));

    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'be' } });
    fireEvent.change(box, { target: { value: 'bella' } });
    await act(async () => { vi.advanceTimersByTime(299); });
    expect(list.fn).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1); });
    await flush();
    expect(list.fn).toHaveBeenCalledTimes(2);
    expect(list.fn).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'bella', offset: 0 }));

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    await flush();
    expect(list.fn).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'bella', offset: 20, limit: 20 }));
  });

  it('picking a chart calls onPick', async () => {
    const onPick = vi.fn();
    render(<ChartList inspect={null} onPick={onPick} />);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: /Max/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('distinguishes a consultation from the same patient’s dental procedure on the same date', async () => {
    const dental = chart('dental', 'Bella', '2026-11-10');
    const consultation = { ...dental, id: 'consultation', visit_type: 'consultation' };
    list.fn.mockResolvedValue({ rows: [dental, consultation], hasMore: false });
    const onPick = vi.fn();
    render(<ChartList inspect={null} onPick={onPick} />);
    await flush();
    expect(screen.getByRole('button', { name: /Bella.*2026-11-01.*Dental procedure/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Bella.*2026-11-01.*Consultation/ }));
    expect(onPick).toHaveBeenCalledWith(consultation);
  });

  it('pins the chart whose name equals the consult patient', async () => {
    render(<ChartList inspect={writable('Bella')} onPick={vi.fn()} />);
    await flush();
    const pin = screen.getByTestId('pinned-match');
    expect(pin).toHaveTextContent('Matches this consult');
    expect(pin).toHaveTextContent('Bella');
    expect(pin).not.toHaveTextContent('charts match');
    expect(screen.queryByTestId('possible-match')).toBeNull();
  });

  it('pins a chart whose name plus the owner surname is the ezyVet name', async () => {
    list.fn.mockResolvedValue({ rows: [chart('a', 'Bella', '2026-11-10', 'Mrs Jane Smith')], hasMore: false });
    render(<ChartList inspect={writable('Smith, Bella')} onPick={vi.fn()} />);
    await flush();
    expect(screen.getByTestId('pinned-match')).toHaveTextContent('Bella');
  });

  it('a one-word name that only subset-matches is a possible match, not a pin, with the ezyVet name shown', async () => {
    // Owner surname Owner, ezyVet says Smith: probably another Bella.
    render(<ChartList inspect={writable('Bella Smith')} onPick={vi.fn()} />);
    await flush();
    expect(screen.queryByTestId('pinned-match')).toBeNull();
    const maybe = screen.getByTestId('possible-match');
    expect(maybe).toHaveTextContent('Possible match for PIMS patient Bella Smith');
    expect(maybe).not.toHaveTextContent('Matches this consult');
    expect(maybe).toHaveTextContent('Bella');
  });

  it('pins the most recent of several exact matches and shows a count', async () => {
    list.fn.mockResolvedValue({
      rows: [chart('old', 'Bella', '2026-10-01'), chart('new', 'Bella', '2026-11-12'), chart('loose', 'Bella Jones', '2026-11-14')],
      hasMore: false,
    });
    const onPick = vi.fn();
    render(<ChartList inspect={writable('Bella')} onPick={onPick} />);
    await flush();
    const pin = screen.getByTestId('pinned-match');
    expect(pin).toHaveTextContent('2 charts match this patient');
    expect(pin).not.toHaveTextContent('Bella Jones');
    expect(screen.queryByTestId('possible-match')).toBeNull();
    fireEvent.click(pin.querySelector('button')!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
  });

  it('no pin without a patient name, a match, a writable consult or an inspect', async () => {
    const locked: InspectResult = { ...writable('Bella'), status: { state: 'locked', patientName: 'Bella', patientNumber: null, consult: null } };
    for (const inspect of [writable(null), writable('Rex'), locked, null]) {
      const { unmount } = render(<ChartList inspect={inspect} onPick={vi.fn()} />);
      await flush();
      expect(screen.queryByTestId('pinned-match')).toBeNull();
      expect(screen.queryByTestId('possible-match')).toBeNull();
      unmount();
    }
  });

  it('shows a translated error when listing fails', async () => {
    list.fn.mockRejectedValue(new Error('Failed to fetch'));
    render(<ChartList inspect={null} onPick={vi.fn()} />);
    await flush();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('consultMatches by patient number', () => {
  const numbered = (id: string, name: string, number: string, updated = '2026-11-10') =>
    ({ ...chart(id, name, updated), patient_number: number });

  it.each([undefined, 'ezyvet', 'daysmart'] as const)('equal unscoped numbers do not bypass names for %s', (provider) => {
    const c = numbered('a', 'Bella', '00123');
    const inspect = writable('Max Jones', '123');
    inspect.status!.provider = provider;
    expect(consultMatches([c], inspect)).toEqual({ exact: [], possible: [] });
    inspect.status!.patientName = 'Bella';
    expect(consultMatches([c], inspect)).toEqual({ exact: [c], possible: [] });
  });

  it('a DaySmart patient number alone does not pin a differently named chart', () => {
    const candidate = numbered('a', 'Bella', '123');
    const inspect = writable('Max Jones', '123');
    inspect.status!.provider = 'daysmart';
    expect(consultMatches([candidate], inspect)).toEqual({ exact: [], possible: [] });
  });

  it('an equal number cannot match when ezyVet shows no name', () => {
    const c = numbered('a', 'Bella', '123');
    expect(consultMatches([c], writable(null, '123'))).toEqual({ exact: [], possible: [] });
  });

  it('a different number is in neither list, even when the names match strictly', () => {
    const c = numbered('a', 'Bella', '124');
    expect(consultMatches([c], writable('Bella', '123'))).toEqual({ exact: [], possible: [] });
    expect(consultMatches([c], writable('Bella Smith', '123'))).toEqual({ exact: [], possible: [] });
  });

  it('a missing number on either side keeps the name rules', () => {
    const noNumber = numbered('a', 'Bella', '');
    const numberedChart = numbered('b', 'Bella', '123', '2026-11-09');
    expect(consultMatches([noNumber], writable('Bella', '123')).exact).toEqual([noNumber]);
    expect(consultMatches([numberedChart], writable('Bella', null)).exact).toEqual([numberedChart]);
    expect(consultMatches([numberedChart], writable('Bella Smith', '')).possible).toEqual([numberedChart]);
    expect(consultMatches([noNumber], writable(null, '123'))).toEqual({ exact: [], possible: [] });
  });
});
