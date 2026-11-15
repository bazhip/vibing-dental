import { normaliseName, patientsMatch } from './patientMatch';

it.each([
  ['Bella', 'Bella Smith', true],
  ['Bella Smith', 'Bella', true],
  ['Zoë', 'zoe', true],
  ['Bella', 'Max', false],
  ['', 'Max', false],
  ['Bella', null, false],
  // whole words only
  ['Max', 'Maxine', false],
  ['Bo', 'Bobby Jones', false],
  ['Maxine', 'Max', false],
  ['Bella', 'Smith, Bella', true],
  ['Bella Rose', 'Bella Smith', false],
])('%s vs %s', (a, b, ok) => expect(patientsMatch(a, b as string | null)).toBe(ok));

it('normaliseName folds case, accents, punctuation and spaces', () => {
  expect(normaliseName('  Zoë   (Smith) ')).toBe('zoe smith');
});
