import { vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { InspectResult } from '../protocol';
import type { CloudChartMeta } from '../../utils/chartQueries';

const list = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../utils/chartQueries', () => ({ listChartsPage: list.fn }));

import { ChartList } from './ChartList';

const chart = (id: string, name: string, updated: string): CloudChartMeta => ({
  id, patient_name: name, patient_number: '', owner_name: 'Owner', owner_phone: '', owner_email: '',
  species: 'canine', dentition: '', chart_date: '2026-11-01', recall_date: '', updated_at: updated, created_by: 'u1',
});

const writable = (patientName: string | null): InspectResult => ({
  tab: { id: 1, title: 'Consult' },
  candidates: 1,
  status: { state: 'writable', patientName, consult: { viewId: '1', recordId: '2' } },
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

  it('pins the chart matching a writable consult', async () => {
    render(<ChartList inspect={writable('Bella Smith')} onPick={vi.fn()} />);
    await flush();
    const pin = screen.getByTestId('pinned-match');
    expect(pin).toHaveTextContent('Matches this consult');
    expect(pin).toHaveTextContent('Bella');
    expect(pin).not.toHaveTextContent('charts match');
  });

  it('pins the most recent of several matches and shows a count', async () => {
    list.fn.mockResolvedValue({
      rows: [chart('old', 'Bella', '2026-10-01'), chart('new', 'Bella Jones', '2026-11-12')],
      hasMore: false,
    });
    const onPick = vi.fn();
    render(<ChartList inspect={writable('Bella')} onPick={onPick} />);
    await flush();
    const pin = screen.getByTestId('pinned-match');
    expect(pin).toHaveTextContent('Bella Jones');
    expect(pin).toHaveTextContent('2 charts match this patient');
    fireEvent.click(pin.querySelector('button')!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
  });

  it('no pin without a patient name, a match, a writable consult or an inspect', async () => {
    const locked: InspectResult = { ...writable('Bella'), status: { state: 'locked', patientName: 'Bella', consult: null } };
    for (const inspect of [writable(null), writable('Rex'), locked, null]) {
      const { unmount } = render(<ChartList inspect={inspect} onPick={vi.fn()} />);
      await flush();
      expect(screen.queryByTestId('pinned-match')).toBeNull();
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
