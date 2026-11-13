import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../native/platform', () => ({ isNativeApp: () => true, WEB_ORIGIN: 'https://toothops.app/', initNativeShell: () => {} }));
vi.mock('../../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));
vi.mock('../../hooks/useTeam', () => ({
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

import { fakeLibrary, meta, panel, renderShell } from './testHarness';
import type { ChartListQuery } from '../../hooks/useCloudSync';

const ROWS = [
  meta({ id: 'a1', owner_name: 'Ann', owner_email: 'ann@x.test', recall_date: '2026-11-01' }),
  meta({ id: 'b1', patient_name: 'Max', patient_number: '22', species: 'feline', chart_date: '2026-11-10', updated_at: '2026-11-10T12:00:00Z', recall_date: '2026-11-13', created_by: 'u2' }),
  meta({ id: 'b2', patient_name: 'Max', patient_number: '22', species: 'feline', chart_date: '2026-10-01', updated_at: '2026-10-01T12:00:00Z' }),
  meta({ id: 'c1', patient_name: 'Coco', patient_number: '', updated_at: '2026-09-01T12:00:00Z', recall_date: '2026-12-20' }),
];

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 13, 9, 0, 0));
});
afterEach(() => vi.useRealTimers());

const queries = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((c) => (c[0] ?? {}) as ChartListQuery);
/** The list's own queries (not the Due count's). */
const listQueries = (fn: ReturnType<typeof vi.fn>) => queries(fn).filter((q) => q.sortKey);

async function openPatients(rows = ROWS) {
  const library = fakeLibrary(rows);
  const utils = renderShell(library, 'patients');
  const p = panel('patients');
  await within(p).findByText('Max');
  return { ...utils, library, p };
}

function patientRow(p: HTMLElement, name: string) {
  return within(p).getByRole('button', { name: new RegExp(`^${name}`) });
}

