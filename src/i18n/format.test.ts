import { formatDate, formatDateTime, formatList, formatNumber } from './format';

// Intl uses narrow / no-break spaces in some locales; compare against plain spaces.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

test('formats a yyyy-mm-dd date as a local date in the given language', () => {
  expect(formatDate('2026-07-19', 'medium', 'fr')).toBe('19 juil. 2026');
  expect(formatDate('2026-07-19', 'long', 'de')).toBe('19. Juli 2026');
});
test('accepts a Date', () => {
  expect(formatDate(new Date(2026, 6, 19), 'long', 'en')).toBe('19 July 2026');
});
test('formats numbers in the given language', () => {
  expect(plain(formatNumber(1234.5, undefined, 'fr'))).toBe('1 234,5');
});
test('formats lists without an Oxford comma in English', () => {
  expect(formatList(['a', 'b', 'c'], 'en')).toBe('a, b and c');
  expect(formatList(['a', 'b'], 'it')).toBe('a e b');
});
test('unparseable dates are returned unchanged', () => {
  expect(formatDate('nonsense')).toBe('nonsense');
  expect(formatDateTime('nonsense')).toBe('nonsense');
});
test('formats a date and time', () => {
  expect(formatDateTime(new Date(2026, 6, 19, 14, 5), 'de')).toMatch(/19\.07\.26.*14:05/);
});
test('real languages are never wrapped', () => {
  expect(formatList(['a', 'b'], 'fr')).toBe('a et b');
});
