import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../native/platform', () => ({ isNativeApp: () => true, WEB_ORIGIN: 'https://toothops.app/', initNativeShell: () => {} }));
vi.mock('../../native/haptics', () => ({ hapticSelection: vi.fn(), hapticTap: vi.fn(), hapticImpact: vi.fn(), hapticSuccess: vi.fn() }));
vi.mock('../../hooks/useTeam', () => ({ useTeam: () => ({ loaded: true, role: 'owner', practice: null, members: [] }) }));

import { fakeLibrary, meta, panel, renderShell } from './testHarness';
import { groupRechecks } from './RechecksScreen';

// Fixed clock: today is 13 Nov 2026 (local).
const TODAY = '2026-11-13';
const ROWS = [
  meta({ id: 'a1', patient_name: 'Bella', patient_number: '11', owner_name: 'Ann', owner_email: 'ann@x.test', recall_date: '2026-11-01' }),
  meta({ id: 'b1', patient_name: 'Max', patient_number: '22', recall_date: TODAY }),
  // Two visits: the soonest recheck (5 Nov) wins, so Coco is overdue.
  meta({ id: 'c1', patient_name: 'Coco', patient_number: '33', chart_date: '2026-11-10', recall_date: TODAY, owner_email: 'c@x.test' }),
  meta({ id: 'c2', patient_name: 'Coco', patient_number: '33', chart_date: '2026-10-05', recall_date: '2026-11-05' }),
  // Not due yet (the server's dueOnly filter drops it).
  meta({ id: 'd1', patient_name: 'Dot', patient_number: '44', recall_date: '2026-11-14' }),
];

beforeAll(() => {
  window.ResizeObserver = window.ResizeObserver ?? class { observe() {} unobserve() {} disconnect() {} };
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 13, 23, 30, 0));
});
afterEach(() => vi.useRealTimers());

describe('groupRechecks', () => {
  it('splits due patients into Overdue (before today) and Due today, soonest first', () => {
    const { overdue, today } = groupRechecks(ROWS, TODAY, 'Unnamed');
    expect(overdue.map((g) => [g.name, g.recall])).toEqual([['Bella', '2026-11-01'], ['Coco', '2026-11-05']]);
    expect(today.map((g) => g.name)).toEqual(['Max']);
  });
});

describe('RechecksScreen', () => {
  async function open(rows = ROWS) {
    const library = fakeLibrary(rows, TODAY);
    const utils = renderShell(library, 'rechecks');
    const p = panel('rechecks');
    await within(p).findByText('Max');
    return { ...utils, library, p };
  }

  it('asks the server for due charts and shows Overdue and Due today sections', async () => {
    const { p, library } = await open();
    expect(library.listCharts).toHaveBeenCalledWith(expect.objectContaining({ dueOnly: true }));
    expect(within(p).getByRole('heading', { level: 1, name: 'Rechecks' })).toBeInTheDocument();
    expect(p.querySelector('.ios-navbar__leading')?.childElementCount).toBe(0);
    const overdue = within(p).getByRole('list', { name: 'Overdue' });
    const today = within(p).getByRole('list', { name: 'Due today' });
    expect(within(overdue).getAllByRole('button', { name: /^(Bella|Coco|Max)/ }).map((b) => b.querySelector('.ios-row__title')?.textContent)).toEqual(['Bella', 'Coco']);
    expect(within(today).getAllByRole('button', { name: /^(Bella|Coco|Max)/ }).map((b) => b.querySelector('.ios-row__title')?.textContent)).toEqual(['Max']);
    expect(within(p).queryByText('Dot')).toBeNull();
    expect(within(p).queryByText(/Later/)).toBeNull();
  });

  it('swipe actions: Send reminder opens the composer; Clear recheck confirms then clears every visit with one', async () => {
    const { p, library } = await open();
    const more = within(p).getByRole('button', { name: 'More actions for Coco' });
    fireEvent.click(more);
    const actions = more.closest('.ios-swiperow')!.querySelector('.ios-swiperow__actions') as HTMLElement;
    expect(within(actions).getAllByRole('button').map((b) => b.textContent)).toEqual(['Send reminder', 'Clear recheck']);
    fireEvent.click(within(actions).getByRole('button', { name: 'Send reminder' }));
    expect(library.sendReminder).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));

    fireEvent.click(more);
    fireEvent.click(within(actions).getByRole('button', { name: 'Clear recheck' }));
    const alert = await screen.findByRole('alertdialog');
    await act(async () => fireEvent.click(within(alert).getByRole('button', { name: 'Clear recheck' })));
    await waitFor(() => expect(library.clearRecalls).toHaveBeenCalledWith(['c1', 'c2']));
  });

  it('no reminder without an owner email', async () => {
    const { p } = await open();
    const more = within(p).getByRole('button', { name: 'More actions for Max' });
    fireEvent.click(more);
    const actions = more.closest('.ios-swiperow')!.querySelector('.ios-swiperow__actions') as HTMLElement;
    expect(within(actions).getAllByRole('button').map((b) => b.textContent)).toEqual(['Clear recheck']);
  });

  it('tapping a row opens the patient (their visits)', async () => {
    const { p, onOpenChart } = await open();
    fireEvent.click(within(p).getByRole('button', { name: /^Coco/ }));
    const visits = await within(p).findAllByRole('button', { name: /Updated/ });
    expect(visits).toHaveLength(2);
    fireEvent.click(visits[0]);
    await waitFor(() => expect(onOpenChart).toHaveBeenCalledWith('c1'));
  });

  it('empty state', async () => {
    const library = fakeLibrary([ROWS[4]], TODAY);
    renderShell(library, 'rechecks');
    expect(await within(panel('rechecks')).findByText('No rechecks due')).toBeInTheDocument();
  });

  it('refetches when libraryVersion changes', async () => {
    const { library, rerenderWith } = await open();
    const n = (library.listCharts as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    rerenderWith({ ...library, libraryVersion: 3 });
    await waitFor(() => expect((library.listCharts as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(n + 1));
  });
});
