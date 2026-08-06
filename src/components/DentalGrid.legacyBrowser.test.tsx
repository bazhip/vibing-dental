import React from 'react';
import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DentalGrid } from './DentalGrid';
import { getInitialToothData } from '../constants';
import { installIteratorHelpers } from '../utils/iteratorHelpers';
import { installScopeSelectorFallback } from '../utils/scopeSelector';

// Reproduces the production crash reported from an older browser:
// "p(...).toArray is not a function" inside a react-data-grid useMemo.
// The grid chains ES2025 iterator helpers onto its column generators, so
// strip those helpers to stand in for Safari < 18.4 / Firefox < 131 /
// Chrome < 122 and check the grid both dies without the polyfill and
// survives with it.

const ITERATOR_PROTOTYPE = Object.getPrototypeOf(
  Object.getPrototypeOf([][Symbol.iterator]())
) as Record<string, unknown>;

const HELPERS = ['map', 'filter', 'take', 'drop', 'flatMap', 'toArray', 'forEach', 'some', 'every'];
const saved = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  window.ResizeObserver =
    window.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  installScopeSelectorFallback();
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

beforeEach(() => {
  for (const name of HELPERS) {
    saved.set(name, Object.getOwnPropertyDescriptor(ITERATOR_PROTOTYPE, name));
    delete ITERATOR_PROTOTYPE[name];
  }
});

afterEach(() => {
  for (const name of HELPERS) {
    delete ITERATOR_PROTOTYPE[name];
    const descriptor = saved.get(name);
    if (descriptor) Object.defineProperty(ITERATOR_PROTOTYPE, name, descriptor);
  }
});

function renderGrid() {
  return render(
    <DentalGrid
      toothData={getInitialToothData('canine')}
      onToothDataChange={vi.fn()}
      toothMarks={{}}
      onToggleMissing={vi.fn()}
    />
  );
}

test('the grid crashes on a browser without iterator helpers', () => {
  // React logs the render error on its way out; keep the run quiet.
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect(renderGrid).toThrow(/toArray is not a function/);
  } finally {
    consoleError.mockRestore();
  }
});

test('the polyfill lets the same browser render the grid', () => {
  installIteratorHelpers();
  renderGrid();
  expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', String(42 + 1));
});
