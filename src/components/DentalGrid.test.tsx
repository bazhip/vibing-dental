import React from 'react';
import { vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DentalGrid } from './DentalGrid';
import { getInitialToothData } from '../constants';
import { ToothData } from '../types';
import { installScopeSelectorFallback } from '../utils/scopeSelector';

// react-data-grid measures itself with ResizeObserver; jsdom has none.
beforeAll(() => {
  window.ResizeObserver =
    window.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

  // react-data-grid calls querySelector('& > …'); jsdom resolves only the
  // first level of that, same as browsers without CSS nesting. The app ships
  // a fallback for exactly this — use it here rather than a second shim.
  installScopeSelectorFallback();

  // jsdom has no layout, so scrollIntoView (used when the grid focuses a
  // cell) doesn't exist.
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

function renderGrid(overrides: Partial<React.ComponentProps<typeof DentalGrid>> = {}) {
  const props = {
    toothData: getInitialToothData('canine'),
    onToothDataChange: vi.fn(),
    toothMarks: {},
    onToggleMissing: vi.fn(),
    ...overrides,
  };
  const utils = render(<DentalGrid {...props} />);
  return { ...utils, props };
}

test('renders every tooth row plus the header', () => {
  renderGrid();
  const grid = screen.getByRole('grid');
  // 42 adult canine teeth + 1 header row.
  expect(grid).toHaveAttribute('aria-rowcount', String(42 + 1));
  // Header names include the set-all-teeth button's label — match loosely.
  expect(screen.getByRole('columnheader', { name: /^Mobility/ })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /^PD State/ })).toBeInTheDocument();
});

test('missing checkbox reflects marks and reports toggles', () => {
  const { props } = renderGrid({ toothMarks: { 104: 'missing' } });
  const checkbox104 = screen.getByRole('checkbox', { name: 'Tooth 104 missing' });
  expect(checkbox104).toBeChecked();
  const checkbox101 = screen.getByRole('checkbox', { name: 'Tooth 101 missing' });
  expect(checkbox101).not.toBeChecked();
  fireEvent.click(checkbox101);
  expect(props.onToggleMissing).toHaveBeenCalledWith(101);
});

test('a single click opens the editor and typing commits the value', () => {
  const { props } = renderGrid();
  // Row 1 (after the header) is tooth 101; find its Mobility cell.
  const rows = screen.getAllByRole('row');
  const firstDataRow = rows[1];
  const cells = firstDataRow.querySelectorAll('[role="gridcell"]');
  const mobilityCell = cells[3] as HTMLElement;
  fireEvent.click(mobilityCell);
  // Entering edit mode swaps the cell element for an editor container —
  // re-query the row rather than trusting the stale cell node.
  const editor = firstDataRow.querySelector('.rdg-editor-container input') as HTMLInputElement;
  expect(editor).not.toBeNull();
  fireEvent.change(editor, { target: { value: 'M2' } });
  fireEvent.blur(editor);
  expect(props.onToothDataChange).toHaveBeenCalled();
  const lastCall = (props.onToothDataChange as Mock).mock.calls.at(-1)![0] as ToothData[];
  expect(lastCall.find((t) => t.triadan === 101)?.mobility).toBe('M2');
});

function rowFor(triadan: number): HTMLElement {
  return screen.getAllByRole('row').find((r) =>
    Array.from(r.querySelectorAll('[role="gridcell"]')).some((c) => c.textContent === String(triadan)),
  ) as HTMLElement;
}

test('chart settings can hide columns; the rest still edit', () => {
  renderGrid({ hiddenColumns: ['recession', 'hyperplasia'] });
  expect(screen.queryByRole('columnheader', { name: /^Recession/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: /^Enlargement/ })).not.toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /^Pocket/ })).toBeInTheDocument();
});

test('per-root pockets: a multi-rooted tooth gets one box per root, saved as "MB4 MP5 D6"', () => {
  const { props } = renderGrid({ pocketMode: 'root', species: 'canine' });
  const row = rowFor(108);
  const pocketCell = row.querySelectorAll('[role="gridcell"]')[5] as HTMLElement; // Missing, Tooth, Triadan, Mobility, Recession, Pocket
  fireEvent.click(pocketCell);
  const boxes = ['MB', 'MP', 'D'].map((l) => screen.getByRole('textbox', { name: `Tooth 108 pocket, ${l} root` }));
  fireEvent.change(boxes[0], { target: { value: '4' } });
  fireEvent.change(boxes[1], { target: { value: '5' } });
  fireEvent.change(boxes[2], { target: { value: '6' } });
  fireEvent.keyDown(boxes[2], { key: 'Enter' }); // commit, move down
  const last = (props.onToothDataChange as Mock).mock.calls.at(-1)![0] as ToothData[];
  expect(last.find((t) => t.triadan === 108)?.pocket).toBe('MB4 MP5 D6');
});

