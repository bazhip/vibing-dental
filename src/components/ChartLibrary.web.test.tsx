import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The website's "My charts" dialog. Task 5 moved its data and actions into
// useChartLibraryList (shared with the iOS Patients tab); these pin the web
// markup and behaviour so that refactor can't change them.

vi.mock('../native/platform', () => ({ isNativeApp: () => false, WEB_ORIGIN: 'https://toothops.app/', initNativeShell: () => {} }));
vi.mock('../hooks/useTeam', () => ({
  useTeam: () => ({
    loaded: true,
    role: 'owner',
    practice: null,
    members: [
      { userId: 'u1', email: 'a@x.test', doctorName: 'Dr Ames', role: 'owner', isYou: true, pending: false, isPrimaryOwner: true },
      { userId: 'u2', email: 'b@x.test', doctorName: '', role: 'member', isYou: false, pending: false, isPrimaryOwner: false },
    ],
  }),
}));
const confirm = vi.hoisted(() => ({ fn: vi.fn(async (_opts: { title: string; confirmLabel?: string }) => true) }));
vi.mock('./ui/dialogs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ui/dialogs')>()),
  confirmDialog: (opts: { title: string; confirmLabel?: string }) => confirm.fn(opts),
}));

import { ChartLibrary } from './ChartLibrary';
import type { CloudChartMeta, ChartListQuery } from '../hooks/useCloudSync';

const meta = (over: Partial<CloudChartMeta> & { id: string }): CloudChartMeta => ({
  patient_name: 'Bella', patient_number: '11', owner_name: '', owner_phone: '', owner_email: '',
  species: 'canine', dentition: 'permanent', chart_date: '2026-11-12', recall_date: '',
  updated_at: '2026-11-12T12:00:00Z', created_by: 'u1', ...over,
});

const ROWS: CloudChartMeta[] = [
  meta({ id: 'a1', owner_name: 'Ann', owner_email: 'ann@x.test', recall_date: '2026-11-01' }),
  meta({ id: 'b1', patient_name: 'Max', patient_number: '22', species: 'feline', chart_date: '2026-11-10', updated_at: '2026-11-10T12:00:00Z', recall_date: '2026-11-13', created_by: 'u2' }),
  meta({ id: 'b2', patient_name: 'Max', patient_number: '22', species: 'feline', chart_date: '2026-10-01', updated_at: '2026-10-01T12:00:00Z' }),
  meta({ id: 'c1', patient_name: '', patient_number: '', dentition: 'deciduous', recall_date: '2026-12-20', updated_at: '2026-09-01T12:00:00Z' }),
];

function setup(listImpl?: (q?: ChartListQuery) => Promise<{ rows: CloudChartMeta[]; hasMore: boolean }>) {
  const props = {
    listCharts: vi.fn(listImpl ?? (async (q?: ChartListQuery) => ({ rows: q?.dueOnly ? ROWS.filter((r) => r.recall_date && r.recall_date <= '2026-11-13') : ROWS, hasMore: false }))),
    onOpen: vi.fn(async () => true),
    onDelete: vi.fn(async () => {}),
    onNewVisit: vi.fn(),
    onOpenHistory: vi.fn(),
    onSendReminder: vi.fn(),
    onClearRecalls: vi.fn(async () => {}),
    onNewPatient: vi.fn(),
    onLoadPdf: vi.fn(),
    onClose: vi.fn(),
  };
  const utils = render(<ChartLibrary {...props} />);
  return { ...props, ...utils };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 13, 9, 0, 0));
  confirm.fn.mockClear();
});
afterEach(() => vi.useRealTimers());

const lastQuery = (fn: ReturnType<typeof vi.fn>) =>
  (fn.mock.calls.map((c) => c[0] as ChartListQuery).filter((q) => q && !(q.dueOnly && q.limit === 500 && !q.sortKey)).at(-1));