describe('PatientsScreen', () => {
  it('large title, search field, and a root bar that leaves the leading slot empty', async () => {
    const { p } = await openPatients();
    expect(within(p).getByRole('heading', { level: 1, name: 'Patients' })).toBeInTheDocument();
    expect(within(p).getByRole('searchbox', { name: /Search patients/ })).toBeInTheDocument();
    expect(p.querySelector('.ios-navbar__leading')?.childElementCount).toBe(0);
  });

  it('lists patients grouped, with #PID · visits · Updated and a recheck label', async () => {
    const { p } = await openPatients();
    const bella = patientRow(p, 'Bella');
    expect(bella).toHaveTextContent('#11 · 1 visit · Updated');
    expect(within(bella).getByText(/^Overdue · /)).toHaveClass('ios-recall', 'ios-recall--overdue');
    const max = patientRow(p, 'Max');
    expect(max).toHaveTextContent('#22 · 2 visits · Updated');
    expect(within(max).getByText('Due today')).toHaveClass('ios-recall--due');
    const coco = patientRow(p, 'Coco');
    expect(coco).toHaveTextContent(/^Coco1 visit · Updated/);
    expect(within(coco).getByText(/^Recheck /)).toHaveClass('ios-recall--upcoming');
  });

  it('search filters the list through the server query', async () => {
    const { p, library } = await openPatients();
    fireEvent.change(within(p).getByRole('searchbox'), { target: { value: 'max' } });
    await waitFor(() => expect(within(p).queryByText('Bella')).toBeNull(), { timeout: 1000 });
    expect(within(p).getByText('Max')).toBeInTheDocument();
    expect(listQueries(library.listCharts as never).at(-1)).toMatchObject({ search: 'max' });
    fireEvent.click(within(p).getByRole('button', { name: 'Clear search' }));
    await within(p).findByText('Bella', {}, { timeout: 1000 });
  });

  it('the filter menu has every sort, species, doctor and Due option, and applies each', async () => {
    const { p, library } = await openPatients();
    const list = library.listCharts as unknown as ReturnType<typeof vi.fn>;
    const openMenu = () => {
      fireEvent.click(within(p).getByRole('button', { name: 'Filter and sort' }));
      return screen.getByRole('menu');
    };
    let menu = openMenu();
    const groups = within(menu).getAllByRole('group').map((g) => [
      g.getAttribute('aria-label'),
      Array.from(g.querySelectorAll<HTMLElement>('[role^="menuitem"]')).map((i) => `${i.textContent}${i.getAttribute('aria-checked') === 'true' ? ' ✓' : ''}`),
    ]);
    await waitFor(() => expect(groups).toBeTruthy());
    expect(groups).toEqual([
      ['Sort by', ['Name', 'Last updated ✓', 'Recheck date']],
      ['Order', ['Newest first ✓', 'Oldest first']],
      ['Species', ['All species ✓', 'Canine', 'Feline']],
      ['Doctor', ['All doctors ✓', 'Dr Ames', 'b@x.test']],
      [null, [expect.stringMatching(/^Due for recheck/)]],
    ]);
    const pick = async (label: string, expected: Partial<ChartListQuery>) => {
      fireEvent.click(Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')).find((i) => i.textContent === label)!);
      await waitFor(() => expect(listQueries(list).at(-1)).toMatchObject(expected));
      menu = openMenu();
    };
    await pick('Name', { sortKey: 'patient', sortDir: 'asc' });
    expect(within(menu).getByRole('group', { name: 'Order' })).toHaveTextContent('A to ZZ to A');
    await pick('Z to A', { sortKey: 'patient', sortDir: 'desc' });
    await pick('Recheck date', { sortKey: 'recall', sortDir: 'asc' });
    await pick('Latest first', { sortKey: 'recall', sortDir: 'desc' });
    await pick('Last updated', { sortKey: 'updated', sortDir: 'desc' });
    await pick('Oldest first', { sortKey: 'updated', sortDir: 'asc' });
    await pick('Feline', { species: 'feline' });
    await pick('Canine', { species: 'canine' });
    await pick('All species', { species: undefined });
    await pick('b@x.test', { createdBy: 'u2' });
    await pick('All doctors', { createdBy: undefined });
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Due for recheck (2)' })).toHaveAttribute('aria-checked', 'false');
    await pick('Due for recheck (2)', { dueOnly: true });
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'Due for recheck (2)' })).toHaveAttribute('aria-checked', 'true');
    expect(within(p).getByRole('button', { name: 'Filter and sort' })).toHaveClass('ios-glass-button--prominent');
    expect(within(p).queryByText('Coco')).toBeNull();
  });

  it('patient swipe actions: Send reminder, Clear recheck (confirmed), History — and no Delete', async () => {
    const { p, library } = await openPatients();
    const more = () => within(p).getByRole('button', { name: 'More actions for Bella' });
    fireEvent.click(more());
    const actions = () => more().closest('.ios-swiperow')!.querySelector('.ios-swiperow__actions') as HTMLElement;
    expect(within(actions()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Send reminder', 'Clear recheck', 'History']);
    fireEvent.click(within(actions()).getByRole('button', { name: 'Send reminder' }));
    expect(library.sendReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));

    fireEvent.click(more());
    fireEvent.click(within(actions()).getByRole('button', { name: 'History' }));
    expect(library.openHistory).toHaveBeenCalledWith('a1', expect.stringContaining('Bella'));

    fireEvent.click(more());
    fireEvent.click(within(actions()).getByRole('button', { name: 'Clear recheck' }));
    const alert = await screen.findByRole('alertdialog');
    expect(alert).toHaveTextContent('Clear Bella’s recheck?');
    expect(library.clearRecalls).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Clear recheck' })));
    await waitFor(() => expect(library.clearRecalls).toHaveBeenCalledWith(['a1']));

    // Max has no owner email (no reminder) and his recheck is clearable.
    fireEvent.click(within(p).getByRole('button', { name: 'More actions for Max' }));
    const maxActions = within(p).getByRole('button', { name: 'More actions for Max' }).closest('.ios-swiperow')!.querySelector('.ios-swiperow__actions') as HTMLElement;
    expect(within(maxActions).getAllByRole('button').map((b) => b.textContent)).toEqual(['Clear recheck', 'History']);
    expect(p.querySelectorAll('.ios-swiperow__action--destructive')).toHaveLength(0);
  });

  it('long-press menu on a patient: Open plus the same actions, no Delete', async () => {
    const { p, onOpenChart } = await openPatients();
    fireEvent.contextMenu(patientRow(p, 'Bella'));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Open', 'Send reminder', 'Clear recheck', 'History']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Open' }));
    await waitFor(() => expect(onOpenChart).toHaveBeenCalledWith('a1'));
  });

  it('tapping a patient pushes their visits; a visit opens in the Chart tab', async () => {
    const { p, onOpenChart } = await openPatients();
    fireEvent.click(patientRow(p, 'Max'));
    const back = await within(p).findByRole('button', { name: /Patients/ });
    expect(back).toBeInTheDocument();
    const visits = await within(p).findAllByRole('button', { name: /Updated/ });
    const visitTitles = visits.map((v) => v.querySelector('.ios-row__title')?.textContent);
    expect(visitTitles).toHaveLength(2);
    expect(visits[0]).toHaveTextContent('b@x.test · Updated');
    fireEvent.click(visits[1]);
    await waitFor(() => expect(onOpenChart).toHaveBeenCalledWith('b2'));
  });

  it('visit rows: Delete (destructive) asks to confirm; Open opens; New visit starts one', async () => {
    const { p, library, onOpenChart } = await openPatients();
    fireEvent.click(patientRow(p, 'Max'));
    await within(p).findAllByRole('button', { name: /Updated/ });
    const mores = () => within(p).getAllByRole('button', { name: /^More actions for/ }).filter((b) => b.closest('.ios-visits'));
    expect(mores()).toHaveLength(2);
    fireEvent.click(mores()[1]);
    const actions = mores()[1].closest('.ios-swiperow')!.querySelector('.ios-swiperow__actions') as HTMLElement;
    expect(within(actions).getAllByRole('button').map((b) => b.textContent)).toEqual(['Delete', 'Open']);
    expect(within(actions).getByRole('button', { name: 'Delete' })).toHaveClass('ios-swiperow__action--destructive');

    // Cancel keeps the visit.
    fireEvent.click(within(actions).getByRole('button', { name: 'Delete' }));
    let alert = await screen.findByRole('alertdialog');
    expect(alert).toHaveTextContent(/Delete Max \(.+\)\?/);
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Cancel' })));
    expect(library.deleteChart).not.toHaveBeenCalled();

    fireEvent.click(mores()[1]);
    fireEvent.click(within(mores()[1].closest('.ios-swiperow')!.querySelector('.ios-swiperow__actions') as HTMLElement).getByRole('button', { name: 'Delete' }));
    alert = await screen.findByRole('alertdialog');
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Delete visit' })));
    await waitFor(() => expect(library.deleteChart).toHaveBeenCalledWith('b2'));

    fireEvent.click(mores()[0]);
    fireEvent.click(within(mores()[0].closest('.ios-swiperow')!.querySelector('.ios-swiperow__actions') as HTMLElement).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(onOpenChart).toHaveBeenCalledWith('b1'));

    fireEvent.click(within(p).getByRole('button', { name: 'New visit' }));
    await waitFor(() => expect(library.newVisit).toHaveBeenCalledWith('b1'));
  });

  it('visit long-press menu: Open, History, Delete (destructive)', async () => {
    const { p } = await openPatients();
    fireEvent.click(patientRow(p, 'Max'));
    const visits = await within(p).findAllByRole('button', { name: /Updated/ });
    fireEvent.contextMenu(visits[0]);
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Open', 'History', 'Delete']);
    expect(items[2]).toHaveClass('ios-menu__item--destructive');
  });

  it('refetches when libraryVersion changes and when the tab is shown again', async () => {
    const { library, rerenderWith } = await openPatients();
    const list = library.listCharts as unknown as ReturnType<typeof vi.fn>;
    const n = listQueries(list).length;
    rerenderWith({ ...library, libraryVersion: 1 });
    await waitFor(() => expect(listQueries(list).length).toBe(n + 1));
    rerenderWith({ ...library, libraryVersion: 1 }, 'chart');
    rerenderWith({ ...library, libraryVersion: 1 }, 'patients');
    await waitFor(() => expect(listQueries(list).length).toBe(n + 2));
  });

  it('does not load until the tab is first shown', async () => {
    const library = fakeLibrary(ROWS);
    const { rerenderWith } = renderShell(library, 'chart');
    await act(async () => {});
    expect(library.listCharts).not.toHaveBeenCalled();
    rerenderWith(library, 'patients');
    await within(panel('patients')).findByText('Max');
  });

  it('without saved charts (trial) asks to sign in', () => {
    renderShell(null, 'patients');
    expect(within(panel('patients')).getByText('Sign in to see your saved charts.')).toBeInTheDocument();
  });

  it('Add menu: New patient and Import chart PDF', async () => {
    const { p, library } = await openPatients();
    fireEvent.click(within(p).getByRole('button', { name: 'Add' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['New patient', 'Import chart PDF']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'New patient' }));
    await waitFor(() => expect(library.newPatient).toHaveBeenCalled());
  });
});
