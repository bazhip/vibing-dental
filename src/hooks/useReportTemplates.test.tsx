import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReportTemplates } from './useReportTemplates';

const db = vi.hoisted(() => ({ from: vi.fn(), order: vi.fn(), single: vi.fn(), eq: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), select: vi.fn() }));
vi.mock('../utils/supabaseClient', () => ({ cloudEnabled: true, supabase: { from: db.from } }));
const original = { id: 'a', name: 'Cleaning', body: 'Original' };

beforeEach(() => {
  vi.resetAllMocks();
  db.from.mockReturnValue(db);
  db.select.mockReturnValue(db);
  db.insert.mockReturnValue(db);
  db.update.mockReturnValue(db);
  db.delete.mockReturnValue(db);
  db.order.mockResolvedValue({ data: [original], error: null });
  db.single.mockResolvedValue({ data: { id: 'b', name: 'Extraction', body: 'New' }, error: null });
  db.eq.mockImplementation((column: string) => column === 'kind' ? db : Promise.resolve({ error: null }));
});

describe('useReportTemplates mounted consumers', () => {
  it('synchronizes create, update and delete between settings and the chart', async () => {
    const settings = renderHook(() => useReportTemplates('practice'));
    const chart = renderHook(() => useReportTemplates('practice'));
    await waitFor(() => expect(settings.result.current.loaded && chart.result.current.loaded).toBe(true));
    await act(async () => { await settings.result.current.create('Extraction', 'New'); });
    expect(db.insert).toHaveBeenCalledWith({ name: 'Extraction', body: 'New', kind: 'treatment', practice_id: 'practice' });
    expect(chart.result.current.templates).toEqual(settings.result.current.templates);
    expect(chart.result.current.templates).toHaveLength(2);
    await act(async () => { await chart.result.current.update('b', 'Extraction revised', 'Revised'); });
    expect(settings.result.current.templates.find((template) => template.id === 'b')?.body).toBe('Revised');
    await act(async () => { await settings.result.current.remove('a'); });
    expect(chart.result.current.templates).toEqual([{ id: 'b', name: 'Extraction revised', body: 'Revised' }]);
  });

  it('loads, inserts and broadcasts per kind', async () => {
    const ct = renderHook(() => useReportTemplates('practice', 'ct'));
    const treatment = renderHook(() => useReportTemplates('practice'));
    await waitFor(() => expect(ct.result.current.loaded && treatment.result.current.loaded).toBe(true));
    expect(db.eq).toHaveBeenCalledWith('kind', 'ct');
    expect(db.eq).toHaveBeenCalledWith('kind', 'treatment');
    await act(async () => { await ct.result.current.create('Extraction', 'New'); });
    expect(db.insert).toHaveBeenCalledWith({ name: 'Extraction', body: 'New', kind: 'ct', practice_id: 'practice' });
    expect(ct.result.current.templates).toHaveLength(2);
    expect(treatment.result.current.templates).toEqual([original]);
  });

  it('preserves a successful edit when another consumer finishes an older initial load', async () => {
    const settings = renderHook(() => useReportTemplates('practice'));
    await waitFor(() => expect(settings.result.current.loaded).toBe(true));
    let finish: (result: { data: typeof original[]; error: null }) => void;
    db.order.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const chart = renderHook(() => useReportTemplates('practice'));
    await act(async () => { await settings.result.current.update('a', 'Cleaning', 'Updated'); });
    await act(async () => { finish!({ data: [original], error: null }); });
    expect(chart.result.current.templates).toEqual([{ ...original, body: 'Updated' }]);
  });

  it('does not broadcast failed saves', async () => {
    const settings = renderHook(() => useReportTemplates('practice'));
    const chart = renderHook(() => useReportTemplates('practice'));
    await waitFor(() => expect(settings.result.current.loaded && chart.result.current.loaded).toBe(true));
    db.eq.mockResolvedValueOnce({ error: { message: 'Failed' } });
    await act(async () => { await expect(settings.result.current.update('a', 'Cleaning', 'Unsaved')).rejects.toThrow('Failed'); });
    expect(chart.result.current.templates).toEqual([original]);
  });
});