describe('ChartLibrary (website)', () => {
  it('renders the same table structure, cells and labels', async () => {
    const { container } = setup();
    await screen.findByText('Max');
    expect(screen.getByRole('dialog', { name: 'My charts' })).toBeInTheDocument();
    expect(container.querySelector('.ai-settings-modal.chart-library-modal')).not.toBeNull();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Patient', 'Patient #', 'Species', 'Visits', 'Updated▼', 'Recheck',
    ]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Due (2)' })).toHaveAttribute('aria-pressed', 'false'));
    const rows = container.querySelectorAll('.chart-library__scroll > .chart-library__row');
    expect(Array.from(rows).map((r) => r.querySelector('.chart-library__patient-main')?.firstChild?.textContent)).toEqual([
      'Bella', 'Max', 'Unnamed patient',
    ]);
    const bella = rows[0] as HTMLElement;
    expect(within(bella).getByText('Ann · Dr Ames')).toHaveClass('chart-library__owner');
    expect(bella.querySelector('.chart-library__recall--overdue')?.textContent).toMatch(/· overdue$/);
    expect(within(bella).getByRole('button', { name: 'Reminder' })).toBeInTheDocument();
    expect(within(bella).getByRole('button', { name: "Clear Bella's recheck reminder" })).toHaveTextContent('×');
    expect(within(bella).getByRole('button', { name: 'Delete chart for Bella' })).toBeInTheDocument();
    const max = rows[1] as HTMLElement;
    expect(max.querySelector('.chart-library__recall--due')?.textContent).toMatch(/· today$/);
    expect(within(max).getByText('2 visits')).toBeInTheDocument();
    expect(within(max).getByText('Feline')).toBeInTheDocument();
    expect(within(max).queryByRole('button', { name: /Delete/ })).toBeNull();
    const unnamed = rows[2] as HTMLElement;
    expect(within(unnamed).getByText('Canine · Deciduous')).toBeInTheDocument();
    expect(unnamed.querySelector('.chart-library__cell--number.chart-library__cell--empty')?.textContent).toBe('—');
    expect(screen.getByRole('combobox', { name: 'Filter by species' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter by doctor' })).toHaveTextContent('All doctorsDr Amesb@x.test');
  });

  it('expands a multi-visit patient into visit rows with History and Delete', async () => {
    const { container } = setup();
    fireEvent.click(await screen.findByTitle('2 visits — expand'));
    const visits = container.querySelectorAll('.chart-library__visit');
    expect(visits).toHaveLength(2);
    expect(within(visits[0] as HTMLElement).getByText(/^Dr Ames · Updated|^b@x.test · Updated/)).toBeInTheDocument();
    expect(within(visits[1] as HTMLElement).getByRole('button', { name: 'Delete the 2026-10-01 visit for Max' })).toBeInTheDocument();
  });

  it('search, species, doctor, Due and sort go to the server query', async () => {
    const { listCharts } = setup();
    await screen.findByText('Max');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search charts' }), { target: { value: ' max ' } });
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ search: 'max' }), { timeout: 1000 });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by species' }), { target: { value: 'feline' } });
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ search: 'max', species: 'feline' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by doctor' }), { target: { value: 'u2' } });
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ createdBy: 'u2' }));
    fireEvent.click(screen.getByRole('button', { name: /^Due/ }));
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ dueOnly: true }));
    fireEvent.click(screen.getByRole('button', { name: /^Patient$/ }));
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ sortKey: 'patient', sortDir: 'asc', offset: 0, limit: 200 }));
    fireEvent.click(screen.getByRole('button', { name: /^Patient$/ }));
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ sortKey: 'patient', sortDir: 'desc' }));
  });

  it('deletes a visit only after confirming, then refetches', async () => {
    const { onDelete, listCharts } = setup();
    const button = await screen.findByRole('button', { name: 'Delete chart for Bella' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Due (2)' })).toBeInTheDocument());
    const before = listCharts.mock.calls.length;
    fireEvent.click(button);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('a1'));
    expect(confirm.fn).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/^Delete Bella \(.+\)\?$/), confirmLabel: 'Delete visit' }));
    // The list (keeping as many rows as were showing) and the Due badge.
    await waitFor(() => expect(listCharts.mock.calls.length).toBe(before + 2));
    expect(listCharts.mock.calls.slice(before).map((c) => c[0])).toEqual([
      expect.objectContaining({ offset: 0, limit: 200, sortKey: 'updated' }),
      { dueOnly: true, limit: 500 },
    ]);
  });

  it('does not delete when the confirm is cancelled', async () => {
    confirm.fn.mockResolvedValueOnce(false);
    const { onDelete } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete chart for Bella' }));
    await waitFor(() => expect(confirm.fn).toHaveBeenCalled());
    await act(async () => {});
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('clears a recheck after confirming', async () => {
    const { onClearRecalls } = setup();
    fireEvent.click(await screen.findByRole('button', { name: "Clear Bella's recheck reminder" }));
    await waitFor(() => expect(onClearRecalls).toHaveBeenCalledWith(['a1']));
    expect(confirm.fn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Clear Bella’s recheck?', confirmLabel: 'Clear recheck' }));
  });

  it('sends a reminder from the visit with an owner email', async () => {
    const { onSendReminder } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Reminder' }));
    expect(onSendReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });

  it('shows the load error text', async () => {
    setup(async () => { throw new Error('boom'); });
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Couldn’t load your charts\. /);
  });

  it('opens a single-visit patient and closes', async () => {
    const { onOpen, onClose } = setup();
    fireEvent.click(await screen.findByTitle('Open Bella'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onOpen).toHaveBeenCalledWith('a1');
  });

  it('shows Load more when the server has more', async () => {
    const { listCharts } = setup(async () => ({ rows: ROWS, hasMore: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more charts' }));
    await waitFor(() => expect(listCharts).toHaveBeenCalledWith(expect.objectContaining({ offset: 4, limit: 200 })));
  });
});