test('per-root pockets: single-rooted teeth keep the plain box', () => {
  renderGrid({ pocketMode: 'root', species: 'canine' });
  const row = rowFor(104);
  fireEvent.click(row.querySelectorAll('[role="gridcell"]')[5] as HTMLElement);
  expect(row.querySelector('.rdg-editor-container input')).not.toBeNull();
  expect(screen.queryByRole('textbox', { name: /Tooth 104 pocket, M root/ })).not.toBeInTheDocument();
});

test('per-root pockets: a plain value that can\'t be split keeps the plain editor (nothing lost)', () => {
  const toothData = getInitialToothData('canine').map((t) => (t.triadan === 108 ? { ...t, pocket: '5' } : t));
  renderGrid({ pocketMode: 'root', species: 'canine', toothData });
  const row = rowFor(108);
  fireEvent.click(row.querySelectorAll('[role="gridcell"]')[5] as HTMLElement);
  expect((row.querySelector('.rdg-editor-container input') as HTMLInputElement).value).toBe('5');
});

test('per-root pockets: every multi-rooted tooth shows its root slots before any typing', () => {
  const toothData = getInitialToothData('canine').map((t) => (t.triadan === 106 ? { ...t, pocket: 'M3 D5' } : t));
  renderGrid({ pocketMode: 'root', species: 'canine', toothData });
  expect(screen.getByRole('columnheader', { name: /^Pocket \(per root\)/ })).toBeInTheDocument();
  const row108 = rowFor(108);
  const slots108 = Array.from(row108.querySelectorAll('.dental-grid__slot')).map((s) => s.textContent);
  expect(slots108).toEqual(['MB', 'MP', 'D']); // empty, labelled
  const slots106 = Array.from(rowFor(106).querySelectorAll('.dental-grid__slot')).map((s) => s.textContent);
  expect(slots106).toEqual(['M3', 'D5']);
  expect(rowFor(104).querySelectorAll('.dental-grid__slot')).toHaveLength(0); // single root
});

test('per-root pockets: clicking a root slot opens the editor on that root', () => {
  renderGrid({ pocketMode: 'root', species: 'canine' });
  const row = rowFor(108);
  const slot = row.querySelectorAll('.dental-grid__slot')[2] as HTMLElement; // D
  fireEvent.mouseDown(slot);
  fireEvent.click(slot);
  expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Tooth 108 pocket, D root' }));
});

test('per-root pockets: an old single value on a multi-rooted tooth is labelled as covering all roots', () => {
  const toothData = getInitialToothData('canine').map((t) => (t.triadan === 108 ? { ...t, pocket: '5' } : t));
  renderGrid({ pocketMode: 'root', species: 'canine', toothData });
  expect(rowFor(108).textContent).toContain('all roots');
});

function toothCell(triadan: number): HTMLElement {
  return rowFor(triadan).querySelectorAll('[role="gridcell"]')[2] as HTMLElement; // Triadan
}

