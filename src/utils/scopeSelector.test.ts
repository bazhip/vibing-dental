import { installScopeSelectorFallback } from './scopeSelector';

// jsdom's selector engine doesn't parse the nesting selector either, so it
// stands in for Safari < 17.2 / Chrome < 120 / Firefox < 117 for free.

const nativeQuerySelector = Element.prototype.querySelector;
const nativeQuerySelectorAll = Element.prototype.querySelectorAll;

afterEach(() => {
  Element.prototype.querySelector = nativeQuerySelector;
  Element.prototype.querySelectorAll = nativeQuerySelectorAll;
});

function grid() {
  const root = document.createElement('div');
  root.innerHTML = '<div role="row"><span tabindex="0">cell</span></div><span>outside</span>';
  return root;
}

test('the cell selector the grid uses fails before the fallback is installed', () => {
  // Old browsers fail one of two ways — a SyntaxError, or (like jsdom here)
  // accepting the selector and quietly matching nothing. Either way the grid
  // never finds the cell it wants to focus.
  let found: Element | null | 'threw';
  try {
    found = grid().querySelector('& > [role="row"] > [tabindex="0"]');
  } catch {
    found = 'threw';
  }
  expect(found).not.toBeInstanceOf(Element);
});

test('rewrites a leading & to :scope', () => {
  installScopeSelectorFallback();
  const root = grid();
  expect(root.querySelector('& > [role="row"] > [tabindex="0"]')?.textContent).toBe('cell');
  // :scope semantics, not a plain descendant match — the child span the
  // grid focuses must not be reachable as `& > span`.
  expect(root.querySelector('& > span')?.textContent).toBe('outside');
});

test('handles every branch of a selector list', () => {
  installScopeSelectorFallback();
  const root = grid();
  expect(root.querySelectorAll('& > [role="row"], & > span')).toHaveLength(2);
});

test('leaves ordinary selectors alone', () => {
  installScopeSelectorFallback();
  const root = grid();
  expect(root.querySelector('[tabindex="0"]')?.textContent).toBe('cell');
  expect(root.querySelectorAll('span')).toHaveLength(2);
});

test('does not patch a browser that understands the nesting selector', () => {
  // Stand in for a modern engine: the probe's `& > i > b` finds its match.
  const supported = function (this: Element, selector: string) {
    return nativeQuerySelector.call(this, selector.replace(/^&/, ':scope'));
  } as typeof Element.prototype.querySelector;
  Element.prototype.querySelector = supported;
  installScopeSelectorFallback();
  expect(Element.prototype.querySelector).toBe(supported);
});
