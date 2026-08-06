import { installIteratorHelpers } from './iteratorHelpers';

const ITERATOR_PROTOTYPE = Object.getPrototypeOf(
  Object.getPrototypeOf([][Symbol.iterator]())
) as Record<string, unknown>;

const HELPERS = [
  'map',
  'filter',
  'take',
  'drop',
  'flatMap',
  'toArray',
  'forEach',
  'reduce',
  'some',
  'every',
  'find',
];

// The rows/columns react-data-grid renders come out of generators it then
// chains helpers onto, so simulate a browser without them (Safari < 18.4,
// Firefox < 131, Chrome < 122) by stripping the natives for each test.
const saved = new Map<string, PropertyDescriptor | undefined>();

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

function* columns() {
  yield 'tooth';
  yield 'finding';
  yield 'treatment';
}

test('generators lose their helpers without the polyfill', () => {
  // Guards the tests below: if the strip fails they would pass on natives.
  expect(() => (columns() as never as { toArray(): unknown[] }).toArray()).toThrow(TypeError);
});

test('installs toArray on generators', () => {
  installIteratorHelpers();
  expect(columns().toArray()).toEqual(['tooth', 'finding', 'treatment']);
});

test('chains map and filter into toArray, the way the grid renders cells', () => {
  installIteratorHelpers();
  expect(
    columns()
      .map((key, index) => `${index}:${key}`)
      .filter((label) => !label.endsWith('treatment'))
      .toArray()
  ).toEqual(['0:tooth', '1:finding']);
});

test('take and drop are lazy — they stop pulling from the source', () => {
  installIteratorHelpers();
  let pulled = 0;
  function* counted() {
    for (let i = 0; ; i++) {
      pulled++;
      yield i;
    }
  }
  expect(counted().take(3).toArray()).toEqual([0, 1, 2]);
  expect(pulled).toBe(3);
  expect(counted().drop(2).take(2).toArray()).toEqual([2, 3]);
});

test('flatMap flattens one level', () => {
  installIteratorHelpers();
  expect(
    columns()
      .flatMap((key) => [key, key.length])
      .toArray()
  ).toEqual(['tooth', 5, 'finding', 7, 'treatment', 9]);
});

test('reduce, some, every, find and forEach short-circuit as expected', () => {
  installIteratorHelpers();
  expect(columns().reduce((acc, key) => acc + key.length, 0)).toBe(21);
  expect(columns().some((key) => key === 'finding')).toBe(true);
  expect(columns().every((key) => key.length > 3)).toBe(true);
  expect(columns().find((key) => key.startsWith('t'))).toBe('tooth');
  const seen: string[] = [];
  columns().forEach((key) => seen.push(key));
  expect(seen).toEqual(['tooth', 'finding', 'treatment']);
});

test('leaves native helpers alone when the browser already has them', () => {
  const native = () => [];
  Object.defineProperty(ITERATOR_PROTOTYPE, 'toArray', {
    value: native,
    writable: true,
    configurable: true,
  });
  installIteratorHelpers();
  expect(ITERATOR_PROTOTYPE.toArray).toBe(native);
});

test('the helpers are non-enumerable, so for-in over an iterator stays clean', () => {
  installIteratorHelpers();
  expect(Object.keys(ITERATOR_PROTOTYPE)).toEqual([]);
});
