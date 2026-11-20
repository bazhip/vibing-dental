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
import type { ChartLibraryViewState } from './chartLibraryData';
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

function setup(listImpl?: (q?: ChartListQuery) => Promise<{ rows: CloudChartMeta[]; hasMore: boolean }>, rechecksOnly = false, viewState?: { current: ChartLibraryViewState | undefined }) {
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
  const utils = render(<ChartLibrary {...props} rechecksOnly={rechecksOnly} viewState={viewState} />);
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
  it('restores Patients filters independently of the Rechecks workspace', async () => {
    const patientsState = { current: undefined as ChartLibraryViewState | undefined };
    const rechecksState = { current: undefined as ChartLibraryViewState | undefined };
    const patients = setup(undefined, false, patientsState);
    await screen.findByText('Bella');
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by species' }), { target: { value: 'feline' } });
    await waitFor(() => expect(patientsState.current?.speciesFilter).toBe('feline'));
    patients.unmount();
    const rechecks = setup(undefined, true, rechecksState);
    await screen.findByRole('heading', { name: 'Rechecks' });
    expect(screen.getByRole('combobox', { name: 'Filter by species' })).toHaveValue('');
    rechecks.unmount();
    const restored = setup(undefined, false, patientsState);
    await screen.findByText('Bella');
    expect(screen.getByRole('combobox', { name: 'Filter by species' })).toHaveValue('feline');
    expect(lastQuery(restored.listCharts)?.dueOnly).toBeUndefined();
  });

  it('Rechecks stays due-only while filtering and sorts earliest rechecks first', async () => {
    const { listCharts } = setup(undefined, true);
    await screen.findByRole('heading', { name: 'Rechecks' });
    expect(lastQuery(listCharts)).toMatchObject({ dueOnly: true, sortKey: 'recall', sortDir: 'asc' });
    expect(screen.queryByRole('button', { name: 'Rechecks due (2)' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by species' }), { target: { value: 'feline' } });
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ dueOnly: true, species: 'feline' }));
  });

  it('renders the same table structure, cells and labels', async () => {
    const { container } = setup();
    await screen.findByText('Max');
    expect(screen.getByRole('dialog', { name: 'Patients' })).toBeInTheDocument();
    expect(container.querySelector('.ai-settings-modal.chart-library-modal')).not.toBeNull();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Patient', 'Patient #', 'Species', 'Visits', 'Finalized', 'Updated▼', 'Recheck',
    ]);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rechecks due (2)' })).toHaveAttribute('aria-pressed', 'false'));
    const rows = container.querySelectorAll('.chart-library__scroll > .chart-library__row');
    expect(Array.from(rows).map((r) => r.querySelector('.chart-library__patient-main')?.firstChild?.textContent)).toEqual([
      'Bella', 'Max', 'Unnamed patient',
    ]);
    const bella = rows[0] as HTMLElement;
    expect(within(bella).getByText('Ann · Dr Ames')).toHaveClass('chart-library__owner');
    expect(bella.querySelector('.chart-library__recall--overdue')?.textContent).toMatch(/· overdue$/);
    expect(within(bella).getByRole('button', { name: 'Reminder' })).toBeInTheDocument();
    expect(within(bella).getByRole('button', { name: "Clear Bella's recheck reminder" })).toHaveAccessibleName("Clear Bella's recheck reminder");
    expect(within(bella).getByRole('button', { name: 'Delete chart for Bella' })).toBeInTheDocument();
    const max = rows[1] as HTMLElement;
    expect(max.querySelector('.chart-library__recall--due')?.textContent).toMatch(/· today$/);
    expect(within(max).getByTitle('2 visits — expand')).toBeInTheDocument();
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

  it('distinguishes a consultation from a legacy dental procedure on the same date', async () => {
    const { onOpen, onOpenHistory } = setup(async () => ({
      rows: [meta({ id: 'dental' }), meta({ id: 'consultation', visit_type: 'consultation' })],
      hasMore: false,
    }));
    fireEvent.click(await screen.findByTitle('2 visits — expand'));
    expect(screen.getByRole('button', { name: /Nov 12, 2026 · Dental procedure/ })).toBeInTheDocument();
    const consultation = screen.getByRole('button', { name: /Nov 12, 2026 · Consultation/ });
    await act(async () => { fireEvent.click(consultation); });
    expect(onOpen).toHaveBeenCalledWith('consultation');
    const visit = within(consultation.closest('[role="row"]') as HTMLElement);
    fireEvent.click(visit.getByRole('button', { name: 'Version history' }));
    expect(onOpenHistory).toHaveBeenCalledWith('consultation', 'Bella · Nov 12, 2026 · Consultation');
    await act(async () => { fireEvent.click(visit.getByRole('button', { name: /Delete/ })); });
    expect(confirm.fn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete Bella (Nov 12, 2026 · Consultation)?' }));
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
    const recheckFilter = screen.getByRole('button', { name: /^Rechecks due/ });
    expect(recheckFilter.closest('.chart-library__controls')).not.toBeNull();
    fireEvent.click(recheckFilter);
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ dueOnly: true }));
    fireEvent.click(screen.getByRole('button', { name: /^Patient$/ }));
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ sortKey: 'patient', sortDir: 'asc', offset: 0, limit: 200 }));
    fireEvent.click(screen.getByRole('button', { name: /^Patient$/ }));
    await waitFor(() => expect(lastQuery(listCharts)).toMatchObject({ sortKey: 'patient', sortDir: 'desc' }));
  });

  it.each(['Version history', 'Delete chart for Bella'])('keeps Actions open while pressing %s', async (name) => {
    const { container, onOpenHistory } = setup();
    const patient = (await screen.findByText('Bella')).closest<HTMLElement>('.chart-library__row')!;
    const summary = within(patient).getByText('Actions');
    fireEvent.click(summary);
    act(() => summary.focus());
    const action = within(patient).getByRole('button', { name });

    // Safari does not focus buttons on mouse press. The dialog can reclaim
    // focus before the click reaches the action if the press blurs the summary.
    if (fireEvent.mouseDown(action, { button: 0 })) {
      act(() => container.querySelector<HTMLElement>('.chart-library-modal')!.focus());
    }
    expect(summary.closest('details')).toHaveAttribute('open');

    fireEvent.click(action);
    expect(summary.closest('details')).not.toHaveAttribute('open');
    if (name === 'Version history') {
      expect(onOpenHistory).toHaveBeenCalledWith('a1', expect.stringContaining('Bella'));
    } else {
      await waitFor(() => expect(confirm.fn).toHaveBeenCalled());
    }
  });

  it('deletes a visit only after confirming, then refetches', async () => {
    const { onDelete, listCharts } = setup();
    const button = await screen.findByRole('button', { name: 'Delete chart for Bella' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rechecks due (2)' })).toBeInTheDocument());
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

  it('puts recheck removal next to the date without an otherwise empty actions menu', async () => {
    const { onOpen, onClearRecalls } = setup();
    const patient = (await screen.findByText('Max')).closest('.chart-library__row')!;
    const remove = within(patient as HTMLElement).getByRole('button', { name: "Clear Max's recheck reminder" });
    expect(remove.closest('.chart-library__cell--recall')).not.toBeNull();
    expect(patient.querySelector('.chart-library__actions-menu')).toBeNull();
    expect(remove.parentElement?.closest('button')).toBeNull();
    fireEvent.click(remove);
    await waitFor(() => expect(onClearRecalls).toHaveBeenCalledWith(['b1']));
    expect(onOpen).not.toHaveBeenCalled();
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
    fireEvent.click(await screen.findByTitle('Open latest visit for Bella'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onOpen).toHaveBeenCalledWith('a1');
  });

  it('shows Load more when the server has more', async () => {
    const { listCharts } = setup(async () => ({ rows: ROWS, hasMore: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more charts' }));
    await waitFor(() => expect(listCharts).toHaveBeenCalledWith(expect.objectContaining({ offset: 4, limit: 200 })));
  });
});


it('renders a page with a return action and no dialog semantics', async () => {
  const existing = setup();
  existing.unmount();
  render(<ChartLibrary {...existing} presentation="page" />);
  await screen.findByText('Max');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('region', { name: 'Patients' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to current visit' }));
  expect(existing.onClose).toHaveBeenCalledOnce();
});

it('keeps the patients workspace open when importing is cancelled', async () => {
  const existing = setup();
  existing.unmount();
  const onLoadPdf = vi.fn(async () => false);
  const { container } = render(<ChartLibrary {...existing} onLoadPdf={onLoadPdf} presentation="page" />);
  const file = new File(['pdf'], 'chart.pdf', { type: 'application/pdf' });
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  await waitFor(() => expect(onLoadPdf).toHaveBeenCalledWith(file));
  expect(existing.onClose).not.toHaveBeenCalled();
});

it('restores search and filters from session-owned view state when reopened', async () => {
  const existing = setup();
  existing.unmount();
  const viewState = { current: undefined };
  const first = render(<ChartLibrary {...existing} viewState={viewState} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Bella' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by species' }), { target: { value: 'canine' } });
  first.unmount();
  render(<ChartLibrary {...existing} viewState={viewState} />);
  expect(screen.getByRole('searchbox')).toHaveValue('Bella');
  expect(screen.getByRole('combobox', { name: 'Filter by species' })).toHaveValue('canine');
  await waitFor(() => expect(lastQuery(existing.listCharts)).toMatchObject({ search: 'Bella', species: 'canine' }));
});

it('opens a patient from the row background without double-opening its name button', async () => {
  const { container, onOpen } = setup();
  await screen.findByTitle('Open latest visit for Bella');
  const row = container.querySelector('.chart-library__group-main')!;
  fireEvent.click(row.querySelector('.chart-library__cell--number')!);
  await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(row.querySelector('.chart-library__open-patient')!).not.toBeDisabled());
  fireEvent.click(row.querySelector('.chart-library__open-patient')!);
  await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(2));
});


it('shows finalized status for single visits and a count with per-visit statuses for multiple visits', async () => {
  setup(async () => ({ rows: [
    meta({ id: 'a', finalized_at: '2026-11-18T12:00:00Z' }),
    meta({ id: 'b', patient_name: 'Max', patient_number: '22', finalized_at: '2026-11-18T12:00:00Z' }),
    meta({ id: 'c', patient_name: 'Max', patient_number: '22', chart_date: '2026-01-01' }),
  ], hasMore: false }));
  await screen.findByText('Bella');
  expect(screen.getByRole('columnheader', { name: 'Finalized' })).toBeVisible();
  const bella = screen.getByText('Bella').closest('[role="row"]')!;
  expect(within(bella as HTMLElement).getByText('Yes')).toBeVisible();
  const max = screen.getByText('Max').closest('[role="row"]')!;
  expect(within(max as HTMLElement).getByText('1 of 2')).toBeVisible();
  fireEvent.click(within(max as HTMLElement).getByRole('button', { name: /2 visits/ }));
  const visits = document.querySelectorAll('.chart-library__visit');
  expect(visits).toHaveLength(2);
  expect(within(visits[0] as HTMLElement).getByText('Yes')).toBeVisible();
  expect(within(visits[1] as HTMLElement).getByText('No')).toBeVisible();
});


it('keeps New patient with search and moves the rare PDF import to the footer', async () => {
  const { container, onNewPatient } = setup();
  await screen.findByText('Bella');
  const controls = container.querySelector('.chart-library__controls')!;
  expect(within(controls as HTMLElement).queryByRole('button', { name: 'Import chart PDF' })).toBeNull();
  const create = within(controls as HTMLElement).getByRole('button', { name: 'New patient' });
  fireEvent.click(create);
  expect(onNewPatient).toHaveBeenCalledOnce();
  const footer = container.querySelector('footer')!;
  expect(footer).not.toBeNull();
  expect(within(footer).getByRole('button', { name: 'Import chart PDF' })).toBeVisible();
  expect(screen.getByRole('searchbox')).toHaveAttribute('placeholder', 'Search patients or owners…');
});
