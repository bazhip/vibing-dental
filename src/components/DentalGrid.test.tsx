import React from 'react';
import { vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DentalGrid } from './DentalGrid';
import { getInitialToothData } from '../constants';
import { ToothData } from '../types';

// react-data-grid measures itself with ResizeObserver; jsdom has none.
beforeAll(() => {
  window.ResizeObserver =
    window.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

  // react-data-grid calls querySelector('& > …') (CSS-nesting relative
  // selectors — fine in real browsers, unsupported by jsdom's selector
  // engine). Rewrite to the equivalent :scope form for tests.
  const originalQuerySelector = Element.prototype.querySelector;
  // eslint-disable-next-line no-extend-native
  Element.prototype.querySelector = function (this: Element, selector: string) {
    return originalQuerySelector.call(this, selector.replace(/^\s*&\s*/, ':scope '));
  } as typeof Element.prototype.querySelector;

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
