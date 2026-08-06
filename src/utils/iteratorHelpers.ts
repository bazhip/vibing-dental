/**
 * Polyfill for the ES2025 iterator helpers (`Iterator.prototype.map`,
 * `.toArray`, …).
 *
 * react-data-grid 7 builds its viewport columns and cells as generators and
 * then chains helpers onto them — `iterateOverViewportColumns(-1).toArray()`.
 * Those methods only exist in Chrome/Edge 122+, Firefox 131+ and Safari 18.4+,
 * so on anything older the grid dies on first render with
 * "toArray is not a function". Installing the missing methods on the shared
 * %IteratorPrototype% fixes every generator in the app at once, including the
 * ones inside the grid's bundled code that we can't reach otherwise.
 *
 * Each method is only defined when the browser lacks it, so modern engines
 * keep their native (faster, spec-exact) implementations.
 */

type UnknownIterator = Iterator<unknown> & Iterable<unknown>;

function counted(fn: unknown, name: string): (value: unknown, index: number) => unknown {
  if (typeof fn !== 'function') {
    throw new TypeError(`${name} expects a function`);
  }
  return fn as (value: unknown, index: number) => unknown;
}

function toPositiveInteger(limit: unknown, name: string): number {
  const n = Math.trunc(Number(limit));
  if (Number.isNaN(n) || n < 0) {
    throw new RangeError(`${name} expects a non-negative number`);
  }
  return n;
}

// `for...of` over the source iterator is what closes it (calls its `return`)
// when a consumer stops early — `take`, `find`, `some` and friends all rely
// on that rather than draining the source.
const helpers = {
  *map(this: UnknownIterator, fn: unknown) {
    const mapper = counted(fn, 'map');
    let index = 0;
    for (const value of this) yield mapper(value, index++);
  },

  *filter(this: UnknownIterator, fn: unknown) {
    const predicate = counted(fn, 'filter');
    let index = 0;
    for (const value of this) {
      if (predicate(value, index++)) yield value;
    }
  },

  *take(this: UnknownIterator, limit: unknown) {
    let remaining = toPositiveInteger(limit, 'take');
    if (remaining === 0) return;
    for (const value of this) {
      yield value;
      if (--remaining === 0) return;
    }
  },

  *drop(this: UnknownIterator, limit: unknown) {
    let remaining = toPositiveInteger(limit, 'drop');
    for (const value of this) {
      if (remaining > 0) {
        remaining--;
        continue;
      }
      yield value;
    }
  },

  *flatMap(this: UnknownIterator, fn: unknown) {
    const mapper = counted(fn, 'flatMap');
    let index = 0;
    for (const value of this) {
      const mapped = mapper(value, index++);
      if (mapped != null && typeof (mapped as Iterable<unknown>)[Symbol.iterator] === 'function') {
        yield* mapped as Iterable<unknown>;
      } else {
        throw new TypeError('flatMap expects the callback to return an iterable');
      }
    }
  },

  toArray(this: UnknownIterator) {
    return [...this];
  },

  forEach(this: UnknownIterator, fn: unknown) {
    const callback = counted(fn, 'forEach');
    let index = 0;
    for (const value of this) callback(value, index++);
  },

  reduce(this: UnknownIterator, fn: unknown, ...initial: unknown[]) {
    const reducer = counted(fn, 'reduce') as (
      acc: unknown,
      value: unknown,
      index: number
    ) => unknown;
    let hasAccumulator = initial.length > 0;
    let accumulator = initial[0];
    let index = 0;
    for (const value of this) {
      if (hasAccumulator) {
        accumulator = reducer(accumulator, value, index++);
      } else {
        accumulator = value;
        hasAccumulator = true;
        index = 1;
      }
    }
    if (!hasAccumulator) throw new TypeError('reduce of empty iterator with no initial value');
    return accumulator;
  },

  some(this: UnknownIterator, fn: unknown) {
    const predicate = counted(fn, 'some');
    let index = 0;
    for (const value of this) {
      if (predicate(value, index++)) return true;
    }
    return false;
  },

  every(this: UnknownIterator, fn: unknown) {
    const predicate = counted(fn, 'every');
    let index = 0;
    for (const value of this) {
      if (!predicate(value, index++)) return false;
    }
    return true;
  },

  find(this: UnknownIterator, fn: unknown) {
    const predicate = counted(fn, 'find');
    let index = 0;
    for (const value of this) {
      if (predicate(value, index++)) return value;
    }
    return undefined;
  },
};

export function installIteratorHelpers(): void {
  let prototype: object | null = null;
  try {
    // %IteratorPrototype% — shared by array iterators, generators, Map/Set
    // iterators and everything else the language hands back.
    prototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()));
  } catch {
    // Nothing to patch on an engine this exotic; the app is no worse off.
  }
  if (!prototype) return;

  for (const [name, implementation] of Object.entries(helpers)) {
    if (typeof (prototype as Record<string, unknown>)[name] === 'function') continue;
    Object.defineProperty(prototype, name, {
      value: implementation,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
}
