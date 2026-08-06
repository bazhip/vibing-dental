/**
 * Fallback for the CSS nesting selector inside the DOM selector APIs.
 *
 * react-data-grid focuses cells with `gridEl.querySelector('& > [role="row"]
 * > [tabindex="0"]')`. A leading `&` outside a nested rule means `:scope`,
 * but only engines that shipped CSS nesting understand it — Chrome 120+,
 * Safari 17.2+, Firefox 117+. Older ones either throw a SyntaxError or
 * quietly match nothing, and because the call sits in the grid's focus
 * layout effect, that breaks every cell click and arrow-key move.
 *
 * So the probe below checks that `&` actually *matches*, not merely that it
 * parses, and only then leaves the native methods alone. Otherwise rewrite
 * a leading `&` to the `:scope` it stands for.
 */

const LEADING_NESTING_SELECTOR = /(^|,)(\s*)&/g;

function toScope(selector: string): string {
  return selector.replace(LEADING_NESTING_SELECTOR, '$1$2:scope');
}

export function installScopeSelectorFallback(): void {
  if (typeof document === 'undefined') return;

  try {
    // Mirror the shape the grid actually asks for: two child combinators,
    // on a detached element. Engines with partial support (jsdom among
    // them) resolve a single `& > x` but miss the nested one.
    const probe = document.createElement('div');
    const child = document.createElement('i');
    child.append(document.createElement('b'));
    probe.append(child);
    if (probe.querySelector('& > i > b') !== null) return;
  } catch {
    // Selector engine predates CSS nesting — patch below.
  }

  const nativeQuerySelector = Element.prototype.querySelector;
  const nativeQuerySelectorAll = Element.prototype.querySelectorAll;

  Element.prototype.querySelector = function querySelector(this: Element, selector: string) {
    return nativeQuerySelector.call(this, toScope(selector));
  } as typeof Element.prototype.querySelector;

  Element.prototype.querySelectorAll = function querySelectorAll(this: Element, selector: string) {
    return nativeQuerySelectorAll.call(this, toScope(selector));
  } as typeof Element.prototype.querySelectorAll;
}
