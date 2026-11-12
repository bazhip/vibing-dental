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