test('select several teeth and set one value on all of them (missing teeth skipped)', () => {
  const { props } = renderGrid({ toothMarks: { 103: 'missing' } });
  expect(screen.getByText(/click tooth numbers to select several teeth/)).toBeInTheDocument();
  fireEvent.click(toothCell(101));
  fireEvent.click(toothCell(104), { shiftKey: true }); // range 101–104
  expect(screen.getByText('4 teeth selected')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Column to set' }), { target: { value: 'gingivitis' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  const last = (props.onToothDataChange as Mock).mock.calls.at(-1)![0] as ToothData[];
  const gi = (t: number) => last.find((r) => r.triadan === t)?.gingivitis;
  expect([gi(101), gi(102), gi(104)]).toEqual(['2', '2', '2']);
  expect(gi(103)).toBeUndefined(); // missing
  expect(gi(105)).toBeUndefined(); // not selected
});

test('clicking a selected tooth again deselects it; values out of range are refused', () => {
  renderGrid();
  fireEvent.click(toothCell(101));
  fireEvent.click(toothCell(102));
  fireEvent.click(toothCell(101));
  expect(screen.getByText('1 tooth selected')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Column to set' }), { target: { value: 'gingivitis' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), { target: { value: '9' } });
  expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
});

test('no selection on a view-only chart', () => {
  renderGrid({ readOnly: true });
  fireEvent.click(toothCell(101));
  expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
});

test('Space types a space when the person turns that on', () => {
  const { props } = renderGrid({ spaceMovesDown: false });
  const cell = rowFor(101).querySelectorAll('[role="gridcell"]')[5] as HTMLElement; // Pocket
  fireEvent.click(cell);
  const editor = rowFor(101).querySelector('.rdg-editor-container input') as HTMLInputElement;
  const notPrevented = fireEvent.keyDown(editor, { key: ' ' });
  expect(notPrevented).toBe(true); // left to the input: a space is typed
  fireEvent.change(editor, { target: { value: '4 5 4' } });
  fireEvent.blur(editor);
  const last = (props.onToothDataChange as Mock).mock.calls.at(-1)![0] as ToothData[];
  expect(last.find((t) => t.triadan === 101)?.pocket).toBe('4 5 4');
});

test('Space moves down by default (unchanged)', () => {
  renderGrid();
  const cell = rowFor(101).querySelectorAll('[role="gridcell"]')[5] as HTMLElement;
  fireEvent.click(cell);
  const editor = rowFor(101).querySelector('.rdg-editor-container input') as HTMLInputElement;
  expect(fireEvent.keyDown(editor, { key: ' ' })).toBe(false); // handled: commit + move down
});

test('short-scale columns: tapping a score saves the bare number and opens the same tooth\'s next finding', async () => {
  const { props } = renderGrid();
  fireEvent.click(rowFor(101).querySelectorAll('[role="gridcell"]')[3] as HTMLElement); // Mobility
  fireEvent.click(screen.getByRole('button', { name: 'M2' }));
  const last = (props.onToothDataChange as Mock).mock.calls.at(-1)![0] as ToothData[];
  expect(last.find((t) => t.triadan === 101)?.mobility).toBe('2');
  // Exams go tooth by tooth: Recession on 101 opens next, number pad up.
  const recession = await screen.findByRole('textbox', { name: 'Tooth 101 Recession' });
  expect(recession).toHaveAttribute('inputmode', 'decimal');
});

test('short-scale columns: the last finding wraps to the next tooth\'s first', async () => {
  renderGrid();
  fireEvent.click(rowFor(101).querySelectorAll('[role="gridcell"]')[10] as HTMLElement); // PD State
  fireEvent.click(screen.getByRole('button', { name: 'PD1' }));
  expect(await screen.findByRole('group', { name: 'Tooth 102 Mobility score' })).toBeInTheDocument();
});

test('short-scale columns: "stay put" saves without moving', async () => {
  const { props } = renderGrid({ scoreTapMoves: 'stay' });
  fireEvent.click(rowFor(101).querySelectorAll('[role="gridcell"]')[3] as HTMLElement);
  fireEvent.click(screen.getByRole('button', { name: 'M3' }));
  const last = (props.onToothDataChange as Mock).mock.calls.at(-1)![0] as ToothData[];
  expect(last.find((t) => t.triadan === 101)?.mobility).toBe('3');
  await new Promise((r) => setTimeout(r, 0));
  expect(screen.queryByRole('group', { name: /score/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Tooth 101 Recession' })).not.toBeInTheDocument();
});

test('short-scale columns: "next tooth" sweeps down the column', async () => {
  const { props } = renderGrid({ scoreTapMoves: 'tooth' });
  const mobility101 = rowFor(101).querySelectorAll('[role="gridcell"]')[3] as HTMLElement;
  fireEvent.click(mobility101);
  const group = screen.getByRole('group', { name: 'Tooth 101 Mobility score' });
  const chips = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
  expect(chips).toEqual(['–', 'M0', 'M1', 'M2', 'M3']);
  fireEvent.click(screen.getByRole('button', { name: 'M2' }));
  const last = (props.onToothDataChange as Mock).mock.calls.at(-1)![0] as ToothData[];
  expect(last.find((t) => t.triadan === 101)?.mobility).toBe('2');
  // The next tooth down opens with its own scores, ready for the next tap.
  expect(await screen.findByRole('group', { name: 'Tooth 102 Mobility score' })).toBeInTheDocument();
});

test('short-scale columns: furcation reads F1–F3, and "–" clears a score', () => {
  const toothData = getInitialToothData('canine').map((t) => (t.triadan === 108 ? { ...t, furcation: '2' } : t));
  const { props } = renderGrid({ toothData });
  fireEvent.click(rowFor(108).querySelectorAll('[role="gridcell"]')[6] as HTMLElement); // …, Pocket, Furcation
  expect(screen.getByRole('button', { name: 'F2' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Clear Tooth 108 Furcation' }));
  const last = (props.onToothDataChange as Mock).mock.calls.at(-1)![0] as ToothData[];
  expect(last.find((t) => t.triadan === 108)?.furcation).toBe('');
});

test('millimetre columns keep typing (number pad), with no score chips', () => {
  renderGrid();
  fireEvent.click(rowFor(101).querySelectorAll('[role="gridcell"]')[5] as HTMLElement); // Pocket
  expect(screen.queryByRole('group', { name: /score/ })).not.toBeInTheDocument();
  expect(rowFor(101).querySelector('.rdg-editor-container input')).toHaveAttribute('inputmode', 'decimal');
});

test('phones: short column titles (full name kept for screen readers) and the tooth columns freeze', () => {
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    matches: q.includes('max-width: 1000px'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  try {
    renderGrid();
    const mob = screen.getByRole('columnheader', { name: /^Mobility/ });
    expect(mob).toHaveTextContent(/^Mob/);
    expect(mob).not.toHaveTextContent(/Mobility/);
    expect(screen.getByRole('columnheader', { name: 'Tooth' })).toHaveClass('dental-grid__pin');
  } finally {
    window.matchMedia = original;
  }
});
