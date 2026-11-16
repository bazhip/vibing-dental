import { normaliseName, ownerSurname, patientsMatch, patientsMatchStrict } from './patientMatch';

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

describe('ownerSurname', () => {
  it.each([
    ['Jane Smith', ['smith']],
    ['Mrs Jane Smith', ['smith']],
    ['Dr. Jane Smith', ['smith']],
    ['Smith, Jane', ['smith']],
    ['Van Der Berg, Anna', ['van', 'der', 'berg']],
    ['Smith', ['smith']],
    ['', []],
    [null, []],
  ])('%s', (owner, out) => expect(ownerSurname(owner as string | null)).toEqual(out));
});

describe('patientsMatchStrict', () => {
  it.each([
    // equal once normalised
    ['Bella', 'Jane Smith', 'bella', true],
    ['Zoë Smith', '', 'Zoe Smith', true],
    // chart name + owner surname, in either order
    ['Bella', 'Jane Smith', 'Bella Smith', true],
    ['Bella', 'Mrs Jane Smith', 'Smith, Bella', true],
    ['Bella', 'Smith, Jane', 'Bella Smith', true],
    // a one-word chart name is not enough on its own
    ['Bella', 'Jane Jones', 'Bella Smith', false],
    ['Bella', '', 'Bella Smith', false],
    ['Bella Smith', 'Jane Smith', 'Bella', false],
    ['Max', 'Jane Smith', 'Maxine Smith', false],
    ['Bella', 'Jane Smith', 'Bella Rose Smith', false],
    ['Bella', 'Jane Smith', null, false],
    ['', 'Jane Smith', 'Smith', false],
  ])('%s (owner %s) vs %s', (chart, owner, ezyvet, ok) =>
    expect(patientsMatchStrict(chart, owner, ezyvet as string | null)).toBe(ok));
});
